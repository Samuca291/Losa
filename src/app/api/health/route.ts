// Saúde do servidor. O app é local-first: a resposta é 200 mesmo sem banco,
// informando em "banco" qual modo está ativo (postgres | local | nenhum).
import { obterBanco } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { db, modo } = await obterBanco();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, banco: modo });
  } catch (e) {
    return Response.json({ ok: true, banco: "nenhum", aviso: (e as Error).message });
  }
}
