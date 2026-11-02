// ============================================================
// DADOS · VALIDAÇÃO E MIGRAÇÃO DE LOUSAS
// Todo dado que ENTRA (arquivo, backup interno, nuvem, colar itens)
// passa por aqui. Princípios:
//  1. Nunca confiar no arquivo: tipos, faixas, enums, cores, URLs e
//     HTML são verificados; nada do arquivo é executado.
//  2. Nada some em silêncio: cada correção vai para o Relatorio.
//  3. Integridade referencial: ids inválidos/duplicados são trocados
//     e as REFERÊNCIAS (conectores, regiões, camadas) acompanham.
//  4. Estruturas impossíveis são reparadas: ciclos de regiões,
//     filhos inconsistentes, conectores órfãos ou em laço.
// ============================================================
import { FONTES, VERSAO_FORMATO, type Camada, type Conector, type Item, type Lousa, type Ponto, type Regiao, type TipoItem } from '../types';
import { corSegura, ehCorSegura, sanitizarHtml, urlSegura } from '../utils/seguranca';
import { FORMAS_PRONTAS, type EspecDivisao, type EspecRegiao } from '../utils/divisoes';
import { avisarChavesDesconhecidas, sugerirChave, type Relatorio } from './relatorio';
import {
  aplicarEsquema, ESQUEMA_CONFIG, ESQUEMA_ESTUDO, ESQUEMA_FILTRO, ESQUEMA_VISUALIZACAO, ESTILOS_BORDA, ESTILOS_CONECTOR,
  MOTIVOS_ERRO, normalizarDia, PADROES_REGIAO, paraTimestamp, STATUS_ESTUDO, TIPOS_ITEM,
} from './esquemas';
import { LIMITES } from './tipos';

type Obj = Record<string, unknown>;
export const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export const RE_ID = /^[\w-]{1,64}$/;
export const idSeguro = (v: unknown): string | null => (typeof v === 'string' && RE_ID.test(v) ? v : null);
export const FORMAS_ITEM = ['retangulo', ...FORMAS_PRONTAS] as const;
const fmt = (v: unknown) => { try { const s = typeof v === 'string' ? `"${v}"` : JSON.stringify(v); return s === undefined ? String(v) : s.length > 50 ? `${s.slice(0, 47)}…` : s; } catch { return String(v); } };
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const RE_HTML_PERIGOSO = /<\s*(script|iframe|object|embed|style|svg|math|img|video|audio|form|input|link|meta|base)\b|\son[a-z]+\s*=|javascript:|data:text\/html/i;

export const CHAVES_LOUSA = ['versao', 'id', 'nome', 'doc', 'camera', 'config', 'visualizacao', 'visoesSalvas', 'lixeira', 'estudo', 'edital', 'questoes', 'legenda', 'modelosDivisao', 'arquivada', 'criadoEm', 'alteradoEm'] as const;
export const CHAVES_ITEM = ['id', 'tipo', 'x', 'y', 'w', 'h', 'angulo', 'z', 'camada', 'regiao', 'grupo', 'travado', 'oculto', 'fixado', 'criadoEm', 'alteradoEm', 'cor', 'corTexto', 'fonte', 'tamanhoFonte', 'autoAjuste', 'titulo', 'etiquetas', 'status', 'revisao', 'modelo', 'erro', 'html', 'verso', 'virado', 'tarefas', 'tabela', 'imagemId', 'opacidade', 'recorte', 'url', 'tracos', 'forma', 'valor', 'carimbo'] as const;
export const CHAVES_REGIAO = ['id', 'nome', 'pai', 'filhos', 'bbox', 'pontos', 'layout', 'metodo', 'estilo', 'recolhida', 'oculta', 'travada', 'ima', 'itensAcompanham', 'criadoEm', 'ordem'] as const;
export const CHAVES_CONECTOR = ['id', 'de', 'para', 'estilo', 'tracejado', 'rotulo', 'setaInicio', 'setaFim', 'cor', 'espessura', 'camada'] as const;
export const CHAVES_CAMADA = ['id', 'nome', 'visivel', 'travada', 'opacidade'] as const;

/** Gerador de ids com unicidade GARANTIDA dentro do conjunto `usados` (o gerarId do store pode colidir em lotes). */
export function geradorIds(usados: Set<string>) {
  const aleatorio = () => {
    try { const a = new Uint32Array(2); globalThis.crypto.getRandomValues(a); return a[0].toString(36) + a[1].toString(36).slice(0, 3); } catch { return Math.random().toString(36).slice(2, 10); }
  };
  return () => { let id: string; do { id = `${Date.now().toString(36)}${aleatorio()}`.slice(0, 24); } while (usados.has(id)); usados.add(id); return id; };
}
const idAvulso = geradorIds(new Set());

