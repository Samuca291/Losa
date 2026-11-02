// ============================================================
// DADOS · ESQUEMAS DECLARATIVOS (config, visualização, filtro, estudo)
// Fonte ÚNICA de verdade: o validador aplica estas regras e o
// guia do JSON gera as tabelas de referência a partir delas.
// O tipo `Esquema<T>` obriga a documentar TODAS as chaves: se um
// campo novo for criado em types.ts e esquecido aqui, o build falha.
// ============================================================
import { FONTES, type Config, type Estudo, type Filtro, type StatusEstudo, type TipoItem, type Visualizacao } from '../types';
import { corSegura, ehCorSegura } from '../utils/seguranca';
import { avisarChavesDesconhecidas, sugerirChave, type Relatorio } from './relatorio';

export const TIPOS_ITEM: readonly TipoItem[] = ['postit', 'texto', 'titulo', 'caixa', 'tarefas', 'tabela', 'imagem', 'link', 'desenho', 'forma', 'cloze', 'contador', 'fita', 'pino', 'carimbo'];
export const STATUS_ESTUDO: readonly StatusEstudo[] = ['nao-visto', 'estudando', 'revisar', 'dominado'];
export const MOTIVOS_ERRO = ['nao-sabia', 'confundi', 'li-errado', 'falta-atencao', 'chute'] as const;
export const ESTILOS_CONECTOR = ['reto', 'curvo', 'angulo'] as const;
export const ESTILOS_BORDA = ['solida', 'tracejada', 'pontilhada', 'dupla'] as const;
export const PADROES_REGIAO = ['nenhum', 'listras', 'pontos', 'grade'] as const;

export type Regra =
  | { tipo: 'bool'; desc: string }
  | { tipo: 'num'; min: number; max: number; inteiro?: boolean; unidade?: string; desc: string }
  | { tipo: 'enum'; valores: readonly string[]; desc: string }
  | { tipo: 'enum-nulo'; valores: readonly string[]; desc: string }
  | { tipo: 'cor'; desc: string }
  | { tipo: 'cor-nulo'; desc: string }
  | { tipo: 'texto'; max: number; desc: string }
  | { tipo: 'texto-nulo'; max: number; desc: string }
  | { tipo: 'cores'; max: number; desc: string }
  | { tipo: 'lista-enum'; valores: readonly string[]; desc: string }
  | { tipo: 'numeros'; min: number; max: number; maxItens: number; desc: string }
  | { tipo: 'data-nulo'; desc: string }
  | { tipo: 'dia'; desc: string }
  | { tipo: 'especial'; formato: string; desc: string };

export type Esquema<T> = { [K in keyof T]-?: Regra };

const b = (desc: string): Regra => ({ tipo: 'bool', desc });
const n = (min: number, max: number, desc: string, inteiro = false, unidade?: string): Regra => ({ tipo: 'num', min, max, inteiro, unidade, desc });
const e = (valores: readonly string[], desc: string): Regra => ({ tipo: 'enum', valores, desc });

