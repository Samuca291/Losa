// ============================================================
// BANCO DE DADOS (servidor) — três modos, escolhidos em tempo de execução:
//  1. "postgres": DATABASE_URL definido → PostgreSQL (nuvem/local).
//  2. "local":    sem DATABASE_URL → PGlite (Postgres embutido em WASM)
//                 gravando em disco em .data/lousa-pglite. Nada a instalar.
//  3. "nenhum":   se nem isso funcionar, a API responde ok:false e o app
//                 segue 100 % local no navegador (IndexedDB).
// A conexão é PREGUIÇOSA: importar este módulo nunca lança erro.
// ============================================================
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export type ModoBanco = "postgres" | "local";
export type BancoDados = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface Banco { db: BancoDados; modo: ModoBanco }

const g = globalThis as typeof globalThis & { __lousaBanco?: Promise<Banco> | null };

const SQL_TABELAS = `
CREATE TABLE IF NOT EXISTS lousas (
  id text PRIMARY KEY,
  nome text NOT NULL DEFAULT 'Minha lousa',
  arquivada boolean NOT NULL DEFAULT false,
  qtd_itens integer NOT NULL DEFAULT 0,
  criado_em bigint NOT NULL,
  alterado_em bigint NOT NULL,
  dados jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS imagens (
  id text PRIMARY KEY,
  mime text NOT NULL DEFAULT 'image/webp',
  tamanho integer NOT NULL DEFAULT 0,
  criado_em bigint NOT NULL,
  base64 text NOT NULL
);`;

async function conectarPostgres(url: string): Promise<Banco> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max: 5 });
  const db = drizzle(pool, { schema });
  await db.execute(sql`select 1`);
  return { db: db as unknown as BancoDados, modo: "postgres" };
}

async function conectarLocal(): Promise<Banco> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const dir = process.env.LOUSA_DB_DIR || path.join(process.cwd(), ".data", "lousa-pglite");
  fs.mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const cliente = new PGlite(dir);
  await cliente.waitReady;
  await cliente.exec(SQL_TABELAS);
  const db = drizzle(cliente, { schema });
  return { db: db as unknown as BancoDados, modo: "local" };
}

/** Obtém (e memoriza) a conexão. Lança erro só se NENHUM modo funcionar. */
export function obterBanco(): Promise<Banco> {
  if (g.__lousaBanco) return g.__lousaBanco;
  const url = process.env.DATABASE_URL?.trim();
  const p = (url ? conectarPostgres(url).catch(async (e) => { console.warn("[lousa] PostgreSQL indisponível, usando banco local embutido:", (e as Error).message); return conectarLocal(); }) : conectarLocal())
    .catch((e) => { g.__lousaBanco = null; throw e; });
  g.__lousaBanco = p;
  return p;
}

/** Garante as tabelas no Postgres (idempotente) — útil quando drizzle-kit push não foi executado. */
export async function garantirTabelas(): Promise<void> {
  const { db, modo } = await obterBanco();
  if (modo === "postgres") { for (const stmt of SQL_TABELAS.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(sql.raw(stmt)); }
}