/** Leitura de campos com mensagens padronizadas. */
class Leitor {
  constructor(readonly r: Obj, readonly caminho: string, readonly rel?: Relatorio) {}
  c(k: string) { return `${this.caminho}.${k}`; }
  num(k: string, padrao: number, min = -1e7, max = 1e7, inteiro = false): number {
    let v = this.r[k]; if (v === undefined || v === null) return padrao;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) { this.rel?.correcao(this.c(k), `Texto ${fmt(v)} convertido em número.`); v = Number(v); }
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.rel?.aviso(this.c(k), `Número inválido ${fmt(v)}; usado ${padrao}.`); return padrao; }
    let x = inteiro ? Math.round(v) : v;
    if (x < min || x > max) { const c = Math.min(max, Math.max(min, x)); this.rel?.correcao(this.c(k), `${x} fora da faixa (${min} a ${max}); ajustado para ${c}.`); x = c; }
    return x;
  }
  bool(k: string, padrao = false): boolean {
    const v = this.r[k]; if (v === undefined || v === null) return padrao; if (typeof v === 'boolean') return v;
    this.rel?.aviso(this.c(k), `Use true ou false (recebido ${fmt(v)}); usado ${padrao}.`); return padrao;
  }
  str(k: string, max: number, padrao = ''): string {
    const v = this.r[k]; if (v === undefined || v === null) return padrao;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max);
    if (typeof v !== 'string') { this.rel?.aviso(this.c(k), `Deveria ser texto (recebido ${fmt(v)}); usado ${fmt(padrao)}.`); return padrao; }
    if (v.length > max) { this.rel?.correcao(this.c(k), `Texto com ${v.length} caracteres cortado para ${max}.`); return v.slice(0, max); }
    return v;
  }
  nome(k: string, max: number, padrao: string): string { return this.str(k, max, padrao).replace(/<[^>]*>/g, '').trim() || padrao; }
  enumr<T extends string>(k: string, valores: readonly T[], padrao: T): T {
    const v = this.r[k]; if (v === undefined || v === null) return padrao;
    if (typeof v === 'string' && (valores as readonly string[]).includes(v)) return v as T;
    const s = typeof v === 'string' ? sugerirChave(v, valores) : null;
    this.rel?.aviso(this.c(k), `Valor ${fmt(v)} não aceito${s ? ` (você quis dizer "${s}"?)` : ''}; aceitos: ${valores.join(', ')}. Usado "${padrao}".`); return padrao;
  }
  cor(k: string, padrao: string): string {
    const v = this.r[k]; if (v === undefined || v === null) return padrao; if (ehCorSegura(v)) return corSegura(v);
    this.rel?.aviso(this.c(k), `Cor inválida ${fmt(v)} (use "#rrggbb", "rgba(...)" ou "transparent"); usada ${padrao}.`); return padrao;
  }
  data(k: string, padrao: number): number {
    const v = this.r[k]; if (v === undefined || v === null) return padrao; const t = paraTimestamp(v); if (t !== null) return t;
    this.rel?.aviso(this.c(k), `Data inválida ${fmt(v)} (use milissegundos ou "AAAA-MM-DD"); usada a data atual.`); return padrao;
  }
  html(k: string): string {
    const v = this.str(k, LIMITES.html, '');
    if (v && RE_HTML_PERIGOSO.test(v)) this.rel?.aviso(this.c(k), 'Conteúdo HTML perigoso ou não permitido (script, imagem, evento on*, javascript:) foi removido pelo filtro de segurança.');
    return sanitizarHtml(v);
  }
}

const pontos = (v: unknown, max: number = LIMITES.pontos): Ponto[] => (Array.isArray(v) ? v.slice(0, max).filter(ehObj).map((p) => ({ x: typeof p.x === 'number' && Number.isFinite(p.x) ? Math.max(-1e7, Math.min(1e7, p.x)) : 0, y: typeof p.y === 'number' && Number.isFinite(p.y) ? Math.max(-1e7, Math.min(1e7, p.y)) : 0 })) : []);

// ============================================================
// ITEM
// ============================================================
export interface OpcoesItem {
  /** Converte o valor bruto de `regiao` em um id existente (undefined = referência inexistente). */
  resolverRegiao?: (v: unknown) => string | null | undefined;
  resolverCamada?: (v: unknown) => string | undefined;
  /** Silencia avisos de referência (usado na lixeira). */
  silenciarRefs?: boolean;
}

