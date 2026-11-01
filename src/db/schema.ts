// ============================================================
// SCHEMA (PostgreSQL via Drizzle) — camada "nuvem" da Lousa.
// O app é local-first (IndexedDB). Quando a API responde, as
// lousas são espelhadas aqui; quando não, nada quebra.
// ============================================================
import { bigint, boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const lousas = pgTable("lousas", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull().default("Minha lousa"),
  arquivada: boolean("arquivada").notNull().default(false),
  qtdItens: integer("qtd_itens").notNull().default(0),
  criadoEm: bigint("criado_em", { mode: "number" }).notNull(),
  alteradoEm: bigint("alterado_em", { mode: "number" }).notNull(),
  // Documento completo da lousa (itens, regiões, conectores, config…)
  dados: jsonb("dados").notNull(),
});

export const imagens = pgTable("imagens", {
  id: text("id").primaryKey(),
  mime: text("mime").notNull().default("image/webp"),
  tamanho: integer("tamanho").notNull().default(0),
  criadoEm: bigint("criado_em", { mode: "number" }).notNull(),
  // Conteúdo em base64 (imagens já são reduzidas no cliente antes de subir)
  base64: text("base64").notNull(),
});

export type LousaRow = typeof lousas.$inferSelect;
export type ImagemRow = typeof imagens.$inferSelect;