export const ESQUEMA_CONFIG: Esquema<Config> = {
  fundo: e(['liso', 'quadriculado', 'pontilhado', 'pautado'], 'Padrão desenhado no papel da lousa.'),
  corFundo: { tipo: 'cor', desc: 'Cor do papel da lousa.' },
  intensidadeFundo: n(0, 1, 'Força do padrão do fundo (0 = invisível, 1 = forte).'),
  grade: b('Grade magnética: itens se alinham à grade ao mover e redimensionar.'),
  tamanhoGrade: n(10, 80, 'Espaçamento do padrão do fundo e da grade magnética.', true, 'px'),
  guiasInteligentes: b('Mostra linhas de alinhamento com outros itens ao arrastar.'),
  anguloAleatorio: b('Novos post-its nascem levemente tortos (efeito papel colado).'),
  itensAcompanhamRegiao: b('Padrão para novas regiões: os itens se movem junto com a região.'),
  tema: e(['claro', 'escuro', 'contraste'], 'Tema da interface (ignorado se temaAuto = true).'),
  escalaInterface: n(0.8, 1.6, 'Tamanho dos botões, painéis e textos da interface.'),
  animacoes: b('Transições e animações de entrada.'),
  corretorOrtografico: b('Sublinha erros de ortografia ao editar.'),
  coresFavoritas: { tipo: 'cores', max: 30, desc: 'Cores que aparecem primeiro nas paletas.' },
  fontePadrao: e(FONTES.map((f) => f.nome), 'Fonte dos novos itens.'),
  sincronizarNuvem: b('Espelha as lousas no banco de dados quando o servidor responder.'),
  duploCliqueCria: b('Duplo clique em área vazia cria um post-it.'),
  portasConexao: b('Mostra as bolinhas "+" de conexão no item sob o mouse.'),
  tamanhoPostit: e(['pequeno', 'medio', 'grande'], 'Tamanho dos novos post-its (140, 200 ou 300 px).'),
  estiloConector: e(ESTILOS_CONECTOR, 'Estilo padrão das novas linhas.'),
  corConector: { tipo: 'cor', desc: 'Cor padrão das novas linhas.' },
  setaConector: b('Novas linhas nascem com seta na ponta.'),
  autoAjusteAltura: b('Novos post-its crescem com o texto.'),
  zoomSuave: b('Anima o zoom e o enquadramento.'),
  temaAuto: b('Segue o tema claro/escuro do sistema operacional.'),
  desviarObstaculos: b('As linhas contornam itens no caminho.'),
  saltosLinha: b('Desenha "pontes" onde duas linhas se cruzam.'),
  conectoresAcima: b('Desenha as linhas por cima dos itens.'),
  raioCanto: n(0, 40, 'Arredondamento dos cantos das linhas em ângulo.', true, 'px'),
  margemDesvio: n(8, 48, 'Folga entre a linha e os itens contornados.', true, 'px'),
  rotulosConector: b('Mostra os rótulos escritos sobre as linhas.'),
  atalhosMarkdown: b('"- ", "1. ", "# " viram lista/título enquanto você digita.'),
  sombraPostit: b('Sombra de papel nos post-its.'),
};

export const ESQUEMA_VISUALIZACAO: Esquema<Omit<Visualizacao, 'filtro'>> = {
  modo: e(['tudo', 'so-lousa', 'lousa-anotacoes', 'lousa-postits'], 'O que aparece: tudo, só as divisões, divisões + anotações, ou divisões + post-its.'),
  ocultarTudo: b('Esconde todos os itens (tecla H).'),
  modoFoco: b('Esconde a interface para estudar sem distrações.'),
  modoProva: b('Esconde os versos/lacunas para treinar.'),
  tiposOcultos: { tipo: 'lista-enum', valores: TIPOS_ITEM, desc: 'Tipos de item escondidos, ex.: ["desenho", "fita"].' },
  mostrarConectores: b('Mostra as linhas entre itens.'),
  mostrarRegioes: b('Mostra as divisões (regiões).'),
  mostrarRotulos: b('Mostra os nomes das regiões.'),
  esmaecerOcultos: b('Em vez de esconder os tipos ocultos, deixa-os apagadinhos.'),
  opacidadeEsmaecer: n(0.02, 1, 'Opacidade dos itens esmaecidos.'),
  destacarTipo: { tipo: 'enum-nulo', valores: TIPOS_ITEM, desc: 'Destaca um tipo e esmaece os demais (null = desligado).' },
  minimapa: b('Minimapa no canto inferior direito.'),
  legenda: b('Mostra a legenda de cores na lousa.'),
  reguas: b('Réguas com coordenadas nas bordas.'),
};

export const ESQUEMA_FILTRO: Esquema<Filtro> = {
  cor: { tipo: 'cor-nulo', desc: 'Só itens desta cor (null = todas).' },
  etiqueta: { tipo: 'texto-nulo', max: 80, desc: 'Só itens com esta etiqueta (null = todas).' },
  regiao: { tipo: 'texto-nulo', max: 64, desc: 'Id (ou nome) da região filtrada (null = todas).' },
  status: { tipo: 'enum-nulo', valores: STATUS_ESTUDO, desc: 'Só itens com este status (null = todos).' },
  texto: { tipo: 'texto', max: 200, desc: 'Busca por texto; vazio = sem busca.' },
  esmaecer: b('true = esmaece o que não passa no filtro; false = esconde.'),
};