export function validarItem(raw: unknown, rel?: Relatorio, caminho = 'item', op: OpcoesItem = {}): Item | null {
  if (!ehObj(raw)) { rel?.aviso(caminho, 'Item ignorado: deveria ser um objeto { }.'); return null; }
  const r = raw; const L = new Leitor(r, caminho, rel); const agora = Date.now();
  avisarChavesDesconhecidas(r, CHAVES_ITEM, caminho, rel);
  let tipo: TipoItem = 'postit';
  if (r.tipo !== undefined) {
    if (TIPOS_ITEM.includes(r.tipo as TipoItem)) tipo = r.tipo as TipoItem;
    else { const s = typeof r.tipo === 'string' ? sugerirChave(r.tipo, TIPOS_ITEM) : null; rel?.aviso(L.c('tipo'), `Tipo ${fmt(r.tipo)} desconhecido${s ? ` (você quis dizer "${s}"?)` : ''}; tratado como "postit".`); }
  }
  // Referências
  let regiao: string | null = null;
  if (r.regiao !== undefined && r.regiao !== null && r.regiao !== '') {
    const res = op.resolverRegiao ? op.resolverRegiao(r.regiao) : idSeguro(r.regiao);
    if (res) regiao = res; else if (!op.silenciarRefs) rel?.aviso(L.c('regiao'), `Região ${fmt(r.regiao)} não existe; o item ficou fora de regiões.`);
  }
  let camada = 'principal';
  if (r.camada !== undefined && r.camada !== null && r.camada !== '') {
    const res = op.resolverCamada ? op.resolverCamada(r.camada) : idSeguro(r.camada) ?? undefined;
    if (res) camada = res; else if (!op.silenciarRefs) rel?.aviso(L.c('camada'), `Camada ${fmt(r.camada)} não existe; usada "principal".`);
  }
  const rev = ehObj(r.revisao) ? r.revisao : {}; const LR = new Leitor(rev, L.c('revisao'), rel);
  if (r.revisao !== undefined && !ehObj(r.revisao)) rel?.aviso(L.c('revisao'), 'revisao deveria ser um objeto { "ativa": true, ... }; revisão desligada.');
  const etiquetasBrutas = typeof r.etiquetas === 'string' ? r.etiquetas.split(',') : Array.isArray(r.etiquetas) ? r.etiquetas : [];
  if (r.etiquetas !== undefined && !Array.isArray(r.etiquetas) && typeof r.etiquetas !== 'string') rel?.aviso(L.c('etiquetas'), 'Use uma lista de textos, ex.: ["lei", "prazo"].');
  const etiquetas = [...new Set(etiquetasBrutas.filter((s): s is string => typeof s === 'string').map((s) => s.replace(/<[^>]*>/g, '').trim().slice(0, 80)).filter(Boolean))].slice(0, LIMITES.etiquetas);
  const fonte = typeof r.fonte === 'string' && FONTES.some((f) => f.nome === r.fonte) ? r.fonte : (r.fonte !== undefined && rel?.aviso(L.c('fonte'), `Fonte ${fmt(r.fonte)} desconhecida; aceitas: ${FONTES.map((f) => f.nome).join(', ')}.`), 'Padrão');
  const corPadrao = ['texto', 'titulo', 'imagem'].includes(tipo) ? 'transparent' : ['caixa', 'tabela', 'link'].includes(tipo) ? '#ffffff' : tipo === 'cloze' ? '#e6ee9c' : '#fff176';
  const item: Item = {
    id: idSeguro(r.id) ?? idAvulso(), tipo,
    x: L.num('x', 0), y: L.num('y', 0), w: L.num('w', 200, 10, 10000), h: L.num('h', 200, 10, 10000),
    angulo: L.num('angulo', 0, -360, 360), z: L.num('z', 0, 0, 1e9),
    camada, regiao, grupo: idSeguro(r.grupo),
    travado: L.bool('travado'), oculto: L.bool('oculto'), fixado: L.bool('fixado'),
    criadoEm: L.data('criadoEm', agora), alteradoEm: L.data('alteradoEm', agora),
    cor: L.cor('cor', corPadrao), corTexto: r.corTexto !== undefined && r.corTexto !== null ? L.cor('corTexto', '#1f2937') : undefined,
    fonte, tamanhoFonte: L.num('tamanhoFonte', tipo === 'titulo' ? 32 : 15, 8, 120), autoAjuste: L.bool('autoAjuste'),
    titulo: L.nome('titulo', 120, ''), etiquetas,
    status: L.enumr('status', STATUS_ESTUDO, 'nao-visto'),
    revisao: {
      ativa: LR.bool('ativa'), indice: LR.num('indice', 0, 0, 50, true),
      proxima: rev.proxima === null || rev.proxima === undefined ? null : LR.data('proxima', agora),
      historico: Array.isArray(rev.historico) ? rev.historico.slice(-200).filter(ehObj).map((h) => ({ data: paraTimestamp(h.data) ?? 0, acertou: h.acertou === true })) : [],
    },
    html: L.html('html'),
  };
  if (item.revisao.ativa && item.revisao.proxima === null) { item.revisao.proxima = agora; rel?.correcao(LR.c('proxima'), 'Revisão ativa sem data: marcada para hoje.'); }
  if (r.modelo !== undefined) item.modelo = L.str('modelo', 40);
  if (r.verso !== undefined && r.verso !== null) item.verso = L.html('verso');
  if (r.virado !== undefined) item.virado = L.bool('virado');
  if (ehObj(r.erro)) {
    const E = new Leitor(r.erro, L.c('erro'), rel);
    item.erro = { disciplina: E.str('disciplina', 80), assunto: E.str('assunto', 120), banca: E.str('banca', 40), ano: E.str('ano', 8), oQueErrei: E.str('oQueErrei', 2000), motivo: E.enumr('motivo', MOTIVOS_ERRO, 'nao-sabia'), respostaCerta: E.str('respostaCerta', 2000), fonte: E.str('fonte', 300) };
  }
  if (Array.isArray(r.tarefas)) item.tarefas = r.tarefas.slice(0, LIMITES.tarefas).map((t) => (typeof t === 'string' ? { texto: t.slice(0, 500), feito: false } : ehObj(t) ? { texto: typeof t.texto === 'string' ? t.texto.slice(0, 500) : '', feito: t.feito === true } : { texto: '', feito: false }));
  else if (tipo === 'tarefas') item.tarefas = [];
  if (Array.isArray(r.tabela)) {
    const linhas = r.tabela.slice(0, LIMITES.linhasTabela).map((l) => (Array.isArray(l) ? l.slice(0, LIMITES.colunasTabela).map((c) => (typeof c === 'string' ? c.slice(0, 1000) : typeof c === 'number' || typeof c === 'boolean' ? String(c) : '')) : []));
    const cols = Math.max(1, ...linhas.map((l) => l.length));
    if (linhas.some((l) => l.length !== cols)) rel?.correcao(L.c('tabela'), `Linhas com tamanhos diferentes completadas até ${cols} coluna(s).`);
    item.tabela = (linhas.length ? linhas : [['']]).map((l) => Array.from({ length: cols }, (_, i) => l[i] ?? ''));
  } else if (tipo === 'tabela') { item.tabela = [['Critério', 'A', 'B'], ['', '', ''], ['', '', '']]; if (r.tabela !== undefined) rel?.aviso(L.c('tabela'), 'Use uma lista de linhas, ex.: [["A","B"],["1","2"]].'); }
  if (r.imagemId !== undefined) { const im = idSeguro(r.imagemId); if (im) item.imagemId = im; else rel?.aviso(L.c('imagemId'), `Id de imagem inválido ${fmt(r.imagemId)}.`); }
  if (tipo === 'imagem' && !item.imagemId) rel?.aviso(caminho, 'Item do tipo "imagem" sem imagemId: aparecerá vazio.');
  if (r.opacidade !== undefined) item.opacidade = L.num('opacidade', 1, 0, 1); else if (tipo === 'imagem') item.opacidade = 1;
  if (ehObj(r.recorte)) { const C = new Leitor(r.recorte, L.c('recorte'), rel); item.recorte = { x: C.num('x', 0, 0, 1), y: C.num('y', 0, 0, 1), w: C.num('w', 1, 0.01, 1), h: C.num('h', 1, 0.01, 1) }; }
  if (r.url !== undefined) { const u = L.str('url', 2000).trim(); item.url = u && urlSegura(u) ? u : ''; if (u && !item.url) rel?.aviso(L.c('url'), `Endereço ${fmt(u)} recusado: só http://, https:// ou mailto:.`); }
  if (Array.isArray(r.tracos)) item.tracos = r.tracos.slice(0, LIMITES.tracos).filter(ehObj).map((tr, i) => { const T = new Leitor(tr, `${L.c('tracos')}[${i}]`, rel); return { pontos: pontos(tr.pontos), cor: T.cor('cor', '#1f2937'), espessura: T.num('espessura', 3, 1, 60), marcaTexto: T.bool('marcaTexto') }; });
  if (r.forma !== undefined || tipo === 'forma') item.forma = L.enumr('forma', FORMAS_ITEM, 'retangulo');
  if (r.valor !== undefined || tipo === 'contador') item.valor = L.num('valor', 0, -1e9, 1e9);
  if (r.carimbo !== undefined || tipo === 'carimbo') item.carimbo = L.str('carimbo', 30, 'importante') || 'importante';
  return item;
}

