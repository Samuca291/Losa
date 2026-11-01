// Lista (metadados) e upsert em lote de lousas.
import { obterBanco } from "@/db";
import { lousas } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
const LIMITE_BYTES = 60 * 1024 * 1024;

export async function GET() {
  try {
    const { db } = await obterBanco();
    const lista = await db
      .select({ id: lousas.id, nome: lousas.nome, arquivada: lousas.arquivada, qtdItens: lousas.qtdItens, criadoEm: lousas.criadoEm, alteradoEm: lousas.alteradoEm })
      .from(lousas)
      .orderBy(desc(lousas.alteradoEm));
    return Response.json({ ok: true, lousas: lista });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 503 });
  }
}

/** Upsert em lote: body = { lousas: Lousa[] } */
export async function POST(req: Request) {
  try {
    const { db } = await obterBanco();
    const texto = await req.text();
    if (texto.length > LIMITE_BYTES) return Response.json({ ok: false, erro: "Carga grande demais" }, { status: 413 });
    const body = JSON.parse(texto) as { lousas?: unknown[] };
    const lista = Array.isArray(body.lousas) ? body.lousas : [];
    let gravadas = 0;
    for (const raw of lista.slice(0, 50)) {
      const l = raw as { id?: string; nome?: string; arquivada?: boolean; criadoEm?: number; alteradoEm?: number; doc?: { itens?: Record<string, unknown> } };
      if (!l || typeof l.id !== "string" || !/^[\w-]{1,64}$/.test(l.id)) continue;
      const agora = Date.now();
      const linha = {
        id: l.id,
        nome: String(l.nome ?? "Minha lousa").slice(0, 120),
        arquivada: !!l.arquivada,
        qtdItens: Object.keys(l.doc?.itens ?? {}).length,
        criadoEm: Number(l.criadoEm) || agora,
        alteradoEm: Number(l.alteradoEm) || agora,
        dados: l as unknown as Record<string, unknown>,
      };
      await db
        .insert(lousas)
        .values(linha)
        .onConflictDoUpdate({
          target: lousas.id,
          set: { nome: linha.nome, arquivada: linha.arquivada, qtdItens: linha.qtdItens, alteradoEm: linha.alteradoEm, dados: linha.dados },
          // só sobrescreve se a versão enviada for mais nova (ou igual)
          setWhere: sql`${lousas.alteradoEm} <= ${linha.alteradoEm}`,
        });
      gravadas++;
    }
    return Response.json({ ok: true, gravadas });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
