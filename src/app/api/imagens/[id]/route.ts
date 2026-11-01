// Imagens (base64) espelhadas na nuvem.
import { obterBanco } from "@/db";
import { imagens } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
const idValido = (id: string) => /^[\w-]{1,64}$/.test(id);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return Response.json({ ok: false }, { status: 400 });
  try {
    const { db } = await obterBanco();
    const [img] = await db.select().from(imagens).where(eq(imagens.id, id)).limit(1);
    if (!img) return Response.json({ ok: false, erro: "não encontrada" }, { status: 404 });
    return Response.json({ ok: true, mime: img.mime, base64: img.base64 });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 503 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return Response.json({ ok: false }, { status: 400 });
  try {
    const { db } = await obterBanco();
    const body = (await req.json()) as { mime?: string; base64?: string };
    if (typeof body.base64 !== "string" || body.base64.length > 12 * 1024 * 1024) return Response.json({ ok: false, erro: "imagem inválida ou grande demais" }, { status: 413 });
    const mime = /^image\/(png|jpeg|webp|gif)$/.test(body.mime ?? "") ? body.mime! : "image/webp";
    await db.insert(imagens).values({ id, mime, base64: body.base64, tamanho: body.base64.length, criadoEm: Date.now() }).onConflictDoNothing();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idValido(id)) return Response.json({ ok: false }, { status: 400 });
  try { const { db } = await obterBanco(); await db.delete(imagens).where(eq(imagens.id, id)); return Response.json({ ok: true }); }
  catch (e) { return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 }); }
}