// ============================================================
// REGIÃO, CONECTOR, CAMADA, ESPECIFICAÇÃO DE DIVISÃO
// ============================================================
export function validarRegiao(raw: unknown, rel?: Relatorio, caminho = 'regiao'): Regiao | null {
  if (!ehObj(raw)) { rel?.aviso(caminho, 'Região ignorada: deveria ser um objeto { }.'); return null; }
  const r = raw; const L = new Leitor(r, caminho, rel);
  avisarChavesDesconhecidas(r, CHAVES_REGIAO, caminho, rel);
  if (!ehObj(r.bbox)) rel?.aviso(L.c('bbox'), 'Região sem "bbox" {x, y, w, h}: criada com 100×100 na origem.');
  const B = new Leitor(ehObj(r.bbox) ? r.bbox : {}, L.c('bbox'), rel); const E = new Leitor(ehObj(r.estilo) ? r.estilo : {}, L.c('estilo'), rel);
  if (ehObj(r.estilo)) avisarChavesDesconhecidas(r.estilo, ['cor', 'opacidade', 'corBorda', 'espessuraBorda', 'estiloBorda', 'raio', 'icone', 'padrao', 'rotuloAngulo', 'numerar', 'mostrarTitulo'], L.c('estilo'), rel);
  let pts: Ponto[] | null = null;
  if (Array.isArray(r.pontos)) { pts = pontos(r.pontos); if (pts.length < 3) { rel?.aviso(L.c('pontos'), 'Polígono com menos de 3 pontos ignorado: a região ficou retangular.'); pts = null; } }
  let layout: Regiao['layout'] = null;
  if (ehObj(r.layout)) {
    const l = r.layout;
    if ((l.direcao === 'h' || l.direcao === 'v') && Array.isArray(l.proporcoes) && l.proporcoes.length) layout = { direcao: l.direcao, proporcoes: l.proporcoes.slice(0, 100).map((p) => (typeof p === 'number' && Number.isFinite(p) ? Math.min(1, Math.max(0.01, p)) : 0.1)) };
    else rel?.aviso(L.c('layout'), 'Layout inválido (use { "direcao": "h" | "v", "proporcoes": [..] }); ignorado.');
  }
  return {
    id: idSeguro(r.id) ?? idAvulso(), nome: L.nome('nome', 120, 'Região'), pai: null, filhos: [],
    bbox: { x: B.num('x', 0), y: B.num('y', 0), w: B.num('w', 100, 1, 1e6), h: B.num('h', 100, 1, 1e6) },
    pontos: pts, layout, metodo: L.str('metodo', 40, 'manual') || 'manual',
    estilo: {
      cor: E.cor('cor', '#60a5fa'), opacidade: E.num('opacidade', 0.18, 0, 1), corBorda: E.cor('corBorda', '#64748b'), espessuraBorda: E.num('espessuraBorda', 2, 0, 20),
      estiloBorda: E.enumr('estiloBorda', ESTILOS_BORDA, 'solida'), raio: E.num('raio', 8, 0, 100), icone: E.str('icone', 8), padrao: E.enumr('padrao', PADROES_REGIAO, 'nenhum'),
      rotuloAngulo: E.num('rotuloAngulo', 0, -360, 360), numerar: E.bool('numerar'), mostrarTitulo: E.bool('mostrarTitulo', true),
    },
    recolhida: L.bool('recolhida'), oculta: L.bool('oculta'), travada: L.bool('travada'), ima: L.bool('ima'), itensAcompanham: L.bool('itensAcompanham', true),
    criadoEm: L.data('criadoEm', Date.now()), ordem: L.num('ordem', 0, 0, 1e6),
  };
}

export function validarConector(raw: unknown, rel?: Relatorio, caminho = 'conector', resolverItem: (v: unknown) => string | null = idSeguro, resolverCamada?: (v: unknown) => string | undefined): Conector | null {
  if (!ehObj(raw)) { rel?.aviso(caminho, 'Conector ignorado: deveria ser um objeto { }.'); return null; }
  const r = raw; const L = new Leitor(r, caminho, rel);
  avisarChavesDesconhecidas(r, CHAVES_CONECTOR, caminho, rel);
  const de = resolverItem(r.de), para = resolverItem(r.para);
  if (!de || !para) { rel?.aviso(caminho, `Conector descartado: ${!de ? `a origem "de" ${fmt(r.de)}` : `o destino "para" ${fmt(r.para)}`} não corresponde a nenhum item.`); return null; }
  if (de === para) { rel?.aviso(caminho, 'Conector descartado: liga um item a ele mesmo.'); return null; }
  const camada = r.camada === undefined ? 'principal' : (resolverCamada ? resolverCamada(r.camada) : idSeguro(r.camada)) ?? 'principal';
  return { id: idSeguro(r.id) ?? idAvulso(), de, para, estilo: L.enumr('estilo', ESTILOS_CONECTOR, 'curvo'), tracejado: L.bool('tracejado'), rotulo: L.str('rotulo', 120), setaInicio: L.bool('setaInicio'), setaFim: L.bool('setaFim', true), cor: L.cor('cor', '#475569'), espessura: L.num('espessura', 2, 1, 12), camada };
}