export const ESQUEMA_ESTUDO: Esquema<Estudo> = {
  intervalos: { tipo: 'numeros', min: 0.01, max: 3650, maxItens: 20, desc: 'Intervalos da revisão espaçada, em dias. Ex.: [1, 7, 30].' },
  metaDiaria: n(1, 1000, 'Quantidade de revisões por dia para cumprir a meta.', true),
  revisadosHoje: { tipo: 'especial', formato: '{ "dia": "AAAA-MM-DD", "quantidade": 0 }', desc: 'Contador do dia (preservado na importação).' },
  sequenciaDias: n(0, 100000, 'Dias seguidos cumprindo a meta.', true),
  ultimoDiaMeta: { tipo: 'dia', desc: 'Último dia em que a meta foi cumprida ("AAAA-MM-DD" ou "").' },
  intercalar: b('Intercala disciplinas na fila de revisão.'),
  dataProva: { tipo: 'data-nulo', desc: 'Data da prova ("AAAA-MM-DD", "DD/MM/AAAA" ou null).' },
  nomeProva: { tipo: 'texto', max: 120, desc: 'Nome do concurso/prova.' },
  pomodoroFoco: n(1, 180, 'Minutos de foco do pomodoro.', true, 'min'),
  pomodoroPausa: n(1, 60, 'Minutos de pausa do pomodoro.', true, 'min'),
};

/** Descrição curta do tipo aceito, usada nas tabelas do guia. */
export function descreverRegra(r: Regra): string {
  switch (r.tipo) {
    case 'bool': return 'true | false';
    case 'num': return `número ${r.min} a ${r.max}${r.inteiro ? ' (inteiro)' : ''}${r.unidade ? ` ${r.unidade}` : ''}`;
    case 'enum': return r.valores.map((v) => `"${v}"`).join(' | ');
    case 'enum-nulo': return `null | ${r.valores.length > 6 ? 'tipo de item' : r.valores.map((v) => `"${v}"`).join(' | ')}`;
    case 'cor': return 'cor ("#rrggbb", "rgba(...)", "transparent")';
    case 'cor-nulo': return 'null | cor';
    case 'texto': return `texto (até ${r.max})`;
    case 'texto-nulo': return `null | texto (até ${r.max})`;
    case 'cores': return `lista de cores (até ${r.max})`;
    case 'lista-enum': return 'lista de tipos de item';
    case 'numeros': return `lista de números ${r.min}–${r.max} (até ${r.maxItens})`;
    case 'data-nulo': return 'null | "AAAA-MM-DD"';
    case 'dia': return '"AAAA-MM-DD" | ""';
    case 'especial': return r.formato;
  }
}

