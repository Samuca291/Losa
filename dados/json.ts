// ============================================================
// DADOS · LEITURA SEGURA DE JSON
// - Remove BOM, rejeita chaves perigosas (__proto__, constructor,
//   prototype) e profundidade excessiva.
// - Quando o JSON é inválido, um verificador próprio aponta LINHA,
//   COLUNA e a causa provável em português (o JSON.parse de cada
//   navegador dá mensagens diferentes; o Safari nem informa posição).
// ============================================================
import { LIMITES } from './tipos';

export interface ErroSintaxe { mensagem: string; linha: number; coluna: number; posicao: number; trecho: string; marcador: string }
export type ResultadoJSON = { ok: true; valor: unknown } | { ok: false; erro: ErroSintaxe };

const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

export function lerJSON(textoBruto: string): ResultadoJSON {
  const texto = textoBruto.charCodeAt(0) === 0xfeff ? textoBruto.slice(1) : textoBruto;
  if (!texto.trim()) return { ok: false, erro: montarErro(texto, 0, 'O conteúdo está vazio.') };
  let valor: unknown;
  try {
    valor = JSON.parse(texto, (k, v) => (CHAVES_PROIBIDAS.has(k) ? undefined : v));
  } catch {
    return { ok: false, erro: localizarErro(texto) };
  }
  const prof = profundidade(valor);
  if (prof > LIMITES.profundidadeJSON) return { ok: false, erro: montarErro(texto, 0, `O JSON tem ${prof} níveis de aninhamento; o limite é ${LIMITES.profundidadeJSON}.`) };
  return { ok: true, valor };
}

/** Profundidade de aninhamento, calculada de forma iterativa (sem risco de estourar a pilha). */
export function profundidade(raiz: unknown): number {
  let max = 0; const pilha: [unknown, number][] = [[raiz, 1]];
  while (pilha.length) {
    const [v, d] = pilha.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (d > max) max = d;
    if (max > LIMITES.profundidadeJSON) return max;
    for (const filho of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) if (filho !== null && typeof filho === 'object') pilha.push([filho, d + 1]);
  }
  return max;
}

function montarErro(texto: string, pos: number, mensagem: string): ErroSintaxe {
  const p = Math.max(0, Math.min(pos, texto.length));
  const antes = texto.slice(0, p); const linha = (antes.match(/\n/g)?.length ?? 0) + 1;
  const inicioLinha = antes.lastIndexOf('\n') + 1; const fimLinha = texto.indexOf('\n', p) === -1 ? texto.length : texto.indexOf('\n', p);
  const coluna = p - inicioLinha + 1;
  let trecho = texto.slice(inicioLinha, fimLinha).replace(/\t/g, ' '); let col = coluna - 1;
  if (trecho.length > 90) { const ini = Math.max(0, col - 45); trecho = (ini > 0 ? '…' : '') + trecho.slice(ini, ini + 90); col = col - ini + (ini > 0 ? 1 : 0); }
  return { mensagem, linha, coluna, posicao: p, trecho, marcador: ' '.repeat(Math.max(0, col)) + '^' };
}