export function validarCamada(raw: unknown, rel?: Relatorio, caminho = 'camada'): Camada | null {
  if (!ehObj(raw)) { rel?.aviso(caminho, 'Camada ignorada: deveria ser um objeto { }.'); return null; }
  const L = new Leitor(raw, caminho, rel); avisarChavesDesconhecidas(raw, CHAVES_CAMADA, caminho, rel);
  const nome = L.nome('nome', 60, 'Camada');
  const id = idSeguro(raw.id) ?? (semAcento(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || idAvulso());
  if (raw.id !== undefined && !idSeguro(raw.id)) rel?.correcao(L.c('id'), `Id inválido ${fmt(raw.id)}; usado "${id}".`);
  return { id, nome, visivel: L.bool('visivel', true), travada: L.bool('travada'), opacidade: L.num('opacidade', 1, 0, 1) };
}

/** Valida recursivamente uma especificação de divisão (modelos salvos). Antes era gravada sem verificação alguma. */
export function validarEspecDivisao(raw: unknown, rel?: Relatorio, caminho = 'spec', prof = 0): EspecDivisao | null {
  if (prof > LIMITES.profundidadeDivisao) { rel?.aviso(caminho, `Divisão aninhada demais (máximo ${LIMITES.profundidadeDivisao} níveis).`); return null; }
  if (!ehObj(raw) || !Array.isArray(raw.filhos) || !raw.filhos.length) { rel?.aviso(caminho, 'Especificação de divisão inválida: precisa de "filhos": [ ... ].'); return null; }
  const filhosRaw = raw.filhos.slice(0, LIMITES.filhosDivisao);
  const filhos: EspecRegiao[] = filhosRaw.map((f, i) => {
    const o = ehObj(f) ? f : {}; const sub = o.sub !== undefined ? validarEspecDivisao(o.sub, rel, `${caminho}.filhos[${i}].sub`, prof + 1) : null;
    const pts = Array.isArray(o.pontos) ? pontos(o.pontos) : null;
    return { nome: typeof o.nome === 'string' && o.nome.trim() ? o.nome.replace(/<[^>]*>/g, '').slice(0, 120) : `Parte ${i + 1}`, ...(pts && pts.length >= 3 ? { pontos: pts } : {}), ...(ehCorSegura(o.cor) ? { cor: corSegura(o.cor) } : {}), ...(sub ? { sub } : {}) };
  });
  let layout: EspecDivisao['layout'];
  if (ehObj(raw.layout) && (raw.layout.direcao === 'h' || raw.layout.direcao === 'v') && Array.isArray(raw.layout.proporcoes)) {
    let props = raw.layout.proporcoes.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
    if (props.length !== filhos.length) { rel?.correcao(`${caminho}.layout.proporcoes`, `${props.length} proporção(ões) para ${filhos.length} filho(s): lista ajustada.`); props = Array.from({ length: filhos.length }, (_, i) => props[i] ?? 1); }
    const soma = props.reduce((a, x) => a + x, 0); layout = { direcao: raw.layout.direcao, proporcoes: props.map((p) => p / soma) };
  }
  return { metodo: typeof raw.metodo === 'string' ? raw.metodo.slice(0, 40) : 'modelo', ...(layout ? { layout } : {}), filhos };
}

// ============================================================
// LOUSA
// ============================================================
export interface OpcoesValidacao {
  rel?: Relatorio;
  caminho?: string;
  /** Mantém alteradoEm original (nuvem/backups). Sem isso, a lousa importada é marcada como alterada agora. */
  preservarTempo?: boolean;
}

/** Itera um dicionário { id: obj } OU uma lista [obj] (formato antigo / escrito à mão). */
function entradas(v: unknown, caminho: string, rel?: Relatorio): [string, unknown, boolean][] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((x, i) => [String(i), x, false]);
  if (ehObj(v)) return Object.entries(v).map(([k, x]) => [k, x, true]);
  rel?.aviso(caminho, 'Deveria ser uma lista [ ] ou um objeto { id: ... }; ignorado.'); return [];
}

/** Migrações de formato. Acrescente um caso por versão antiga. */
function migrar(r: Obj, versao: number, rel?: Relatorio, caminho = 'lousa'): Obj {
  let atual = r;
  if (versao < 1) {
    // formato 0 (protótipo): itens em lista em vez de dicionário
    const doc = ehObj(atual.doc) ? { ...atual.doc } : {};
    if (Array.isArray(doc.itens)) doc.itens = Object.fromEntries(doc.itens.filter(ehObj).map((i, k) => [idSeguro(i.id) ?? `migrado-${k}`, i]));
    atual = { ...atual, doc, versao: 1 };
    rel?.info(caminho, 'Arquivo no formato 0 (protótipo) migrado para o formato 1.');
  }
  return atual;
}