// ---------- Datas ----------
const doisDigitos = (x: number) => String(x).padStart(2, '0');
const diaValido = (a: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && new Date(a, m - 1, d).getMonth() === m - 1;

/** Aceita "AAAA-MM-DD" (com ou sem hora), "DD/MM/AAAA" ou timestamp em ms. Devolve "AAAA-MM-DD" ou null. */
export function normalizarDia(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 4e12) { const d = new Date(v); return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`; }
  if (typeof v !== 'string') return null;
  const s = v.trim(); let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m && diaValido(+m[1], +m[2], +m[3])) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m && diaValido(+m[3], +m[2], +m[1])) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** Aceita timestamp em ms, "AAAA-MM-DD" (meia-noite local), ISO completo ou "DD/MM/AAAA". */
export function paraTimestamp(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= 4e12 ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const d = normalizarDia(s); if (!d) return null; const [a, m, dd] = d.split('-').map(Number); return new Date(a, m - 1, dd).getTime(); }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) { const t = Date.parse(s.replace(' ', 'T')); return Number.isFinite(t) ? t : null; }
  return null;
}

// ---------- Aplicação dos esquemas ----------
const fmt = (v: unknown) => { try { const s = typeof v === 'string' ? `"${v}"` : JSON.stringify(v); return s === undefined ? String(v) : s.length > 50 ? `${s.slice(0, 47)}…` : s; } catch { return String(v); } };

export function validarValor(v: unknown, regra: Regra, padrao: unknown, caminho: string, rel?: Relatorio): unknown {
  const invalido = (dica: string) => { rel?.aviso(caminho, `Valor ${fmt(v)} inválido: ${dica}. Mantido o padrão ${fmt(padrao)}.`); return padrao; };
  switch (regra.tipo) {
    case 'bool': return typeof v === 'boolean' ? v : invalido('use true ou false');
    case 'num': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return invalido(`use um número de ${regra.min} a ${regra.max}`);
      const base = regra.inteiro ? Math.round(v) : v; const c = Math.min(regra.max, Math.max(regra.min, base));
      if (c !== v) rel?.correcao(caminho, `${v} ajustado para ${c} (faixa ${regra.min} a ${regra.max}${regra.inteiro ? ', inteiro' : ''}).`);
      return c;
    }
    case 'enum': case 'enum-nulo': {
      if (regra.tipo === 'enum-nulo' && v === null) return null;
      if (typeof v === 'string' && regra.valores.includes(v)) return v;
      const s = typeof v === 'string' ? sugerirChave(v, regra.valores) : null;
      return invalido(`${s ? `você quis dizer "${s}"? ` : ''}aceitos: ${regra.valores.join(', ')}${regra.tipo === 'enum-nulo' ? ' ou null' : ''}`);
    }
    case 'cor': case 'cor-nulo':
      if (regra.tipo === 'cor-nulo' && v === null) return null;
      return ehCorSegura(v) ? corSegura(v) : invalido('use uma cor como "#ffcc00", "rgba(0,0,0,0.5)" ou "transparent"');
    case 'texto': case 'texto-nulo': {
      if (regra.tipo === 'texto-nulo' && (v === null || v === '')) return null;
      if (typeof v !== 'string') return invalido('use um texto entre aspas');
      if (v.length > regra.max) { rel?.correcao(caminho, `Texto cortado para ${regra.max} caracteres.`); return v.slice(0, regra.max); }
      return v;
    }
    case 'cores': {
      if (!Array.isArray(v)) return invalido('use uma lista de cores');
      const ok = [...new Set(v.filter(ehCorSegura).map((c) => corSegura(c)))].slice(0, regra.max);
      if (ok.length !== v.length) rel?.aviso(caminho, `${v.length - ok.length} cor(es) inválida(s), repetida(s) ou excedente(s) removida(s).`);
      return ok;
    }
    case 'lista-enum': {
      if (!Array.isArray(v)) return invalido('use uma lista');
      const ok = [...new Set(v.filter((x): x is string => typeof x === 'string' && regra.valores.includes(x)))];
      if (ok.length !== v.length) rel?.aviso(caminho, `${v.length - ok.length} valor(es) não reconhecido(s) removido(s). Aceitos: ${regra.valores.join(', ')}.`);
      return ok;
    }
    case 'numeros': {
      if (!Array.isArray(v)) return invalido('use uma lista de números, ex.: [1, 7, 30]');
      const ok = v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).map((x) => Math.min(regra.max, Math.max(regra.min, x))).slice(0, regra.maxItens);
      if (!ok.length) return invalido('a lista não pode ficar vazia');
      if (ok.length !== v.length) rel?.aviso(caminho, 'Valores não numéricos ou excedentes foram removidos.');
      return ok;
    }
    case 'data-nulo': { if (v === null || v === '') return null; return normalizarDia(v) ?? invalido('use "AAAA-MM-DD", "DD/MM/AAAA" ou null'); }
    case 'dia': { if (v === '') return ''; return normalizarDia(v) ?? invalido('use "AAAA-MM-DD" ou ""'); }
    case 'especial': return padrao;
  }
}

/** Aplica um esquema: só chaves conhecidas, com o tipo e a faixa certos; o resto volta ao padrão (com aviso). */
export function aplicarEsquema<T extends object>(origem: unknown, esquema: Esquema<T>, padrao: T, caminho: string, rel?: Relatorio, chavesExtras: string[] = []): T {
  const out = { ...padrao } as Record<string, unknown>;
  if (origem === undefined || origem === null) return out as T;
  if (typeof origem !== 'object' || Array.isArray(origem)) { rel?.aviso(caminho, 'Deveria ser um objeto { }; usados os valores padrão.'); return out as T; }
  const o = origem as Record<string, unknown>;
  avisarChavesDesconhecidas(o, [...Object.keys(esquema), ...chavesExtras], caminho, rel);
  for (const k of Object.keys(esquema) as (keyof T & string)[]) {
    const regra = esquema[k] as Regra;
    if (o[k] === undefined || regra.tipo === 'especial') continue;
    out[k] = validarValor(o[k], regra, (padrao as Record<string, unknown>)[k], `${caminho}.${k}`, rel);
  }
  return out as T;
}
