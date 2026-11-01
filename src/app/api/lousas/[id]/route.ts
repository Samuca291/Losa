// Uma lousa completa: ler, gravar (upsert) e excluir.
import { obterBanco } from "@/db";
import { lousas } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
const idValido = (id: string) => /^[\w-]{1,64}$/.test(id);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return Response.json({ ok: false, erro: "id inválido" }, { status: 400 });
  try {
    const { db } = await obterBanco();
    const [l] = await db.select().from(lousas).where(eq(lousas.id, id)).limit(1);
    if (!l) return Response.json({ ok: false, erro: "não encontrada" }, { status: 404 });
    return Response.json({ ok: true, lousa: l.dados, alteradoEm: l.alteradoEm });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 503 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return Response.json({ ok: false, erro: "id inválido" }, { status: 400 });
  try {
    const { db } = await obterBanco();
    const texto = await req.text();
    if (texto.length > 60 * 1024 * 1024) return Response.json({ ok: false, erro: "Lousa grande demais" }, { status: 413 });
    const l = JSON.parse(texto) as { nome?: string; arquivada?: boolean; criadoEm?: number; alteradoEm?: number; doc?: { itens?: Record<string, unknown> } };
    const agora = Date.now();
    const linha = {
      id,
      nome: String(l.nome ?? "Minha lousa").slice(0, 120),
      arquivada: !!l.arquivada,
      qtdItens: Object.keys(l.doc?.itens ?? {}).length,
      criadoEm: Number(l.criadoEm) || agora,
      alteradoEm: Number(l.alteradoEm) || agora,
      dados: { ...l, id } as unknown as Record<string, unknown>,
    };
    const forcar = new URL(req.url).searchParams.get("forcar") === "1";
    await db
      .insert(lousas)
      .values(linha)
      .onConflictDoUpdate({
        target: lousas.id,
        set: { nome: linha.nome, arquivada: linha.arquivada, qtdItens: linha.qtdItens, alteradoEm: linha.alteradoEm, dados: linha.dados },
        setWhere: forcar ? undefined : sql`${lousas.alteradoEm} <= ${linha.alteradoEm}`,
      });
    const [atual] = await db.select({ alteradoEm: lousas.alteradoEm }).from(lousas).where(eq(lousas.id, id)).limit(1);
    return Response.json({ ok: true, alteradoEm: atual?.alteradoEm ?? linha.alteradoEm, conflito: (atual?.alteradoEm ?? 0) > linha.alteradoEm });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return Response.json({ ok: false, erro: "id inválido" }, { status: 400 });
  try {
    const { db } = await obterBanco();
    await db.delete(lousas).where(eq(lousas.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