/** Valida e migra uma lousa. Ignora campos desconhecidos (com aviso). Nunca executa nada do arquivo. */
export function validarLousa(raw: unknown, base: Lousa, op: OpcoesValidacao = {}): Lousa {
  const rel = op.rel; const cam = op.caminho ?? 'lousa';
  if (!ehObj(raw)) throw new Error('O arquivo não contém uma lousa válida.');
  let r: Obj = raw;
  if (ehObj(r.lousa)) r = r.lousa; // envelope de exportação { tipo, lousa, imagens }
  const versao = typeof r.versao === 'number' && Number.isFinite(r.versao) ? r.versao : 1;
  if (versao > VERSAO_FORMATO) throw new Error(`Esta lousa foi salva por uma versão mais nova do programa (formato ${versao}; este lê até o ${VERSAO_FORMATO}). Atualize o programa.`);
  r = migrar(r, versao, rel, cam);
  avisarChavesDesconhecidas(r, CHAVES_LOUSA, cam, rel);
  if (r.doc !== undefined && !ehObj(r.doc)) rel?.aviso(`${cam}.doc`, '"doc" deveria ser um objeto; a lousa ficou sem conteúdo.');
  const doc: Obj = ehObj(r.doc) ? r.doc : {};
  avisarChavesDesconhecidas(doc, ['itens', 'conectores', 'regioes', 'camadas'], `${cam}.doc`, rel);
  const usados = new Set<string>(); const novoId = geradorIds(usados);

  // ---------- Camadas ----------
  const camadas: Camada[] = []; const mapaCamadas = new Map<string, string>();
  const camRaw = Array.isArray(doc.camadas) ? doc.camadas : [];
  if (doc.camadas !== undefined && !Array.isArray(doc.camadas)) rel?.aviso(`${cam}.doc.camadas`, 'Deveria ser uma lista [ ]; usadas as camadas padrão.');
  if (camRaw.length > LIMITES.camadas) rel?.aviso(`${cam}.doc.camadas`, `Mais de ${LIMITES.camadas} camadas: as excedentes foram ignoradas.`);
  camRaw.slice(0, LIMITES.camadas).forEach((c, i) => {
    const v = validarCamada(c, rel, `${cam}.doc.camadas[${i}]`); if (!v) return;
    if (camadas.some((x) => x.id === v.id)) { rel?.aviso(`${cam}.doc.camadas[${i}]`, `Camada com id repetido "${v.id}" ignorada.`); return; }
    camadas.push(v); if (ehObj(c) && typeof c.id === 'string') mapaCamadas.set(c.id, v.id); mapaCamadas.set(semAcento(v.nome), v.id);
  });
  if (!camadas.some((c) => c.id === 'principal')) camadas.unshift({ id: 'principal', nome: 'Teoria', visivel: true, travada: false, opacidade: 1 });
  if (!camadas.some((c) => c.id === 'anotacoes')) camadas.push({ id: 'anotacoes', nome: 'Anotações', visivel: true, travada: false, opacidade: 1 });
  const resolverCamada = (v: unknown): string | undefined => (typeof v !== 'string' ? undefined : camadas.some((c) => c.id === v) ? v : mapaCamadas.get(v) ?? mapaCamadas.get(semAcento(v)));

  // ---------- Regiões ----------
  const regioes: Record<string, Regiao> = {}; const mapaRegioes = new Map<string, string>();
  const paiBruto = new Map<string, unknown>(); const filhosBrutos = new Map<string, unknown[]>();
  const regEntradas = entradas(doc.regioes, `${cam}.doc.regioes`, rel);
  if (regEntradas.length > LIMITES.regioes) rel?.aviso(`${cam}.doc.regioes`, `Mais de ${LIMITES.regioes} regiões: as excedentes foram ignoradas.`);
  let regioesSemId = 0;
  for (const [chave, rr, ehDic] of regEntradas.slice(0, LIMITES.regioes)) {
    const caminho = `${cam}.doc.regioes[${ehDic ? chave : chave}]`;
    const v = validarRegiao(rr, rel, caminho); if (!v || !ehObj(rr)) continue;
    let id = idSeguro(rr.id) ?? (ehDic ? idSeguro(chave) : null);
    if (!id) { id = novoId(); if (rr.id !== undefined) rel?.correcao(`${caminho}.id`, `Id inválido ${fmt(rr.id)}; trocado por "${id}" (referências atualizadas).`); else regioesSemId++; }
    else if (usados.has(id)) { const novo = novoId(); rel?.aviso(`${caminho}.id`, `Id de região repetido "${id}"; esta recebeu "${novo}".`); id = novo; }
    usados.add(id); v.id = id; regioes[id] = v;
    if (typeof rr.id === 'string' && rr.id !== id && !mapaRegioes.has(rr.id)) mapaRegioes.set(rr.id, id);
    if (!mapaRegioes.has(semAcento(v.nome))) mapaRegioes.set(semAcento(v.nome), id);
    paiBruto.set(id, rr.pai); if (Array.isArray(rr.filhos)) filhosBrutos.set(id, rr.filhos);
  }
  if (regioesSemId) rel?.correcao(`${cam}.doc.regioes`, `${regioesSemId} região(ões) sem id receberam um id automático.`);
  const resolverRegiao = (v: unknown): string | undefined => (typeof v !== 'string' ? undefined : regioes[v] ? v : mapaRegioes.get(v) ?? mapaRegioes.get(semAcento(v)));
  // pai explícito
  for (const [id, pb] of paiBruto) {
    if (pb === undefined || pb === null || pb === '') continue;
    const p = resolverRegiao(pb);
    if (!p) rel?.aviso(`${cam}.doc.regioes[${id}].pai`, `Região-mãe ${fmt(pb)} não existe; "${regioes[id].nome}" virou região raiz.`);
    else if (p === id) rel?.aviso(`${cam}.doc.regioes[${id}].pai`, 'Uma região não pode ser mãe de si mesma; virou região raiz.');
    else regioes[id].pai = p;
  }
  // adoção: filho listado em "filhos" mas sem "pai" declarado
  for (const [id, fs] of filhosBrutos) for (const f of fs) {
    const fid = resolverRegiao(f); if (!fid || fid === id) continue;
    const pbF = paiBruto.get(fid); if ((pbF === undefined || pbF === null || pbF === '') && !regioes[fid].pai) regioes[fid].pai = id;
  }
  // ciclos (A → B → A travaria a aba em caminhoRegiao/descendentes)
  const marca = new Map<string, 1 | 2>();
  for (const inicio of Object.keys(regioes)) {
    const cadeia: string[] = []; let cur: string | null = inicio;
    while (cur && !marca.has(cur)) { marca.set(cur, 1); cadeia.push(cur); cur = regioes[cur]?.pai ?? null; }
    if (cur && marca.get(cur) === 1) { const ultimo = cadeia[cadeia.length - 1]; rel?.aviso(`${cam}.doc.regioes[${ultimo}].pai`, `Ciclo de regiões detectado (${cadeia.slice(cadeia.indexOf(cur)).map((x) => `"${regioes[x].nome}"`).join(' → ')} → …); "${regioes[ultimo].nome}" virou raiz para quebrar o ciclo.`); regioes[ultimo].pai = null; }
    for (const c of cadeia) marca.set(c, 2);
  }
  // filhos reconstruídos a partir de "pai" (respeitando a ordem original quando houver)
  const posOriginal = new Map<string, number>();
  for (const [, fs] of filhosBrutos) fs.forEach((f, i) => { const fid = resolverRegiao(f); if (fid && !posOriginal.has(fid)) posOriginal.set(fid, i); });
  for (const rg of Object.values(regioes)) rg.filhos = [];
  for (const rg of Object.values(regioes)) if (rg.pai) regioes[rg.pai].filhos.push(rg.id);
  for (const rg of Object.values(regioes)) {
    rg.filhos.sort((a, c) => (posOriginal.get(a) ?? 1e9) - (posOriginal.get(c) ?? 1e9) || (regioes[a].ordem ?? 0) - (regioes[c].ordem ?? 0));
    const orig = (filhosBrutos.get(rg.id) ?? []).map(resolverRegiao).filter(Boolean);
    if (filhosBrutos.has(rg.id) && (orig.length !== rg.filhos.length || orig.some((x, i) => x !== rg.filhos[i]))) rel?.correcao(`${cam}.doc.regioes[${rg.id}].filhos`, 'Lista de filhos reconstruída a partir do campo "pai" das regiões.');
  }

  // ---------- Itens ----------
  const itens: Record<string, Item> = {}; const mapaItens = new Map<string, string>();
  const itEntradas = entradas(doc.itens, `${cam}.doc.itens`, rel);
  if (itEntradas.length > LIMITES.itens) throw new Error(`O arquivo tem itens demais (${itEntradas.length}). O limite é ${LIMITES.itens}.`);
  let itensSemId = 0;
  for (const [chave, ri, ehDic] of itEntradas) {
    const caminho = `${cam}.doc.itens[${chave}]`;
    const v = validarItem(ri, rel, caminho, { resolverRegiao, resolverCamada }); if (!v || !ehObj(ri)) continue;
    let id = idSeguro(ri.id) ?? (ehDic ? idSeguro(chave) : null);
    if (!id) { id = novoId(); if (ri.id !== undefined) rel?.correcao(`${caminho}.id`, `Id inválido ${fmt(ri.id)}; trocado por "${id}" (conectores atualizados).`); else itensSemId++; }
    else if (usados.has(id)) { const novo = novoId(); rel?.aviso(`${caminho}.id`, `Id repetido "${id}"; este item recebeu "${novo}" (conectores continuam apontando para o primeiro).`); id = novo; }
    usados.add(id); v.id = id; itens[id] = v;
    if (typeof ri.id === 'string' && ri.id !== id && !mapaItens.has(ri.id)) mapaItens.set(ri.id, id);
  }
  if (itensSemId) rel?.correcao(`${cam}.doc.itens`, `${itensSemId} item(ns) sem id receberam um id automático.`);
  const resolverItem = (v: unknown): string | null => (typeof v !== 'string' ? null : itens[v] ? v : mapaItens.get(v) ?? null);

  // ---------- Conectores ----------
  const conectores: Record<string, Conector> = {};
  const conEntradas = entradas(doc.conectores, `${cam}.doc.conectores`, rel);
  if (conEntradas.length > LIMITES.conectores) rel?.aviso(`${cam}.doc.conectores`, `Mais de ${LIMITES.conectores} conectores: os excedentes foram ignorados.`);
  for (const [chave, rc, ehDic] of conEntradas.slice(0, LIMITES.conectores)) {
    const caminho = `${cam}.doc.conectores[${chave}]`;
    const v = validarConector(rc, rel, caminho, resolverItem, resolverCamada); if (!v || !ehObj(rc)) continue;
    let id = idSeguro(rc.id) ?? (ehDic ? idSeguro(chave) : null);
    if (!id || usados.has(id)) id = novoId();
    usados.add(id); v.id = id; conectores[id] = v;
  }

  // ---------- Lixeira ----------
  const lixeira: Lousa['lixeira'] = [];
  if (Array.isArray(r.lixeira)) r.lixeira.slice(0, LIMITES.lixeira).forEach((e, i) => {
    if (!ehObj(e)) return; const it = validarItem(e.item, rel, `${cam}.lixeira[${i}].item`, { resolverRegiao, resolverCamada, silenciarRefs: true }); if (!it) return;
    if (usados.has(it.id)) it.id = novoId(); usados.add(it.id);
    lixeira.push({ item: it, excluidoEm: paraTimestamp(e.excluidoEm) ?? Date.now() });
  });

  // ---------- Configurações, visualização e estudo ----------
  const camR = ehObj(r.camera) ? r.camera : {}; const LC = new Leitor(camR, `${cam}.camera`, rel);
  const visualizacao = validarVisualizacao(r.visualizacao, base, `${cam}.visualizacao`, rel, resolverRegiao);
  const estudo = aplicarEsquema(r.estudo, ESQUEMA_ESTUDO, base.estudo, `${cam}.estudo`, rel);
  if (ehObj(r.estudo) && ehObj(r.estudo.revisadosHoje)) { const RH = new Leitor(r.estudo.revisadosHoje, `${cam}.estudo.revisadosHoje`, rel); estudo.revisadosHoje = { dia: normalizarDia(r.estudo.revisadosHoje.dia) ?? '', quantidade: RH.num('quantidade', 0, 0, 100000, true) }; }

  const L = new Leitor(r, cam, rel);
  const lista = (k: string, max: number): unknown[] => { const v = r[k]; if (v === undefined || v === null) return []; if (!Array.isArray(v)) { rel?.aviso(`${cam}.${k}`, 'Deveria ser uma lista [ ]; ignorado.'); return []; } if (v.length > max) rel?.aviso(`${cam}.${k}`, `Mais de ${max} entradas: as excedentes foram ignoradas.`); return v.slice(0, max); };
  const idOuNovo = (v: unknown) => { const id = idSeguro(v); if (id && !usados.has(id)) { usados.add(id); return id; } return novoId(); };

  const novo: Lousa = {
    ...base,
    versao: VERSAO_FORMATO,
    id: idSeguro(r.id) ?? (r.id !== undefined ? (rel?.correcao(`${cam}.id`, `Id da lousa inválido ${fmt(r.id)}; gerado um novo.`), base.id) : base.id),
    nome: L.nome('nome', 80, 'Lousa importada'),
    doc: { itens, conectores, regioes, camadas },
    camera: { x: LC.num('x', base.camera.x), y: LC.num('y', base.camera.y), zoom: LC.num('zoom', 1, 0.05, 8) },
    config: aplicarEsquema(r.config, ESQUEMA_CONFIG, base.config, `${cam}.config`, rel),
    visualizacao,
    visoesSalvas: lista('visoesSalvas', LIMITES.visoes).filter(ehObj).map((v, i) => { const LV = new Leitor(ehObj(v.camera) ? v.camera : {}, `${cam}.visoesSalvas[${i}].camera`, rel); return { id: idOuNovo(v.id), nome: new Leitor(v, `${cam}.visoesSalvas[${i}]`, rel).nome('nome', 60, 'Visão'), visualizacao: validarVisualizacao(v.visualizacao, base, `${cam}.visoesSalvas[${i}].visualizacao`, rel, resolverRegiao), camera: { x: LV.num('x', 0), y: LV.num('y', 0), zoom: LV.num('zoom', 1, 0.05, 8) } }; }),
    lixeira,
    estudo,
    edital: lista('edital', LIMITES.edital).flatMap((t, i) => {
      if (!ehObj(t)) return []; const LT = new Leitor(t, `${cam}.edital[${i}]`, rel); const topico = LT.str('topico', 200).trim();
      if (!topico) { rel?.aviso(`${cam}.edital[${i}]`, 'Tópico do edital sem "topico" ignorado.'); return []; }
      return [{ id: idOuNovo(t.id), disciplina: LT.str('disciplina', 80, 'Geral').trim() || 'Geral', topico, status: LT.enumr('status', STATUS_ESTUDO, 'nao-visto'), dominio: LT.num('dominio', 0, 0, 100) }];
    }),
    questoes: lista('questoes', LIMITES.questoes).flatMap((q, i) => {
      if (!ehObj(q)) return []; const LQ = new Leitor(q, `${cam}.questoes[${i}]`, rel);
      const total = LQ.num('total', 0, 0, 100000, true); let acertos = LQ.num('acertos', 0, 0, 100000, true);
      if (acertos > total) { rel?.correcao(`${cam}.questoes[${i}].acertos`, `Acertos (${acertos}) maiores que o total (${total}): limitado a ${total}.`); acertos = total; }
      return [{ id: idOuNovo(q.id), data: LQ.data('data', Date.now()), disciplina: LQ.str('disciplina', 80), assunto: LQ.str('assunto', 120), acertos, total }];
    }),
    legenda: lista('legenda', LIMITES.legenda).filter(ehObj).map((l, i) => { const LL = new Leitor(l, `${cam}.legenda[${i}]`, rel); return { cor: LL.cor('cor', '#fff176'), significado: LL.str('significado', 60) }; }),
    modelosDivisao: lista('modelosDivisao', LIMITES.modelos).flatMap((m, i) => {
      if (!ehObj(m)) return []; const spec = validarEspecDivisao(m.spec, rel, `${cam}.modelosDivisao[${i}].spec`);
      if (!spec) { rel?.aviso(`${cam}.modelosDivisao[${i}]`, 'Modelo de divisão descartado (especificação inválida).'); return []; }
      return [{ id: idOuNovo(m.id), nome: new Leitor(m, `${cam}.modelosDivisao[${i}]`, rel).nome('nome', 60, 'Modelo'), spec }];
    }),
    arquivada: L.bool('arquivada'),
    criadoEm: L.data('criadoEm', Date.now()),
    alteradoEm: op.preservarTempo ? L.data('alteradoEm', Date.now()) : Date.now(),
  };
  if (r.legenda === undefined) novo.legenda = base.legenda;
  return novo;
}

function validarVisualizacao(v: unknown, base: Lousa, caminho: string, rel: Relatorio | undefined, resolverRegiao: (v: unknown) => string | undefined): Lousa['visualizacao'] {
  const vis = aplicarEsquema(v, ESQUEMA_VISUALIZACAO, { ...base.visualizacao }, caminho, rel, ['filtro']) as Lousa['visualizacao'];
  const filtro = aplicarEsquema(ehObj(v) ? v.filtro : undefined, ESQUEMA_FILTRO, base.visualizacao.filtro, `${caminho}.filtro`, rel);
  if (filtro.regiao) { const id = resolverRegiao(filtro.regiao); if (!id) rel?.aviso(`${caminho}.filtro.regiao`, `Região ${fmt(filtro.regiao)} não existe; filtro de região desligado.`); filtro.regiao = id ?? null; }
  return { ...vis, filtro };
}
