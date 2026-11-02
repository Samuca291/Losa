// ============================================================
// DADOS · TIPOS E CONSTANTES DO FORMATO DE ARQUIVO
// Fonte única dos identificadores, versões e limites usados por
// importação, exportação, validação, testes e pelo guia do JSON.
// ============================================================
import type { Lousa } from '../types';

/** Identificador do envelope oficial de backup (arquivo .json exportado). */
export const FORMATO_BACKUP = 'lousa-estudos/backup';
/** Identificador opcional do formato simplificado, escrito à mão. */
export const FORMATO_AUTORIA = 'lousa-estudos/autoria';
/** Campo `tipo` dos arquivos antigos (v1). Continua sendo gravado para compatibilidade. */
export const TIPO_LEGADO = 'lousa-estudos';
/** Versão do ENVELOPE (o "pacote" do arquivo). A versão do documento da lousa é VERSAO_FORMATO (types.ts). */
export const VERSAO_ENVELOPE = 2;
export const NOME_APP = 'Lousa Digital de Estudos';
export const VERSAO_APP = '2.1.0';

/** Limites defensivos: protegem a aba contra arquivos gigantes, corrompidos ou maliciosos. */
export const LIMITES = {
  bytesArquivo: 200 * 1024 * 1024,
  bytesImagem: 15 * 1024 * 1024,
  imagens: 2000,
  lousasPorPacote: 200,
  itens: 20_000,
  regioes: 5_000,
  conectores: 20_000,
  camadas: 50,
  pontos: 5_000,
  tracos: 500,
  html: 100_000,
  profundidadeJSON: 100,
  mensagensRelatorio: 400,
  edital: 2_000,
  questoes: 5_000,
  lixeira: 500,
  visoes: 50,
  modelos: 50,
  legenda: 30,
  etiquetas: 50,
  tarefas: 200,
  linhasTabela: 100,
  colunasTabela: 30,
  profundidadeDivisao: 6,
  filhosDivisao: 100,
} as const;

/** Como o arquivo foi reconhecido. */
export type TipoFormato = 'backup' | 'pacote' | 'legado' | 'lousa-interna' | 'autoria' | 'lista-itens';

export const DESCRICAO_FORMATO: Record<TipoFormato, string> = {
  backup: 'Backup oficial (envelope v2) de uma lousa',
  pacote: 'Pacote com várias lousas (backup completo)',
  legado: 'Backup antigo (envelope v1) — compatível',
  'lousa-interna': 'Documento interno de lousa (sem envelope)',
  autoria: 'Formato simplificado (escrito à mão)',
  'lista-itens': 'Lista de itens (array JSON)',
};

export interface ResumoLousa {
  id: string;
  nome: string;
  itens: number;
  regioes: number;
  conectores: number;
  camadas: number;
  imagens: number;
  edital: number;
  questoes: number;
  lixeira: number;
  cartoes: number;
}

export interface IntegridadeEnvelope {
  algoritmo: 'SHA-256';
  /** O hash cobre exatamente: JSON.stringify([lousa ?? null, lousas ?? null, imagens]) */
  escopo: 'conteudo';
  hash: string;
}

export interface EnvelopeBackup {
  formato: typeof FORMATO_BACKUP;
  versao: number;
  tipo: typeof TIPO_LEGADO;
  aplicativo: { nome: string; versao: string };
  exportadoEm: string;
  conteudo: 'lousa' | 'pacote';
  lousa?: Lousa;
  lousas?: Lousa[];
  imagens: Record<string, string>;
  resumo: { lousas: number; itens: number; regioes: number; conectores: number; imagens: number; bytesImagens: number };
  integridade?: IntegridadeEnvelope;
}

export type EstadoIntegridade = 'verificada' | 'divergente' | 'ausente';

export function resumirLousa(l: Lousa): ResumoLousa {
  const itens = Object.values(l.doc.itens);
  const imagens = new Set<string>();
  for (const it of itens) if (it.imagemId) imagens.add(it.imagemId);
  for (const e of l.lixeira) if (e.item.imagemId) imagens.add(e.item.imagemId);
  return {
    id: l.id, nome: l.nome, itens: itens.length, regioes: Object.keys(l.doc.regioes).length,
    conectores: Object.keys(l.doc.conectores).length, camadas: l.doc.camadas.length, imagens: imagens.size,
    edital: l.edital.length, questoes: l.questoes.length, lixeira: l.lixeira.length,
    cartoes: itens.filter((i) => i.verso !== undefined || i.revisao.ativa || i.tipo === 'cloze').length,
  };
}

/** Ids de imagens usados por uma lousa (itens e lixeira). */
export function imagensDaLousa(l: Lousa): Set<string> {
  const s = new Set<string>();
  for (const it of Object.values(l.doc.itens)) if (it.imagemId) s.add(it.imagemId);
  for (const e of l.lixeira) if (e.item.imagemId) s.add(e.item.imagemId);
  return s;
}

/** Texto canônico coberto pelo hash de integridade. Determinístico: mesma ordem de chaves do JSON.stringify. */
export const conteudoCanonico = (env: { lousa?: unknown; lousas?: unknown; imagens?: unknown }) =>
  JSON.stringify([env.lousa ?? null, env.lousas ?? null, env.imagens ?? {}]);