/** Verificador de sintaxe (descida recursiva) usado SÓ para explicar o erro. */
function localizarErro(t: string): ErroSintaxe {
  let i = 0;
  class Falha extends Error { pos: number; constructor(m: string, p: number) { super(m); this.pos = p; } }
  const falhar = (m: string, p = i): never => { throw new Falha(m, p); };
  const espacos = () => {
    for (;;) {
      while (i < t.length && /[ \t\n\r]/.test(t[i])) i++;
      if (t.startsWith('//', i) || t.startsWith('/*', i)) falhar('Comentários (// ou /* */) não são permitidos em JSON. Apague o comentário.');
      if (t[i] === '\u00a0' || t[i] === '\ufeff') falhar('Há um espaço invisível especial (NBSP/BOM) aqui. Apague e digite um espaço comum.');
      return;
    }
  };
  const descreve = (c: string | undefined) => (c === undefined ? 'fim do texto' : c === '\n' ? 'quebra de linha' : `"${c}"`);
  const textoJSON = () => {
    const ini = i; i++;
    while (i < t.length) {
      const c = t[i];
      if (c === '"') { i++; return; }
      if (c === '\\') { const e = t[i + 1]; if (e === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(t.slice(i + 2, i + 6))) falhar('Escape \\u inválido: use \\u seguido de 4 dígitos hexadecimais.'); i += 6; continue; } if (!e || !'"\\/bfnrt'.includes(e)) falhar(`Escape inválido "\\${e ?? ''}". Para escrever uma barra invertida use \\\\.`); i += 2; continue; }
      if (c === '\n' || c === '\r') falhar('Quebra de linha dentro de um texto. Use \\n no lugar do Enter.');
      if (c.charCodeAt(0) < 0x20) falhar('Caractere de controle dentro de um texto (ex.: TAB). Use \\t.');
      i++;
    }
    falhar('Texto aberto com aspas e nunca fechado.', ini);
  };
  const numero = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.slice(i));
    if (!m || !m[0] || m[0] === '-') falhar('Número inválido. Use ponto como separador decimal (ex.: 0.5) e não comece com zero (ex.: 07).');
    if (/^[\d.]/.test(t[i + m![0].length] ?? '')) falhar('Número inválido. Use ponto como separador decimal e sem zeros à esquerda.', i + m![0].length);
    i += m![0].length;
  };
  const valor = (nivel: number): void => {
    if (nivel > 400) falhar('Aninhamento profundo demais.');
    espacos(); const c = t[i];
    if (c === '{') return objeto(nivel);
    if (c === '[') return lista(nivel);
    if (c === '"') return textoJSON();
    if (c === '-' || (c >= '0' && c <= '9')) return numero();
    for (const lit of ['true', 'false', 'null']) if (t.startsWith(lit, i)) { i += lit.length; return; }
    if (c === "'") falhar('Aspas simples não são permitidas em JSON: use aspas duplas ("texto").');
    if (c === '\u201c' || c === '\u201d' || c === '\u2018' || c === '\u2019') falhar('Aspas “curvas” (copiadas do Word/WhatsApp) não valem em JSON: troque por aspas retas ".');
    if (/^(NaN|Infinity|-Infinity|undefined)/.test(t.slice(i))) falhar('NaN, Infinity e undefined não existem em JSON. Use um número ou null.');
    if (/^(True|False|None|Null|TRUE|FALSE|NULL)\b/.test(t.slice(i))) falhar('Em JSON os literais são minúsculos: true, false e null.');
    if (c === undefined) falhar('O texto terminou antes da hora: falta um valor ou fechar { ou [.');
    falhar(`Valor inesperado começando em ${descreve(c)}. Textos precisam de aspas duplas.`);
  };
  const objeto = (nivel: number) => {
    i++; espacos();
    if (t[i] === '}') { i++; return; }
    for (;;) {
      espacos();
      if (t[i] === '}') falhar('Vírgula sobrando antes de "}". Apague a última vírgula.');
      if (t[i] === "'") falhar('Aspas simples não são permitidas: os nomes dos campos usam aspas duplas ("campo").');
      if (t[i] === '\u201c' || t[i] === '\u201d') falhar('Aspas “curvas” no nome do campo: troque por aspas retas ".');
      if (t[i] !== '"') falhar(t[i] === undefined ? 'Faltou fechar o objeto com "}".' : /[A-Za-z_$]/.test(t[i]) ? 'Nome de campo sem aspas. Em JSON escreva "campo": valor.' : `Esperava o nome de um campo entre aspas, encontrei ${descreve(t[i])}.`);
      textoJSON(); espacos();
      if (t[i] !== ':') falhar(t[i] === '=' ? 'Use ":" (dois-pontos) entre o nome e o valor, não "=".' : `Faltou ":" depois do nome do campo (encontrei ${descreve(t[i])}).`);
      i++; valor(nivel + 1); espacos();
      if (t[i] === ',') { i++; continue; }
      if (t[i] === '}') { i++; return; }
      falhar(t[i] === undefined ? 'Faltou fechar o objeto com "}".' : t[i] === '"' ? 'Faltou uma vírgula entre dois campos.' : t[i] === ']' ? 'Encontrei "]" mas o bloco aberto é um objeto "{": feche com "}".' : `Esperava "," ou "}" e encontrei ${descreve(t[i])}.`);
    }
  };
  const lista = (nivel: number) => {
    i++; espacos();
    if (t[i] === ']') { i++; return; }
    for (;;) {
      espacos();
      if (t[i] === ']') falhar('Vírgula sobrando antes de "]". Apague a última vírgula.');
      valor(nivel + 1); espacos();
      if (t[i] === ',') { i++; continue; }
      if (t[i] === ']') { i++; return; }
      falhar(t[i] === undefined ? 'Faltou fechar a lista com "]".' : t[i] === '}' ? 'Encontrei "}" mas o bloco aberto é uma lista "[": feche com "]".' : `Faltou uma vírgula entre os itens da lista (encontrei ${descreve(t[i])}).`);
    }
  };
  try {
    valor(0); espacos();
    if (i < t.length) falhar('Há conteúdo depois do fim do JSON. Um arquivo deve ter um único objeto { } ou lista [ ].');
    return montarErro(t, 0, 'O JSON não pôde ser lido por este navegador.');
  } catch (e) {
    if (e instanceof Falha) return montarErro(t, e.pos, e.message);
    return montarErro(t, i, 'JSON inválido.');
  }
}

/** Formata o erro de sintaxe em texto (para avisos e testes). */
export const descreverErroSintaxe = (e: ErroSintaxe) => `Linha ${e.linha}, coluna ${e.coluna}: ${e.mensagem}`;
