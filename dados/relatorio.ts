// ============================================================
// DADOS · RELATÓRIO DE VALIDAÇÃO
// Nada é descartado em silêncio: toda correção, descarte ou valor
// ignorado vira uma mensagem com o CAMINHO exato no JSON.
// ============================================================
import { LIMITES } from './tipos';

/**
 * erro     → impede a importação (ex.: JSON inválido, versão mais nova)
 * aviso    → algo foi descartado ou trocado por um padrão (ex.: cor inválida)
 * correcao → ajuste automático sem perda relevante (ex.: id gerado, número limitado)
 * info     → observação útil (ex.: chave desconhecida ignorada)
 */
export type Severidade = 'erro' | 'aviso' | 'correcao' | 'info';

export interface Mensagem { sev: Severidade; caminho: string; texto: string }

export const ROTULO_SEVERIDADE: Record<Severidade, string> = { erro: 'Erro', aviso: 'Aviso', correcao: 'Correção automática', info: 'Informação' };
export const ICONE_SEVERIDADE: Record<Severidade, string> = { erro: '⛔', aviso: '⚠️', correcao: '🔧', info: 'ℹ️' };

export class Relatorio {
  readonly mensagens: Mensagem[] = [];
  readonly contagem: Record<Severidade, number> = { erro: 0, aviso: 0, correcao: 0, info: 0 };
  omitidas = 0;
  private readonly limite: number;
  constructor(limite: number = LIMITES.mensagensRelatorio) { this.limite = limite; }

  add(sev: Severidade, caminho: string, texto: string) {
    this.contagem[sev]++;
    if (this.mensagens.length < this.limite) this.mensagens.push({ sev, caminho, texto });
    else this.omitidas++;
  }
  erro(caminho: string, texto: string) { this.add('erro', caminho, texto); }
  aviso(caminho: string, texto: string) { this.add('aviso', caminho, texto); }
  correcao(caminho: string, texto: string) { this.add('correcao', caminho, texto); }
  info(caminho: string, texto: string) { this.add('info', caminho, texto); }

  get temErros() { return this.contagem.erro > 0; }
  get total() { return this.contagem.erro + this.contagem.aviso + this.contagem.correcao + this.contagem.info; }
  /** Mensagens de uma severidade (útil em testes). */
  de(sev: Severidade) { return this.mensagens.filter((m) => m.sev === sev); }
  /** Procura uma mensagem por trecho do texto ou do caminho (útil em testes). */
  contem(trecho: string, sev?: Severidade) { const t = trecho.toLowerCase(); return this.mensagens.some((m) => (!sev || m.sev === sev) && (m.texto.toLowerCase().includes(t) || m.caminho.toLowerCase().includes(t))); }
}

// ---------- Sugestões para chaves digitadas errado ----------
/** Distância de Damerau-Levenshtein (OSA): trocar duas letras de lugar ("postti") custa 1, não 2. */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m = a.length, n = b.length; const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const custo = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}
const normalizarChave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** "temas" → "tema"; "cor_fundo" → "corFundo". Retorna null se nada for parecido o bastante. */
export function sugerirChave(chave: string, candidatas: readonly string[]): string | null {
  const alvo = normalizarChave(chave); let melhor: string | null = null; let dist = 99;
  for (const c of candidatas) {
    const d = normalizarChave(c) === alvo ? 0 : distancia(alvo, normalizarChave(c));
    if (d < dist) { dist = d; melhor = c; }
  }
  return dist <= Math.max(1, Math.min(2, Math.floor(alvo.length / 3))) ? melhor : null;
}

/** Registra as chaves desconhecidas de um objeto, com sugestão quando houver. */
export function avisarChavesDesconhecidas(obj: Record<string, unknown>, conhecidas: readonly string[], caminho: string, rel?: Relatorio) {
  if (!rel) return;
  const set = new Set(conhecidas);
  for (const k of Object.keys(obj)) {
    if (set.has(k)) continue;
    const s = sugerirChave(k, conhecidas);
    rel.info(caminho ? `${caminho}.${k}` : k, s ? `Chave desconhecida ignorada. Você quis dizer "${s}"?` : 'Chave desconhecida ignorada.');
  }
}
