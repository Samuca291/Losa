// Status da nuvem: o cliente chama isto ao iniciar. Se falhar ou demorar,
// o app continua 100% local (IndexedDB). "modo" diz se é PostgreSQL ou o
// banco local embutido do servidor (PGlite).
import { garantirTabelas, obterBanco } from "@/db";
import { lousas } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
let tabelasOk = false;

export async function GET() {
  try {
    const { db, modo } = await obterBanco();
    if (!tabelasOk) { await garantirTabelas().catch(() => {}); tabelasOk = true; }
    const [r] = await db.select({ total: sql<number>`count(*)::int`, ultima: sql<number>`coalesce(max(${lousas.alteradoEm}), 0)::bigint` }).from(lousas);
    return Response.json({ ok: true, modo, total: Number(r?.total ?? 0), ultimaAlteracao: Number(r?.ultima ?? 0), agora: Date.now() });
  } catch (e) {
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 503 });
  }
}
