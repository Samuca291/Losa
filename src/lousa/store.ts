// ============================================================
// ESTADO ÚNICO + HISTÓRICO (desfazer/refazer por gesto) + AÇÕES
// A tela só reflete este estado. Nada importante vive só no DOM.
// ============================================================
import { useSyncExternalStore } from 'react';
import {
  CORES_REGIAO, DIAS_LIXEIRA, LIMITES_ZOOM, TAMANHOS_POSTIT, VERSAO_FORMATO,
  type Camada, type Camera, type Conector, type Doc, type EstiloRegiao, type Item, type Lousa, type Ponto,
  type Regiao, type Retangulo, type StatusEstudo, type TipoItem, type Visualizacao,
} from './types';
import {
  bboxDePontos, bboxItemGirado, cantosItem, centroItem, centroidePoligono, cliparPoligono, clamp, ehConvexo,
  pontoEmPoligono, pontoEmRetangulo, poligonoDoRetangulo, rotacionarPonto, uniaoRetangulos, zoomEmTorno,
} from './utils/geometria';
import { bboxesDoLayout, colunas, linhas, type EspecDivisao } from './utils/divisoes';
import { sanitizarHtml, textoParaHtml } from './utils/seguranca';

// ---------- Utilidades ----------
export const gerarId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const DIA_MS = 86_400_000;

export type Ferramenta = 'selecionar' | 'mao' | 'postit' | 'texto' | 'caixa' | 'titulo' | 'forma' | 'desenho' | 'marcador' | 'borracha' | 'conector' | 'poligono' | 'laco' | 'linha-divisao' | 'regiao' | 'tarefas' | 'cloze';

export interface Toast { id: string; texto: string; acao?: { rotulo: string; fn: () => void }; tipo?: 'info' | 'erro' | 'ok' }
export type Dialogo =
  | { tipo: 'dividir'; regiaoId: string | null }
  | { tipo: 'ajuda' } | { tipo: 'paleta' } | { tipo: 'sobre' } | { tipo: 'lousas' } | { tipo: 'exportar' } | { tipo: 'importar-lista' }
  | { tipo: 'colar'; texto: string; html: string; pos: Ponto }
  | { tipo: 'fila-revisao' } | { tipo: 'edital' } | { tipo: 'apresentacao' } | { tipo: 'teste-carga' } | { tipo: 'imagem'; id: string }
  | { tipo: 'nova-regiao' } | { tipo: 'estatisticas' } | { tipo: 'lixeira' } | { tipo: 'backups' } | { tipo: 'caderno-erros' } | { tipo: 'questoes' } | { tipo: 'modelos' };

export interface UI {
  ferramenta: Ferramenta;
  formaAtual: string;
  corAtual: string;
  corDesenho: string;
  espessuraDesenho: number;
  selecao: string[];
  conectorSelecionado: string | null;
  regiaoSelecionada: string | null;
  editando: string | null;
  painel: 'propriedades' | 'camadas' | 'regioes' | 'estudo' | 'dados' | 'busca' | 'config' | null;
  dialogo: Dialogo | null;
  menuContexto: { x: number; y: number; alvo: 'item' | 'regiao' | 'fundo' | 'conector'; id?: string } | null;
  toasts: Toast[];
  guias: { v: number[]; h: number[] };
  marquee: Retangulo | null;
  pontosPoligono: Ponto[];
  tracoAtual: Ponto[] | null;
  conectorRascunho: { de: string; ate: Ponto } | null;
  viewport: { w: number; h: number };
  salvando: 'ok' | 'salvando' | 'erro' | 'indisponivel' | 'inicial';
  deslocamentoTempo: number;
  outraAba: boolean;
  espacoPressionado: boolean;
  regiaoIsolada: string | null;
  destaqueBusca: string | null;
  conexoesDe: string | null;
  lousas: { id: string; nome: string; alteradoEm: number; arquivada: boolean; qtdItens: number; origem?: 'local' | 'nuvem' | 'ambos' }[];
  armazenamentoIndisponivel: boolean;
  carregado: boolean;
  anuncio: string;
  apresentacao: { indice: number } | null;
  arrastando: boolean;
  historico: { passado: number; futuro: number };
  pomodoro: { fase: 'parado' | 'foco' | 'pausa'; fim: number | null; ciclos: number };
  barraRapida: boolean;
  mostrarInterface: boolean;
  espaco: { usado: number; cota: number } | null;
  tenteLembrar: Record<string, number>;
  placarProva: { acertos: number; erros: number };
  ultimoBackupLembrete: number;
  // --- Novos (v2) ---
  nuvem: { status: 'verificando' | 'conectada' | 'offline' | 'desativada' | 'sincronizando' | 'erro'; ultimaSync: number | null; erro: string | null; modo?: 'postgres' | 'local' };
  nuvemTotal: number;
  itemSobMouse: string | null;          // para mostrar as portas de conexão
  alvoConector: string | null;          // item destacado enquanto se arrasta um conector
  recemCriado: string | null;           // anima a entrada do item
  menuFormatoPos: { x: number; y: number } | null;
  boasVindasFechada: boolean;
  // --- Conectores (v3) ---
  conectorPendente: string | null;      // clique-a-clique: origem escolhida, aguardando o destino
  rotuloEditando: string | null;        // conector cujo rótulo está sendo editado inline
  conectorRecem: string | null;         // anima o traçado do conector recém-criado
  conectorSobMouse: string | null;
  reconectando: { id: string; extremo: 'de' | 'para' } | null; // arrastando uma ponta para outro item
}

export interface Estado { lousa: Lousa; ui: UI }

export function criarLousaVazia(nome = 'Minha lousa'): Lousa {
  const agora = Date.now();
  return {
    versao: VERSAO_FORMATO, id: gerarId(), nome,
    doc: { itens: {}, conectores: {}, regioes: {}, camadas: [{ id: 'principal', nome: 'Teoria', visivel: true, travada: false, opacidade: 1 }, { id: 'duvidas', nome: 'Dúvidas', visivel: true, travada: false, opacidade: 1 }, { id: 'erros', nome: 'Erros', visivel: true, travada: false, opacidade: 1 }, { id: 'revisao', nome: 'Revisão', visivel: true, travada: false, opacidade: 1 }, { id: 'anotacoes', nome: 'Anotações', visivel: true, travada: false, opacidade: 1 }] },
    camera: { x: 80, y: 80, zoom: 1 },
    config: { fundo: 'pontilhado', corFundo: '#f5f3ec', intensidadeFundo: 0.5, grade: false, tamanhoGrade: 20, guiasInteligentes: true, anguloAleatorio: true, itensAcompanhamRegiao: true, tema: 'claro', escalaInterface: 1, animacoes: true, corretorOrtografico: true, coresFavoritas: [], fontePadrao: 'Padrão',
      sincronizarNuvem: true, duploCliqueCria: true, portasConexao: true, tamanhoPostit: 'medio', estiloConector: 'curvo', corConector: '#475569', setaConector: true, autoAjusteAltura: false, zoomSuave: true, temaAuto: false,
      desviarObstaculos: true, saltosLinha: true, conectoresAcima: false, raioCanto: 12, margemDesvio: 18, rotulosConector: true, atalhosMarkdown: true, sombraPostit: true },
    visualizacao: { modo: 'tudo', ocultarTudo: false, modoFoco: false, modoProva: false, tiposOcultos: [], mostrarConectores: true, mostrarRegioes: true, mostrarRotulos: true, esmaecerOcultos: false, opacidadeEsmaecer: 0.15, filtro: { cor: null, etiqueta: null, regiao: null, status: null, texto: '', esmaecer: true }, destacarTipo: null, minimapa: true, legenda: false, reguas: false },
    visoesSalvas: [], lixeira: [],
    estudo: { intervalos: [1, 7, 30], metaDiaria: 10, revisadosHoje: { dia: '', quantidade: 0 }, sequenciaDias: 0, ultimoDiaMeta: '', intercalar: true, dataProva: null, nomeProva: '', pomodoroFoco: 25, pomodoroPausa: 5 },
    edital: [], questoes: [], legenda: [{ cor: '#ef9a9a', significado: 'Exceção' }, { cor: '#a5d6a7', significado: 'Regra geral' }, { cor: '#fff176', significado: 'Conceito' }], modelosDivisao: [],
    arquivada: false, criadoEm: agora, alteradoEm: agora,
  };
}

const uiInicial: UI = {
  ferramenta: 'selecionar', formaAtual: 'retangulo', corAtual: '#fff176', corDesenho: '#1f2937', espessuraDesenho: 3,
  selecao: [], conectorSelecionado: null, regiaoSelecionada: null, editando: null, painel: null, dialogo: null, menuContexto: null,
  toasts: [], guias: { v: [], h: [] }, marquee: null, pontosPoligono: [], tracoAtual: null, conectorRascunho: null,
  viewport: { w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 }, salvando: 'inicial', deslocamentoTempo: 0, outraAba: false, espacoPressionado: false,
  regiaoIsolada: null, destaqueBusca: null, conexoesDe: null, lousas: [], armazenamentoIndisponivel: false, carregado: false, anuncio: '',
  apresentacao: null, arrastando: false, historico: { passado: 0, futuro: 0 }, pomodoro: { fase: 'parado', fim: null, ciclos: 0 },
  barraRapida: false, mostrarInterface: true, espaco: null, tenteLembrar: {}, placarProva: { acertos: 0, erros: 0 }, ultimoBackupLembrete: 0,
  nuvem: { status: 'verificando', ultimaSync: null, erro: null }, nuvemTotal: 0, itemSobMouse: null, alvoConector: null, recemCriado: null, menuFormatoPos: null, boasVindasFechada: false,
  conectorPendente: null, rotuloEditando: null, conectorRecem: null, conectorSobMouse: null, reconectando: null,
};

let estado: Estado = { lousa: criarLousaVazia(), ui: uiInicial };
const ouvintes = new Set<() => void>();
const emitir = () => { for (const o of ouvintes) o(); };
const assinar = (fn: () => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };
export const getEstado = () => estado;
export const useEstado = <T,>(sel: (e: Estado) => T): T => useSyncExternalStore(assinar, () => sel(estado), () => sel(estado));
export const useUI = <T,>(sel: (u: UI) => T): T => useEstado((e) => sel(e.ui));
export const useLousa = <T,>(sel: (l: Lousa) => T): T => useEstado((e) => sel(e.lousa));
export const assinarEstado = assinar;

export function setUI(patch: Partial<UI> | ((u: UI) => Partial<UI>)) {
  const p = typeof patch === 'function' ? patch(estado.ui) : patch;
  estado = { ...estado, ui: { ...estado.ui, ...p } };
  emitir();
}
export function setLousa(fn: (l: Lousa) => Partial<Lousa>) {
  estado = { ...estado, lousa: { ...estado.lousa, ...fn(estado.lousa), alteradoEm: Date.now() } };
  emitir();
}
export function substituirLousa(l: Lousa) {
  passado = []; futuro = []; gestoAntes = null;
  estado = { ...estado, lousa: l, ui: { ...estado.ui, selecao: [], editando: null, regiaoSelecionada: null, conectorSelecionado: null, regiaoIsolada: null, conectorPendente: null, rotuloEditando: null, reconectando: null, conectorRascunho: null, historico: { passado: 0, futuro: 0 } } };
  emitir();
}

// ---------- Histórico (padrão comando por snapshot imutável) ----------
let passado: Doc[] = []; let futuro: Doc[] = []; let gestoAntes: Doc | null = null;
const LIMITE_HISTORICO = 120;
const atualizarContadores = () => { estado = { ...estado, ui: { ...estado.ui, historico: { passado: passado.length, futuro: futuro.length } } }; };

export function setDoc(fn: (d: Doc) => Doc, historico = true) {
  const anterior = estado.lousa.doc;
  const novo = fn(anterior);
  if (novo === anterior) return;
  if (historico && !gestoAntes) { passado.push(anterior); if (passado.length > LIMITE_HISTORICO) passado.shift(); futuro = []; }
  estado = { ...estado, lousa: { ...estado.lousa, doc: novo, alteradoEm: Date.now() } };
  atualizarContadores(); emitir();
}
export function iniciarGesto() { if (!gestoAntes) gestoAntes = estado.lousa.doc; }
export function finalizarGesto() {
  if (gestoAntes && gestoAntes !== estado.lousa.doc) { passado.push(gestoAntes); if (passado.length > LIMITE_HISTORICO) passado.shift(); futuro = []; }
  gestoAntes = null; atualizarContadores(); emitir();
}
export function cancelarGesto() { if (gestoAntes) { estado = { ...estado, lousa: { ...estado.lousa, doc: gestoAntes } }; gestoAntes = null; emitir(); } }
export function desfazer() {
  if (estado.ui.editando) return; // dentro do texto vale o desfazer do campo
  const d = passado.pop(); if (!d) return;
  futuro.push(estado.lousa.doc);
  estado = { ...estado, lousa: { ...estado.lousa, doc: d, alteradoEm: Date.now() }, ui: { ...estado.ui, selecao: estado.ui.selecao.filter((id) => d.itens[id]) } };
  atualizarContadores(); emitir(); anunciar('Ação desfeita');
}
export function refazer() {
  if (estado.ui.editando) return;
  const d = futuro.pop(); if (!d) return;
  passado.push(estado.lousa.doc);
  estado = { ...estado, lousa: { ...estado.lousa, doc: d, alteradoEm: Date.now() }, ui: { ...estado.ui, selecao: estado.ui.selecao.filter((id) => d.itens[id]) } };
  atualizarContadores(); emitir(); anunciar('Ação refeita');
}

// ---------- Avisos ----------
export function avisar(texto: string, acao?: Toast['acao'], tipo: Toast['tipo'] = 'info', duracao = 4500) {
  const id = gerarId();
  setUI((u) => ({ toasts: [...u.toasts.slice(-3), { id, texto, acao, tipo }], anuncio: texto }));
  window.setTimeout(() => setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) })), duracao);
}
export const anunciar = (texto: string) => setUI({ anuncio: texto });
export const fecharToast = (id: string) => setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) }));

// ---------- Tempo (com simulação) ----------
export const agora = () => Date.now() + estado.ui.deslocamentoTempo;
export const chaveDia = (ts = agora()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const fimDoDia = (ts = agora()) => { const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime(); };

// ---------- Câmera ----------
export const setCamera = (c: Camera) => { if (animCamera) { cancelAnimationFrame(animCamera); animCamera = null; } setLousa(() => ({ camera: { ...c, zoom: clamp(c.zoom, LIMITES_ZOOM.min, LIMITES_ZOOM.max) } })); };
let animCamera: number | null = null;
/** Anima a câmera até o destino (ease-out). Cai para setCamera se animações/zoom suave estiverem desligados. */
export function animarCamera(destino: Camera, ms = 320) {
  const cfg = estado.lousa.config; const de = estado.lousa.camera;
  if (!cfg.animacoes || !cfg.zoomSuave || typeof requestAnimationFrame === 'undefined') { setCamera(destino); return; }
  if (animCamera) cancelAnimationFrame(animCamera);
  const para = { ...destino, zoom: clamp(destino.zoom, LIMITES_ZOOM.min, LIMITES_ZOOM.max) }; const t0 = performance.now();
  const passo = (t: number) => {
    const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3);
    setLousa(() => ({ camera: { x: de.x + (para.x - de.x) * e, y: de.y + (para.y - de.y) * e, zoom: de.zoom + (para.zoom - de.zoom) * e } }));
    if (k < 1) animCamera = requestAnimationFrame(passo); else animCamera = null;
  };
  animCamera = requestAnimationFrame(passo);
}
export function zoomPara(zoom: number, centroTela?: Ponto) {
  const { camera } = estado.lousa; const vp = estado.ui.viewport;
  const p = centroTela ?? { x: vp.w / 2, y: vp.h / 2 };
  animarCamera(zoomEmTorno(camera, p, clamp(zoom, LIMITES_ZOOM.min, LIMITES_ZOOM.max)), 220);
}
export function enquadrar(r: Retangulo, margem = 60, zoomMax = 1.5) {
  const vp = estado.ui.viewport; if (r.w <= 0 || r.h <= 0) return;
  const zoom = clamp(Math.min((vp.w - margem * 2) / r.w, (vp.h - margem * 2) / r.h), LIMITES_ZOOM.min, zoomMax);
  animarCamera({ zoom, x: vp.w / 2 - (r.x + r.w / 2) * zoom, y: vp.h / 2 - (r.y + r.h / 2) * zoom });
}
export function verTudo() {
  const { itens, regioes } = estado.lousa.doc;
  const caixas = [...Object.values(itens).filter((i) => !i.oculto).map(bboxItemGirado), ...Object.values(regioes).filter((r) => !r.pai).map((r) => r.bbox)];
  if (!caixas.length) { voltarInicio(); return; }
  enquadrar(uniaoRetangulos(caixas), 60, 2);
}
export const voltarInicio = () => animarCamera({ x: 80, y: 80, zoom: 1 });
export function irParaRegiao(id: string) { const r = estado.lousa.doc.regioes[id]; if (r) { enquadrar(r.bbox, 40, 2); setUI({ regiaoSelecionada: id }); } }
export function irParaItem(id: string) { const it = estado.lousa.doc.itens[id]; if (it) { enquadrar(bboxItemGirado(it), 200, 1.2); setUI({ selecao: [id], destaqueBusca: id }); window.setTimeout(() => setUI({ destaqueBusca: null }), 2000); } }
export function centroDaTelaNoMundo(): Ponto { const { camera } = estado.lousa; const vp = estado.ui.viewport; return { x: (vp.w / 2 - camera.x) / camera.zoom, y: (vp.h / 2 - camera.y) / camera.zoom }; }

// ---------- Regiões: consultas ----------
export function profundidadeRegiao(id: string, regioes: Record<string, Regiao>): number { let d = 0; let r = regioes[id]; while (r?.pai) { d++; r = regioes[r.pai]; } return d; }
export function pontoEmRegiao(p: Ponto, r: Regiao): boolean { return pontoEmRetangulo(p, r.bbox) && (!r.pontos || pontoEmPoligono(p, r.pontos)); }
export function regiaoNoPonto(p: Ponto, regioes = estado.lousa.doc.regioes): Regiao | null {
  let melhor: Regiao | null = null; let melhorProf = -1; let melhorArea = Infinity;
  for (const r of Object.values(regioes)) {
    if (r.oculta || !pontoEmRegiao(p, r)) continue;
    const prof = profundidadeRegiao(r.id, regioes); const area = r.bbox.w * r.bbox.h;
    if (prof > melhorProf || (prof === melhorProf && area < melhorArea)) { melhor = r; melhorProf = prof; melhorArea = area; }
  }
  return melhor;
}
export function descendentes(id: string, regioes: Record<string, Regiao>): string[] { const out: string[] = []; const pilha = [id]; while (pilha.length) { const a = pilha.pop()!; out.push(a); const r = regioes[a]; if (r) pilha.push(...r.filhos); } return out; }
export function caminhoRegiao(id: string | null, regioes = estado.lousa.doc.regioes): string[] { const out: string[] = []; let r = id ? regioes[id] : null; while (r) { out.unshift(r.nome); r = r.pai ? regioes[r.pai] : null; } return ['Lousa', ...out]; }
export const poligonoRegiao = (r: Regiao) => r.pontos ?? poligonoDoRetangulo(r.bbox);
export const regioesOcultasSet = (regioes: Record<string, Regiao>) => { const s = new Set<string>(); for (const r of Object.values(regioes)) if (r.oculta || r.recolhida) for (const d of descendentes(r.id, regioes)) s.add(d); return s; };

// ---------- Itens ----------
export function proximoZ(itens: Record<string, Item>): number { let m = 0; for (const it of Object.values(itens)) if (it.z > m) m = it.z; return m + 1; }
export function novoItem(parcial: Partial<Item> & { tipo: TipoItem }): Item {
  const l = estado.lousa; const ts = Date.now();
  const base: Item = {
    id: gerarId(), tipo: parcial.tipo, x: 0, y: 0, w: 200, h: 200, angulo: l.config.anguloAleatorio && parcial.tipo === 'postit' ? (Math.random() * 6 - 3) : 0, z: proximoZ(l.doc.itens),
    camada: ['desenho'].includes(parcial.tipo) ? 'anotacoes' : 'principal', regiao: null, grupo: null, travado: false, oculto: false, fixado: false, criadoEm: ts, alteradoEm: ts,
    cor: estado.ui.corAtual, fonte: l.config.fontePadrao, tamanhoFonte: 15, autoAjuste: false, titulo: '', etiquetas: [], status: 'nao-visto',
    revisao: { ativa: false, indice: 0, proxima: null, historico: [] }, html: '',
  };
  const it = { ...base, ...parcial, id: parcial.id ?? base.id };
  if (it.tipo === 'postit') { const t = TAMANHOS_POSTIT[l.config.tamanhoPostit] ?? TAMANHOS_POSTIT.medio; it.w = parcial.w ?? t.w; it.h = parcial.h ?? t.h; if (parcial.autoAjuste === undefined) it.autoAjuste = l.config.autoAjusteAltura; }
  if (it.tipo === 'texto') { it.w = parcial.w ?? 240; it.h = parcial.h ?? 60; it.cor = 'transparent'; }
  if (it.tipo === 'titulo') { it.w = parcial.w ?? 420; it.h = parcial.h ?? 70; it.cor = 'transparent'; it.tamanhoFonte = parcial.tamanhoFonte ?? 32; }
  if (it.tipo === 'caixa') { it.w = parcial.w ?? 260; it.h = parcial.h ?? 160; it.cor = parcial.cor ?? '#ffffff'; }
  if (it.tipo === 'tarefas') { it.w = parcial.w ?? 220; it.h = parcial.h ?? 180; it.tarefas = parcial.tarefas ?? [{ texto: 'Primeira tarefa', feito: false }]; }
  if (it.tipo === 'tabela') { it.w = parcial.w ?? 320; it.h = parcial.h ?? 160; it.tabela = parcial.tabela ?? [['Critério', 'A', 'B'], ['', '', ''], ['', '', '']]; it.cor = parcial.cor ?? '#ffffff'; }
  if (it.tipo === 'link') { it.w = parcial.w ?? 260; it.h = parcial.h ?? 90; it.cor = parcial.cor ?? '#ffffff'; }
  if (it.tipo === 'forma') { it.w = parcial.w ?? 180; it.h = parcial.h ?? 120; it.forma = parcial.forma ?? estado.ui.formaAtual; }
  if (it.tipo === 'cloze') { it.w = parcial.w ?? 280; it.h = parcial.h ?? 140; it.cor = parcial.cor ?? '#e6ee9c'; }
  if (it.tipo === 'contador') { it.w = parcial.w ?? 120; it.h = parcial.h ?? 90; it.valor = parcial.valor ?? 0; }
  if (it.tipo === 'fita') { it.w = parcial.w ?? 120; it.h = parcial.h ?? 30; it.cor = parcial.cor ?? 'rgba(255,240,180,0.8)'; it.angulo = parcial.angulo ?? -8; }
  if (it.tipo === 'pino') { it.w = parcial.w ?? 28; it.h = parcial.h ?? 28; it.cor = parcial.cor ?? '#ef4444'; it.angulo = 0; }
  if (it.tipo === 'carimbo') { it.w = parcial.w ?? 150; it.h = parcial.h ?? 60; it.carimbo = parcial.carimbo ?? 'importante'; it.cor = parcial.cor ?? '#dc2626'; it.angulo = parcial.angulo ?? -12; }
  if (it.tipo === 'imagem') { it.opacidade = parcial.opacidade ?? 1; }
  if (!parcial.regiao) { const r = regiaoNoPonto(centroItem(it)); it.regiao = r?.id ?? null; }
  return it;
}
export function criarItem(parcial: Partial<Item> & { tipo: TipoItem }, opts: { selecionar?: boolean; editar?: boolean; anunciarCriacao?: boolean } = { selecionar: true }): Item {
  const it = novoItem(parcial);
  setDoc((d) => ({ ...d, itens: { ...d.itens, [it.id]: it } }));
  if (opts.selecionar !== false) setUI({ selecao: [it.id], conectorSelecionado: null, editando: opts.editar ? it.id : null, anuncio: `${nomeTipo(it.tipo)} criado` });
  marcarRecemCriado(it.id);
  return it;
}
let timerRecem: number | null = null;
export function marcarRecemCriado(id: string) {
  if (typeof window === 'undefined' || !estado.lousa.config.animacoes) return;
  setUI({ recemCriado: id }); if (timerRecem) window.clearTimeout(timerRecem);
  timerRecem = window.setTimeout(() => setUI((u) => (u.recemCriado === id ? { recemCriado: null } : {})), 420);
}
/** Duplo clique em área vazia: cria um post-it centrado no ponto (ou dentro da região clicada) e já abre para edição. */
export function criarPostitEm(p: Ponto, opts: { tipo?: TipoItem; editar?: boolean } = {}): Item | null {
  const cfg = estado.lousa.config; const t = TAMANHOS_POSTIT[cfg.tamanhoPostit] ?? TAMANHOS_POSTIT.medio;
  const tipo = opts.tipo ?? 'postit'; const w = tipo === 'postit' ? t.w : 240, h = tipo === 'postit' ? t.h : 60;
  let x = p.x - w / 2, y = p.y - h / 2;
  if (cfg.grade) { x = Math.round(x / cfg.tamanhoGrade) * cfg.tamanhoGrade; y = Math.round(y / cfg.tamanhoGrade) * cfg.tamanhoGrade; }
  const r = regiaoNoPonto(p);
  if (r && r.pontos === null) { // mantém dentro do retângulo da região
    x = clamp(x, r.bbox.x + 8, Math.max(r.bbox.x + 8, r.bbox.x + r.bbox.w - w - 8)); y = clamp(y, r.bbox.y + 36, Math.max(r.bbox.y + 36, r.bbox.y + r.bbox.h - h - 8));
  }
  return criarItem({ tipo, x, y, w, h, regiao: r?.id ?? null }, { selecionar: true, editar: opts.editar !== false });
}
/** Arrastou um conector e soltou no vazio: cria um novo item igual ao de origem e conecta os dois. */
export function conectarCriandoNovo(deId: string, destino: Ponto): Item | null {
  const de = estado.lousa.doc.itens[deId]; if (!de) return null;
  const tipo: TipoItem = ['postit', 'caixa', 'texto', 'titulo', 'cloze'].includes(de.tipo) ? de.tipo : 'postit';
  const novo = criarItem({ tipo, x: destino.x - de.w / 2, y: destino.y - de.h / 2, w: de.w, h: de.h, cor: de.cor, fonte: de.fonte, tamanhoFonte: de.tamanhoFonte, etiquetas: de.etiquetas, camada: de.camada, angulo: 0 }, { selecionar: true, editar: true });
  criarConector(deId, novo.id); setUI({ selecao: [novo.id], editando: novo.id, conectorSelecionado: null });
  avisar('Post-it conectado criado', undefined, 'ok', 2500);
  return novo;
}
export const nomeTipo = (t: TipoItem) => ({ postit: 'Post-it', texto: 'Texto', titulo: 'Título', caixa: 'Caixa', tarefas: 'Lista de tarefas', tabela: 'Tabela', imagem: 'Imagem', link: 'Link', desenho: 'Desenho', forma: 'Forma', cloze: 'Lacunas', contador: 'Contador', fita: 'Fita', pino: 'Pino', carimbo: 'Carimbo' } as Record<TipoItem, string>)[t];

export function atualizarItem(id: string, patch: Partial<Item>, historico = true) {
  setDoc((d) => { const it = d.itens[id]; if (!it) return d; return { ...d, itens: { ...d.itens, [id]: { ...it, ...patch, alteradoEm: Date.now() } } }; }, historico);
}
export function atualizarItens(ids: string[], fn: (it: Item) => Partial<Item>, historico = true) {
  setDoc((d) => { const itens = { ...d.itens }; let mudou = false; for (const id of ids) { const it = itens[id]; if (!it) continue; itens[id] = { ...it, ...fn(it), alteradoEm: Date.now() }; mudou = true; } return mudou ? { ...d, itens } : d; }, historico);
}
export function excluirItens(ids: string[], silencioso = false) {
  const vivos = ids.filter((id) => estado.lousa.doc.itens[id] && !estado.lousa.doc.itens[id].travado);
  if (!vivos.length) { if (ids.length && !silencioso) avisar('Item travado: destrave para excluir.'); return; }
  const excluidos = vivos.map((id) => estado.lousa.doc.itens[id]);
  setDoc((d) => {
    const itens = { ...d.itens }; for (const id of vivos) delete itens[id];
    const conectores = Object.fromEntries(Object.entries(d.conectores).filter(([, c]) => !vivos.includes(c.de) && !vivos.includes(c.para)));
    return { ...d, itens, conectores };
  });
  const ts = Date.now();
  setLousa((l) => ({ lixeira: [...excluidos.map((item) => ({ item, excluidoEm: ts })), ...l.lixeira].filter((e) => ts - e.excluidoEm < DIAS_LIXEIRA * DIA_MS).slice(0, 500) }));
  setUI((u) => ({ selecao: u.selecao.filter((id) => !vivos.includes(id)), editando: null, conectorPendente: u.conectorPendente && vivos.includes(u.conectorPendente) ? null : u.conectorPendente }));
  if (!silencioso) avisar(vivos.length === 1 ? 'Item excluído' : `${vivos.length} itens excluídos`, { rotulo: 'Desfazer', fn: desfazer });
}
export function restaurarDaLixeira(id: string) {
  const e = estado.lousa.lixeira.find((x) => x.item.id === id); if (!e) return;
  setDoc((d) => ({ ...d, itens: { ...d.itens, [id]: { ...e.item, z: proximoZ(d.itens) } } }));
  setLousa((l) => ({ lixeira: l.lixeira.filter((x) => x.item.id !== id) }));
  avisar('Item restaurado');
}
export const esvaziarLixeira = () => setLousa(() => ({ lixeira: [] }));
export function duplicarItens(ids: string[], deslocamento = 24): string[] {
  const novos: Item[] = []; const mapa: Record<string, string> = {};
  for (const id of ids) { const it = estado.lousa.doc.itens[id]; if (!it) continue; const nid = gerarId(); mapa[id] = nid; novos.push({ ...it, id: nid, x: it.x + deslocamento, y: it.y + deslocamento, z: 0, criadoEm: Date.now(), alteradoEm: Date.now(), travado: false }); }
  if (!novos.length) return [];
  setDoc((d) => { let z = proximoZ(d.itens); const itens = { ...d.itens }; for (const n of novos) { n.z = z++; itens[n.id] = n; } const conectores = { ...d.conectores }; for (const c of Object.values(d.conectores)) if (mapa[c.de] && mapa[c.para]) { const nc = gerarId(); conectores[nc] = { ...c, id: nc, de: mapa[c.de], para: mapa[c.para] }; } return { ...d, itens, conectores }; });
  setUI({ selecao: novos.map((n) => n.id) });
  reatribuirRegioes(novos.map((n) => n.id));
  return novos.map((n) => n.id);
}
export function reatribuirRegioes(ids: string[]) {
  setDoc((d) => { const itens = { ...d.itens }; let mudou = false; for (const id of ids) { const it = itens[id]; if (!it) continue; const r = regiaoNoPonto(centroItem(it), d.regioes); const rid = r?.id ?? null; if (rid !== it.regiao) { itens[id] = { ...it, regiao: rid }; mudou = true; } } return mudou ? { ...d, itens } : d; }, false);
}
export function ordenarZ(ids: string[], modo: 'frente' | 'tras') {
  setDoc((d) => { const itens = { ...d.itens }; if (modo === 'frente') { let z = proximoZ(d.itens); for (const id of ids) if (itens[id]) itens[id] = { ...itens[id], z: z++ }; } else { let min = Infinity; for (const it of Object.values(d.itens)) if (it.z < min) min = it.z; let z = min - ids.length; for (const id of ids) if (itens[id]) itens[id] = { ...itens[id], z: z++ }; } return { ...d, itens }; });
}
export function moverPor(ids: string[], dx: number, dy: number) {
  atualizarItens(ids.filter((id) => !estado.lousa.doc.itens[id]?.travado), (it) => ({ x: it.x + dx, y: it.y + dy }));
  reatribuirRegioes(ids); anunciar(`Movido ${dx ? (dx > 0 ? 'para a direita' : 'para a esquerda') : dy > 0 ? 'para baixo' : 'para cima'}`);
}
export function girarPor(ids: string[], graus: number) { atualizarItens(ids, (it) => ({ angulo: ((it.angulo + graus) % 360 + 360) % 360 })); }
export function agrupar(ids: string[]) { if (ids.length < 2) return; const g = gerarId(); atualizarItens(ids, () => ({ grupo: g })); avisar('Itens agrupados'); }
export function desagrupar(ids: string[]) { atualizarItens(ids, () => ({ grupo: null })); avisar('Grupo desfeito'); }
export function expandirGrupos(ids: string[]): string[] { const itens = estado.lousa.doc.itens; const grupos = new Set(ids.map((id) => itens[id]?.grupo).filter(Boolean)); if (!grupos.size) return ids; const out = new Set(ids); for (const it of Object.values(itens)) if (it.grupo && grupos.has(it.grupo)) out.add(it.id); return [...out]; }

// Alinhar, distribuir, empilhar, organizar
export function alinhar(ids: string[], tipo: 'esquerda' | 'centro' | 'direita' | 'topo' | 'meio' | 'base') {
  const itens = ids.map((id) => estado.lousa.doc.itens[id]).filter(Boolean); if (itens.length < 2) return;
  const u = uniaoRetangulos(itens.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h })));
  atualizarItens(ids, (it) => { switch (tipo) { case 'esquerda': return { x: u.x }; case 'centro': return { x: u.x + u.w / 2 - it.w / 2 }; case 'direita': return { x: u.x + u.w - it.w }; case 'topo': return { y: u.y }; case 'meio': return { y: u.y + u.h / 2 - it.h / 2 }; default: return { y: u.y + u.h - it.h }; } });
}
export function distribuir(ids: string[], dir: 'h' | 'v') {
  const itens = ids.map((id) => estado.lousa.doc.itens[id]).filter(Boolean).sort((a, b) => (dir === 'h' ? a.x - b.x : a.y - b.y)); if (itens.length < 3) return;
  const total = dir === 'h' ? itens[itens.length - 1].x + itens[itens.length - 1].w - itens[0].x : itens[itens.length - 1].y + itens[itens.length - 1].h - itens[0].y;
  const soma = itens.reduce((s, i) => s + (dir === 'h' ? i.w : i.h), 0); const gap = (total - soma) / (itens.length - 1);
  let pos = dir === 'h' ? itens[0].x : itens[0].y; const novas: Record<string, number> = {};
  for (const it of itens) { novas[it.id] = pos; pos += (dir === 'h' ? it.w : it.h) + gap; }
  atualizarItens(ids, (it) => (dir === 'h' ? { x: novas[it.id] } : { y: novas[it.id] }));
}
export function empilhar(ids: string[], modo: 'coluna' | 'linha' | 'grade' | 'cascata', origem?: Ponto, ordenacao?: (a: Item, b: Item) => number) {
  const itens = ids.map((id) => estado.lousa.doc.itens[id]).filter(Boolean); if (!itens.length) return;
  if (ordenacao) itens.sort(ordenacao);
  const o = origem ?? { x: Math.min(...itens.map((i) => i.x)), y: Math.min(...itens.map((i) => i.y)) }; const gap = 16;
  const cols = Math.max(1, Math.ceil(Math.sqrt(itens.length))); const novas: Record<string, Ponto> = {};
  let x = o.x, y = o.y, alturaLinha = 0;
  itens.forEach((it, i) => {
    if (modo === 'coluna') { novas[it.id] = { x: o.x, y }; y += it.h + gap; }
    else if (modo === 'linha') { novas[it.id] = { x, y: o.y }; x += it.w + gap; }
    else if (modo === 'cascata') { novas[it.id] = { x: o.x + i * 28, y: o.y + i * 28 }; }
    else { if (i % cols === 0 && i) { x = o.x; y += alturaLinha + gap; alturaLinha = 0; } novas[it.id] = { x, y }; x += it.w + gap; alturaLinha = Math.max(alturaLinha, it.h); }
  });
  atualizarItens(ids, (it) => ({ ...novas[it.id], angulo: modo === 'cascata' ? it.angulo : 0 }));
  reatribuirRegioes(ids);
}
export function organizarPor(ids: string[], criterio: 'cor' | 'etiqueta' | 'data' | 'alfabetica' | 'status') {
  const cmp: (a: Item, b: Item) => number = criterio === 'cor' ? (a, b) => a.cor.localeCompare(b.cor) : criterio === 'etiqueta' ? (a, b) => (a.etiquetas[0] ?? 'zzz').localeCompare(b.etiquetas[0] ?? 'zzz') : criterio === 'data' ? (a, b) => a.criadoEm - b.criadoEm : criterio === 'status' ? (a, b) => a.status.localeCompare(b.status) : (a, b) => textoDoItem(a).localeCompare(textoDoItem(b));
  empilhar(ids, 'grade', undefined, cmp); avisar('Itens organizados');
}
export const bagunçar = (ids: string[]) => atualizarItens(ids, () => ({ angulo: Math.random() * 10 - 5 }));
export function textoDoItem(it: Item): string { const div = document.createElement('div'); div.innerHTML = it.html; return `${it.titulo} ${div.textContent ?? ''} ${it.tarefas?.map((t) => t.texto).join(' ') ?? ''} ${it.tabela?.flat().join(' ') ?? ''} ${it.url ?? ''}`.trim(); }

// ---------- Conectores ----------
export function criarConector(de: string, para: string, extra: Partial<Conector> = {}): string | undefined {
  if (de === para) return undefined; const id = gerarId();
  const cfg = estado.lousa.config;
  // evita duplicar a mesma ligação
  const existente = Object.values(estado.lousa.doc.conectores).find((c) => (c.de === de && c.para === para) || (c.de === para && c.para === de));
  if (existente) { setUI({ conectorSelecionado: existente.id, selecao: [], conectorPendente: null }); avisar('Esses itens já estão conectados', undefined, 'info', 2500); return existente.id; }
  setDoc((d) => ({ ...d, conectores: { ...d.conectores, [id]: { id, de, para, estilo: cfg.estiloConector ?? 'curvo', tracejado: false, rotulo: '', setaInicio: false, setaFim: cfg.setaConector !== false, cor: cfg.corConector ?? '#475569', espessura: 2, camada: 'principal', ...extra } } }));
  setUI({ conectorSelecionado: id, selecao: [], conectorPendente: null }); anunciar('Conector criado'); marcarConectorRecem(id);
  return id;
}
let timerConRecem: number | null = null;
export function marcarConectorRecem(id: string) {
  if (typeof window === 'undefined' || !estado.lousa.config.animacoes) return;
  setUI({ conectorRecem: id }); if (timerConRecem) window.clearTimeout(timerConRecem);
  timerConRecem = window.setTimeout(() => setUI((u) => (u.conectorRecem === id ? { conectorRecem: null } : {})), 700);
}
/** Troca uma das pontas do conector para outro item (arrastar a bolinha da ponta). */
export function reconectar(id: string, extremo: 'de' | 'para', novoItem: string) {
  const c = estado.lousa.doc.conectores[id]; if (!c || !estado.lousa.doc.itens[novoItem]) return;
  const outro = extremo === 'de' ? c.para : c.de; if (outro === novoItem) { avisar('Um conector precisa ligar dois itens diferentes.'); return; }
  const dup = Object.values(estado.lousa.doc.conectores).find((x) => x.id !== id && ((x.de === novoItem && x.para === outro) || (x.para === novoItem && x.de === outro)));
  if (dup) { avisar('Esses itens já estão conectados.'); return; }
  atualizarConector(id, extremo === 'de' ? { de: novoItem } : { para: novoItem }); marcarConectorRecem(id); avisar('Conector religado', undefined, 'ok', 2000);
}
/** Clique-a-clique: define a origem e espera o destino (Esc cancela). */
export function iniciarConexaoPendente(de: string) {
  if (!estado.lousa.doc.itens[de]) return;
  setUI({ conectorPendente: de, selecao: [de], conectorSelecionado: null });
  avisar('Agora clique no item de destino · Esc cancela', undefined, 'info', 3500);
}
export function concluirConexaoPendente(para: string) {
  const de = estado.ui.conectorPendente; setUI({ conectorPendente: null, conectorRascunho: null, alvoConector: null });
  if (de && de !== para) criarConector(de, para);
}
export const cancelarConexaoPendente = () => setUI({ conectorPendente: null, conectorRascunho: null, alvoConector: null });
/** Conecta os itens selecionados em sequência (ordem de seleção). */
export function conectarSelecionados(ids: string[]) { if (ids.length < 2) { avisar('Selecione dois ou mais itens para conectar.'); return; } for (let i = 0; i < ids.length - 1; i++) criarConector(ids[i], ids[i + 1]); avisar(`${ids.length - 1} conector(es) criado(s)`, undefined, 'ok'); }
export function inverterConector(id: string) { const c = estado.lousa.doc.conectores[id]; if (c) atualizarConector(id, { de: c.para, para: c.de }); }
export const atualizarConector = (id: string, patch: Partial<Conector>) => setDoc((d) => (d.conectores[id] ? { ...d, conectores: { ...d.conectores, [id]: { ...d.conectores[id], ...patch } } } : d));
export function excluirConector(id: string) { setDoc((d) => { const c = { ...d.conectores }; delete c[id]; return { ...d, conectores: c }; }); setUI({ conectorSelecionado: null }); avisar('Conector excluído', { rotulo: 'Desfazer', fn: desfazer }); }

// ---------- Camadas ----------
export const criarCamada = (nome: string) => { const id = gerarId(); setDoc((d) => ({ ...d, camadas: [...d.camadas, { id, nome, visivel: true, travada: false, opacidade: 1 }] })); return id; };
export const atualizarCamada = (id: string, patch: Partial<Camada>) => setDoc((d) => ({ ...d, camadas: d.camadas.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
export function excluirCamada(id: string) { if (id === 'principal') { avisar('A camada principal não pode ser excluída.'); return; } setDoc((d) => ({ ...d, camadas: d.camadas.filter((c) => c.id !== id), itens: Object.fromEntries(Object.entries(d.itens).map(([k, it]) => [k, it.camada === id ? { ...it, camada: 'principal' } : it])) })); }
export const moverParaCamada = (ids: string[], camada: string) => atualizarItens(ids, () => ({ camada }));
export function reordenarCamada(id: string, dir: -1 | 1) { setDoc((d) => { const i = d.camadas.findIndex((c) => c.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= d.camadas.length) return d; const c = [...d.camadas]; [c[i], c[j]] = [c[j], c[i]]; return { ...d, camadas: c }; }); }

// ---------- Seleção ----------
export function selecionar(ids: string[], modo: 'substituir' | 'alternar' | 'adicionar' = 'substituir') {
  setUI((u) => { let sel: string[]; if (modo === 'substituir') sel = ids; else if (modo === 'adicionar') sel = [...new Set([...u.selecao, ...ids])]; else { sel = [...u.selecao]; for (const id of ids) { const i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else sel.push(id); } } return { selecao: expandirGrupos(sel), conectorSelecionado: null, regiaoSelecionada: modo === 'substituir' && ids.length ? null : u.regiaoSelecionada }; });
}
export const limparSelecao = () => setUI({ selecao: [], conectorSelecionado: null, regiaoSelecionada: null, editando: null, menuContexto: null });
export function selecionarPor(crit: { cor?: string; etiqueta?: string; regiao?: string; status?: StatusEstudo; tipo?: TipoItem; camada?: string }) {
  const ids = Object.values(estado.lousa.doc.itens).filter((it) => !it.oculto && (!crit.cor || it.cor === crit.cor) && (!crit.etiqueta || it.etiquetas.includes(crit.etiqueta)) && (!crit.regiao || it.regiao === crit.regiao) && (!crit.status || it.status === crit.status) && (!crit.tipo || it.tipo === crit.tipo) && (!crit.camada || it.camada === crit.camada)).map((i) => i.id);
  selecionar(ids); avisar(`${ids.length} itens selecionados`);
}

// ---------- Regiões: criação e edição ----------
const estiloPadraoRegiao = (cor?: string): EstiloRegiao => ({ cor: cor ?? CORES_REGIAO[Math.floor(Math.random() * CORES_REGIAO.length)], opacidade: 0.16, corBorda: '#64748b', espessuraBorda: 1.5, estiloBorda: 'solida', raio: 10, icone: '', padrao: 'nenhum', rotuloAngulo: 0, numerar: false, mostrarTitulo: true });
export function criarRegiaoRaiz(bbox: Retangulo, nome = 'Nova região', pontos: Ponto[] | null = null, selecionarDepois = true): string {
  const id = gerarId(); const l = estado.lousa;
  const r: Regiao = { id, nome, pai: null, filhos: [], bbox, pontos, layout: null, metodo: 'manual', estilo: estiloPadraoRegiao(), recolhida: false, oculta: false, travada: false, ima: false, itensAcompanham: l.config.itensAcompanhamRegiao, criadoEm: Date.now(), ordem: Object.keys(l.doc.regioes).length };
  setDoc((d) => ({ ...d, regioes: { ...d.regioes, [id]: r } }));
  reatribuirRegioes(Object.keys(estado.lousa.doc.itens));
  if (selecionarDepois) setUI({ regiaoSelecionada: id, selecao: [] });
  return id;
}
/** Aplica uma especificação de divisão a uma região (recursivo). Recorta filhos ao polígono da mãe. */
export function aplicarDivisao(regiaoId: string, spec: EspecDivisao, substituirFilhos = true) {
  setDoc((d) => {
    const regioes = { ...d.regioes }; const pai = regioes[regiaoId]; if (!pai) return d;
    if (substituirFilhos) for (const f of pai.filhos) for (const desc of descendentes(f, regioes)) delete regioes[desc];
    const novoPai = { ...pai, filhos: [] as string[], layout: spec.layout ?? null, metodo: spec.metodo };
    regioes[regiaoId] = novoPai;
    const polyPai = pai.pontos; let cont = 0;
    const criar = (paiId: string, bboxPai: Retangulo, s: EspecDivisao, nivel: number) => {
      const p = regioes[paiId]; const caixas = s.layout ? bboxesDoLayout(bboxPai, s.layout) : null;
      const filhosIds: string[] = [];
      s.filhos.forEach((f, i) => {
        let pontos: Ponto[] | null = f.pontos ?? null; let bbox = caixas ? caixas[i] : f.pontos ? bboxDePontos(f.pontos) : bboxPai;
        // recorta ao polígono da região-mãe original (quando ela não é retangular)
        if (polyPai && nivel >= 0) {
          const polyFilho = pontos ?? poligonoDoRetangulo(bbox);
          const clip = ehConvexo(polyFilho) ? cliparPoligono(polyPai, polyFilho) : ehConvexo(polyPai) ? cliparPoligono(polyFilho, polyPai) : polyFilho;
          if (clip.length >= 3) { pontos = clip; bbox = bboxDePontos(clip); } else if (clip.length === 0) return;
        }
        if (bbox.w < 1 || bbox.h < 1) return;
        const id = gerarId(); const cor = f.cor ?? CORES_REGIAO[(cont++) % CORES_REGIAO.length];
        regioes[id] = { id, nome: f.nome, pai: paiId, filhos: [], bbox, pontos, layout: f.sub?.layout ?? null, metodo: f.sub?.metodo ?? 'folha', estilo: { ...estiloPadraoRegiao(cor), opacidade: p.estilo.opacidade || 0.16 }, recolhida: false, oculta: false, travada: false, ima: false, itensAcompanham: p.itensAcompanham, criadoEm: Date.now(), ordem: Object.keys(regioes).length };
        filhosIds.push(id);
        if (f.sub) criar(id, bbox, f.sub, nivel + 1);
      });
      regioes[paiId] = { ...regioes[paiId], filhos: filhosIds };
    };
    criar(regiaoId, pai.bbox, spec, 0);
    return { ...d, regioes };
  });
  reatribuirRegioes(Object.keys(estado.lousa.doc.itens));
  anunciar('Região dividida');
}
export function atualizarRegiao(id: string, patch: Partial<Regiao>, historico = true) { setDoc((d) => (d.regioes[id] ? { ...d, regioes: { ...d.regioes, [id]: { ...d.regioes[id], ...patch } } } : d), historico); }
export function removerRegiao(id: string, manterConteudo = true) {
  const r = estado.lousa.doc.regioes[id]; if (!r) return; if (r.travada) { avisar('Região travada.'); return; }
  const remover = descendentes(id, estado.lousa.doc.regioes);
  setDoc((d) => {
    const regioes = { ...d.regioes }; for (const x of remover) delete regioes[x];
    if (r.pai && regioes[r.pai]) { const p = regioes[r.pai]; const idx = p.filhos.indexOf(id); const filhos = p.filhos.filter((f) => f !== id); let layout = p.layout; if (layout && idx >= 0 && filhos.length) { const props = layout.proporcoes.filter((_, i) => i !== idx); const s = props.reduce((a, b) => a + b, 0); layout = { ...layout, proporcoes: props.map((x) => x / s) }; } else if (!filhos.length) layout = null; regioes[r.pai] = { ...p, filhos, layout }; }
    const itens = { ...d.itens };
    for (const it of Object.values(itens)) if (it.regiao && remover.includes(it.regiao)) itens[it.id] = manterConteudo ? { ...it, regiao: r.pai } : it;
    if (!manterConteudo) for (const it of Object.values(d.itens)) if (it.regiao && remover.includes(it.regiao)) delete itens[it.id];
    return { ...d, regioes, itens };
  });
  if (r.pai) recomputarLayout(r.pai);
  setUI((u) => ({ regiaoSelecionada: u.regiaoSelecionada && remover.includes(u.regiaoSelecionada) ? r.pai : u.regiaoSelecionada }));
  avisar('Região removida', { rotulo: 'Desfazer', fn: desfazer });
}
/** Recalcula as caixas dos filhos de um layout de proporções, descendo a árvore. */
export function recomputarLayout(id: string, historico = false) {
  setDoc((d) => { const regioes = { ...d.regioes }; const itens = { ...d.itens }; let mudouItens = false;
    const desce = (rid: string) => { const r = regioes[rid]; if (!r?.layout || !r.filhos.length) return; const caixas = bboxesDoLayout(r.bbox, { direcao: r.layout.direcao, proporcoes: r.filhos.map((_, i) => r.layout!.proporcoes[i] ?? 1 / r.filhos.length) }); r.filhos.forEach((fid, i) => { const f = regioes[fid]; if (!f) return; const nb = caixas[i]; const res = reescalarRegiao(f, nb, regioes, itens); if (res) mudouItens = true; desce(fid); }); };
    desce(id); return { ...d, regioes, itens: mudouItens ? itens : d.itens }; }, historico);
}
/** Move/escala uma região (e descendentes + itens) de bbox antiga para nova. */
function reescalarRegiao(r: Regiao, nova: Retangulo, regioes: Record<string, Regiao>, itens: Record<string, Item>): boolean {
  const antiga = r.bbox; if (antiga.x === nova.x && antiga.y === nova.y && antiga.w === nova.w && antiga.h === nova.h) return false;
  const sx = nova.w / (antiga.w || 1), sy = nova.h / (antiga.h || 1);
  const mapa = (p: Ponto): Ponto => ({ x: nova.x + (p.x - antiga.x) * sx, y: nova.y + (p.y - antiga.y) * sy });
  let mudouItens = false;
  for (const did of descendentes(r.id, regioes)) {
    const dr = regioes[did]; const nb: Retangulo = { x: nova.x + (dr.bbox.x - antiga.x) * sx, y: nova.y + (dr.bbox.y - antiga.y) * sy, w: dr.bbox.w * sx, h: dr.bbox.h * sy };
    regioes[did] = { ...dr, bbox: nb, pontos: dr.pontos ? dr.pontos.map(mapa) : null };
    if (dr.itensAcompanham) for (const it of Object.values(itens)) if (it.regiao === did && !it.travado) { const c = mapa(centroItem(it)); itens[it.id] = { ...it, x: c.x - it.w / 2, y: c.y - it.h / 2 }; mudouItens = true; }
  }
  return mudouItens;
}
export function moverRegiao(id: string, dx: number, dy: number, historico = false) {
  setDoc((d) => { const r = d.regioes[id]; if (!r || r.travada) return d; const regioes = { ...d.regioes }; const itens = { ...d.itens }; const mudou = reescalarRegiao(r, { ...r.bbox, x: r.bbox.x + dx, y: r.bbox.y + dy }, regioes, itens); return { ...d, regioes, itens: mudou ? itens : d.itens }; }, historico);
}
export function redimensionarRegiao(id: string, nova: Retangulo, historico = false) {
  setDoc((d) => { const r = d.regioes[id]; if (!r || r.travada) return d; const regioes = { ...d.regioes }; const itens = { ...d.itens }; const nb = { ...nova, w: Math.max(80, nova.w), h: Math.max(60, nova.h) }; const mudou = reescalarRegiao(r, nb, regioes, itens); return { ...d, regioes, itens: mudou ? itens : d.itens }; }, historico);
  const r = estado.lousa.doc.regioes[id]; if (r?.pai) { /* filhos de layouts já reescalados */ }
}
/** Arrasta a divisória entre filhos i e i+1 de uma região com layout, para a posição `pos` (coordenada do mundo). */
export function arrastarDivisoria(regiaoId: string, i: number, pos: number) {
  const r = estado.lousa.doc.regioes[regiaoId]; if (!r?.layout) return;
  const props = [...r.layout.proporcoes]; const total = r.layout.direcao === 'h' ? r.bbox.w : r.bbox.h; const inicio = r.layout.direcao === 'h' ? r.bbox.x : r.bbox.y;
  const antes = props.slice(0, i).reduce((a, b) => a + b, 0); const par = props[i] + props[i + 1];
  const minimo = Math.max(0.04, 40 / total);
  const nova = clamp((pos - inicio) / total - antes, minimo, par - minimo);
  props[i] = nova; props[i + 1] = par - nova;
  atualizarRegiao(regiaoId, { layout: { ...r.layout, proporcoes: props } }, false);
  recomputarLayout(regiaoId);
}
export function mesclarRegioes(a: string, b: string) {
  const d = estado.lousa.doc; const ra = d.regioes[a], rb = d.regioes[b]; if (!ra || !rb || a === b) return;
  const irmaos = ra.pai && ra.pai === rb.pai && d.regioes[ra.pai]?.layout;
  setDoc((doc) => {
    const regioes = { ...doc.regioes }; const itens = { ...doc.itens };
    for (const it of Object.values(itens)) if (it.regiao && descendentes(b, regioes).includes(it.regiao)) itens[it.id] = { ...it, regiao: a };
    for (const x of descendentes(b, regioes)) delete regioes[x];
    for (const x of descendentes(a, regioes).filter((x) => x !== a)) delete regioes[x];
    const uniao = uniaoRetangulos([ra.bbox, rb.bbox]);
    let pontos: Ponto[] | null = null;
    if (ra.pontos || rb.pontos) pontos = cascoConvexo([...(ra.pontos ?? poligonoDoRetangulo(ra.bbox)), ...(rb.pontos ?? poligonoDoRetangulo(rb.bbox))]);
    regioes[a] = { ...ra, filhos: [], layout: null, bbox: uniao, pontos, nome: `${ra.nome} + ${rb.nome}` };
    if (ra.pai && regioes[ra.pai]) { const p = regioes[ra.pai]; const ia = p.filhos.indexOf(a), ib = p.filhos.indexOf(b); const filhos = p.filhos.filter((f) => f !== b); let layout = p.layout; if (irmaos && layout && ia >= 0 && ib >= 0) { const props = [...layout.proporcoes]; props[ia] = props[ia] + props[ib]; props.splice(ib, 1); layout = { ...layout, proporcoes: props }; } else if (layout) layout = null; regioes[ra.pai] = { ...p, filhos, layout }; }
    return { ...doc, regioes, itens };
  });
  if (irmaos && ra.pai) recomputarLayout(ra.pai);
  setUI({ regiaoSelecionada: a }); avisar('Regiões mescladas', { rotulo: 'Desfazer', fn: desfazer });
}
function cascoConvexo(pts: Ponto[]): Ponto[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y); if (p.length < 3) return p;
  const cross = (o: Ponto, a: Ponto, b: Ponto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const inf: Ponto[] = []; for (const q of p) { while (inf.length >= 2 && cross(inf[inf.length - 2], inf[inf.length - 1], q) <= 0) inf.pop(); inf.push(q); }
  const sup: Ponto[] = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (sup.length >= 2 && cross(sup[sup.length - 2], sup[sup.length - 1], q) <= 0) sup.pop(); sup.push(q); }
  return [...inf.slice(0, -1), ...sup.slice(0, -1)];
}
export function trocarRegioes(a: string, b: string) {
  const d = estado.lousa.doc; const ra = d.regioes[a], rb = d.regioes[b]; if (!ra || !rb) return;
  setDoc((doc) => {
    const regioes = { ...doc.regioes }; const itens = { ...doc.itens };
    regioes[a] = { ...ra, nome: rb.nome, estilo: rb.estilo }; regioes[b] = { ...rb, nome: ra.nome, estilo: ra.estilo };
    const ca = { x: ra.bbox.x + ra.bbox.w / 2, y: ra.bbox.y + ra.bbox.h / 2 }, cb = { x: rb.bbox.x + rb.bbox.w / 2, y: rb.bbox.y + rb.bbox.h / 2 };
    for (const it of Object.values(itens)) { if (it.regiao === a) itens[it.id] = { ...it, regiao: b, x: it.x + (cb.x - ca.x), y: it.y + (cb.y - ca.y) }; else if (it.regiao === b) itens[it.id] = { ...it, regiao: a, x: it.x + (ca.x - cb.x), y: it.y + (ca.y - cb.y) }; }
    return { ...doc, regioes, itens };
  });
  avisar('Regiões trocadas de lugar');
}
export function duplicarRegiao(id: string) {
  const d = estado.lousa.doc; const r = d.regioes[id]; if (!r) return;
  const dx = r.bbox.w + 40; const ids = descendentes(id, d.regioes); const mapa: Record<string, string> = {}; for (const x of ids) mapa[x] = gerarId();
  setDoc((doc) => {
    const regioes = { ...doc.regioes }; const itens = { ...doc.itens }; let z = proximoZ(itens);
    for (const x of ids) { const o = doc.regioes[x]; regioes[mapa[x]] = { ...o, id: mapa[x], nome: x === id ? `${o.nome} (cópia)` : o.nome, pai: x === id ? null : mapa[o.pai!], filhos: o.filhos.map((f) => mapa[f]), bbox: { ...o.bbox, x: o.bbox.x + dx }, pontos: o.pontos ? o.pontos.map((p) => ({ x: p.x + dx, y: p.y })) : null, criadoEm: Date.now() }; }
    for (const it of Object.values(doc.itens)) if (it.regiao && mapa[it.regiao]) { const nid = gerarId(); itens[nid] = { ...it, id: nid, x: it.x + dx, regiao: mapa[it.regiao], z: z++, criadoEm: Date.now() }; }
    return { ...doc, regioes, itens };
  });
  setUI({ regiaoSelecionada: mapa[id] }); avisar('Região duplicada com o conteúdo');
}
export function dividirAoMeio(id: string) { const r = estado.lousa.doc.regioes[id]; if (!r) return; aplicarDivisao(id, r.bbox.w >= r.bbox.h ? colunas([1, 1]) : linhas([1, 1])); }
export function criarRegiaoCobrindoTela(nome = 'Lousa'): string {
  const { camera } = estado.lousa; const vp = estado.ui.viewport; const m = 40 / camera.zoom;
  const bbox = { x: (0 - camera.x) / camera.zoom + m, y: (56 - camera.y) / camera.zoom + m, w: vp.w / camera.zoom - 2 * m, h: (vp.h - 56) / camera.zoom - 2 * m };
  return criarRegiaoRaiz(bbox, nome);
}
/** Divide por regra: colunas por etiqueta, status ou data de revisão; e reorganiza os itens. */
export function dividirPorRegra(regiaoId: string | null, regra: 'etiqueta' | 'status' | 'data') {
  const d = estado.lousa.doc; const ids = regiaoId ? Object.values(d.itens).filter((i) => i.regiao && descendentes(regiaoId, d.regioes).includes(i.regiao)).map((i) => i.id) : Object.keys(d.itens);
  if (!ids.length) { avisar('Não há itens para organizar.'); return; }
  const chave = (it: Item): string => regra === 'etiqueta' ? (it.etiquetas[0] ?? 'Sem etiqueta') : regra === 'status' ? ({ 'nao-visto': 'Não visto', estudando: 'Estudando', revisar: 'Revisar', dominado: 'Dominado' } as Record<string, string>)[it.status] : !it.revisao.proxima ? 'Sem data' : it.revisao.proxima <= fimDoDia() ? 'Hoje' : it.revisao.proxima <= fimDoDia() + 7 * DIA_MS ? 'Esta semana' : 'Depois';
  const grupos = new Map<string, string[]>(); for (const id of ids) { const k = chave(d.itens[id]); grupos.set(k, [...(grupos.get(k) ?? []), id]); }
  const nomes = [...grupos.keys()];
  let alvo = regiaoId; if (!alvo) { const caixas = ids.map((id) => bboxItemGirado(d.itens[id])); const u = uniaoRetangulos(caixas); alvo = criarRegiaoRaiz({ x: u.x - 40, y: u.y - 60, w: Math.max(u.w + 80, nomes.length * 260), h: Math.max(u.h + 100, 400) }, `Por ${regra}`); }
  aplicarDivisao(alvo, colunas(nomes.map(() => 1), nomes));
  const r = estado.lousa.doc.regioes[alvo]; r.filhos.forEach((fid, i) => { const f = estado.lousa.doc.regioes[fid]; const grupo = grupos.get(nomes[i]) ?? []; empilhar(grupo, 'grade', { x: f.bbox.x + 16, y: f.bbox.y + 48 }); atualizarItens(grupo, () => ({ regiao: fid }), false); });
}
export function salvarModeloDivisao(nome: string, spec: EspecDivisao) { setLousa((l) => ({ modelosDivisao: [...l.modelosDivisao, { id: gerarId(), nome, spec }] })); avisar('Modelo de divisão salvo'); }
export function especDaRegiao(id: string, regioes = estado.lousa.doc.regioes): EspecDivisao | null {
  const r = regioes[id]; if (!r || !r.filhos.length) return null; const ref = r.bbox;
  const norm = (p: Ponto) => ({ x: (p.x - ref.x) / ref.w, y: (p.y - ref.y) / ref.h });
  return { metodo: r.metodo, layout: r.layout ?? undefined, filhos: r.filhos.map((fid) => { const f = regioes[fid]; const sub = especDaRegiao(fid, regioes); return { nome: f.nome, cor: f.estilo.cor, pontos: r.layout ? undefined : (f.pontos ?? poligonoDoRetangulo(f.bbox)).map(norm), sub: sub ?? undefined }; }) };
}
export function especNormalizadaParaMundo(spec: EspecDivisao, r: Retangulo): EspecDivisao {
  const den = (p: Ponto) => ({ x: r.x + p.x * r.w, y: r.y + p.y * r.h });
  return { ...spec, filhos: spec.filhos.map((f) => ({ ...f, pontos: f.pontos ? f.pontos.map(den) : f.pontos, sub: f.sub ? especNormalizadaParaMundo(f.sub, f.pontos ? bboxDePontos(f.pontos.map(den)) : r) : undefined })) };
}

// ---------- Visualização ----------
export const setVisualizacao = (patch: Partial<Visualizacao>) => setLousa((l) => ({ visualizacao: { ...l.visualizacao, ...patch } }));
export function alternarOcultarTudo() { const v = !estado.lousa.visualizacao.ocultarTudo; setVisualizacao({ ocultarTudo: v }); anunciar(v ? 'Itens ocultos. Pressione H para mostrar.' : 'Itens visíveis'); }
export function salvarVisao(nome: string) { setLousa((l) => ({ visoesSalvas: [...l.visoesSalvas, { id: gerarId(), nome, visualizacao: l.visualizacao, camera: l.camera }] })); avisar(`Visão "${nome}" salva`); }
export function aplicarVisao(id: string) { const v = estado.lousa.visoesSalvas.find((x) => x.id === id); if (v) { setLousa(() => ({ visualizacao: v.visualizacao, camera: v.camera })); avisar(`Visão "${v.nome}" aplicada`); } }
export const excluirVisao = (id: string) => setLousa((l) => ({ visoesSalvas: l.visoesSalvas.filter((v) => v.id !== id) }));

// ---------- Estudo ----------
export function ativarRevisao(id: string, ativa = true) {
  const l = estado.lousa; const dias = l.estudo.intervalos[0] ?? 1;
  atualizarItem(id, { revisao: { ativa, indice: 0, proxima: ativa ? agora() + dias * DIA_MS : null, historico: estado.lousa.doc.itens[id]?.revisao.historico ?? [] }, status: ativa ? 'revisar' : estado.lousa.doc.itens[id]?.status });
}
export function registrarRevisao(id: string, acertou: boolean) {
  const l = estado.lousa; const it = l.doc.itens[id]; if (!it) return; const ints = l.estudo.intervalos.length ? l.estudo.intervalos : [1, 7, 30];
  const indice = acertou ? it.revisao.indice + 1 : 0;
  const dias = indice < ints.length ? ints[indice] : ints[ints.length - 1] * 2 ** (indice - ints.length + 1);
  const dominado = acertou && indice >= ints.length;
  atualizarItem(id, { revisao: { ativa: true, indice, proxima: agora() + dias * DIA_MS, historico: [...it.revisao.historico, { data: agora(), acertou }].slice(-200) }, status: dominado ? 'dominado' : acertou ? 'revisar' : 'estudando' });
  const dia = chaveDia(); const rh = l.estudo.revisadosHoje.dia === dia ? l.estudo.revisadosHoje.quantidade + 1 : 1;
  let seq = l.estudo.sequenciaDias; let ultimo = l.estudo.ultimoDiaMeta;
  if (rh >= l.estudo.metaDiaria && ultimo !== dia) { const ontem = chaveDia(agora() - DIA_MS); seq = ultimo === ontem ? seq + 1 : 1; ultimo = dia; }
  setLousa((x) => ({ estudo: { ...x.estudo, revisadosHoje: { dia, quantidade: rh }, sequenciaDias: seq, ultimoDiaMeta: ultimo } }));
  setUI((u) => ({ placarProva: { acertos: u.placarProva.acertos + (acertou ? 1 : 0), erros: u.placarProva.erros + (acertou ? 0 : 1) } }));
}
export function itensParaRevisar(l = estado.lousa): Item[] { const fim = fimDoDia(); return Object.values(l.doc.itens).filter((i) => i.revisao.ativa && i.revisao.proxima !== null && i.revisao.proxima <= fim).sort((a, b) => (a.revisao.proxima ?? 0) - (b.revisao.proxima ?? 0)); }
export function filaDeRevisao(): Item[] {
  const l = estado.lousa; const lista = itensParaRevisar(l);
  if (!l.estudo.intercalar) return lista;
  // intercalação: alterna disciplinas (primeira etiqueta)
  const grupos = new Map<string, Item[]>(); for (const it of lista) { const k = it.etiquetas[0] ?? ''; grupos.set(k, [...(grupos.get(k) ?? []), it]); }
  const out: Item[] = []; const filas = [...grupos.values()]; let resta = true;
  while (resta) { resta = false; for (const f of filas) { const x = f.shift(); if (x) { out.push(x); resta = true; } } }
  return out;
}
export const tenteLembrar = (id: string, segundos = 8) => { setUI((u) => ({ tenteLembrar: { ...u.tenteLembrar, [id]: Date.now() + segundos * 1000 } })); window.setTimeout(() => setUI((u) => { const t = { ...u.tenteLembrar }; delete t[id]; return { tenteLembrar: t }; }), segundos * 1000); };

// Edital
export function importarEdital(texto: string) {
  const linhasTxt = texto.split(/\n+/).map((l) => l.trim()).filter(Boolean); const novos: Lousa['edital'] = [];
  let disciplinaAtual = 'Geral';
  for (const l of linhasTxt) {
    if (/:\s*$/.test(l) || (!/[,;]/.test(l) && l === l.toUpperCase() && l.length < 60)) { disciplinaAtual = l.replace(/:\s*$/, ''); continue; }
    const [a, b] = l.split(':');
    if (b !== undefined) { disciplinaAtual = a.trim(); for (const t of b.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) novos.push({ id: gerarId(), disciplina: disciplinaAtual, topico: t.slice(0, 200), status: 'nao-visto', dominio: 0 }); }
    else for (const t of l.split(/[,;]+/).map((s) => s.replace(/^\s*(?:\d+(?:\.\d+)*[.)]?|[-•*])\s*/, '').trim()).filter(Boolean)) novos.push({ id: gerarId(), disciplina: disciplinaAtual, topico: t.slice(0, 200), status: 'nao-visto', dominio: 0 });
  }
  setLousa((l) => ({ edital: [...l.edital, ...novos].slice(0, 2000) })); avisar(`${novos.length} tópicos adicionados ao edital`);
}
export const atualizarTopicoEdital = (id: string, patch: Partial<Lousa['edital'][number]>) => setLousa((l) => ({ edital: l.edital.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
export const removerTopicoEdital = (id: string) => setLousa((l) => ({ edital: l.edital.filter((t) => t.id !== id) }));
export const registrarQuestoes = (q: { disciplina: string; assunto: string; acertos: number; total: number }) => setLousa((l) => ({ questoes: [{ id: gerarId(), data: agora(), ...q }, ...l.questoes].slice(0, 5000) }));

// ---------- Colar / inserir informação (sempre pelo filtro central) ----------
export function criarItensEmLote(textos: string[], origem: Ponto, tipo: TipoItem = 'postit', regiaoId?: string | null): string[] {
  const ids: string[] = []; const cols = Math.ceil(Math.sqrt(textos.length)); const w = 200, h = 200, gap = 16;
  const novos: Item[] = textos.slice(0, 500).map((t, i) => novoItem({ tipo, x: origem.x + (i % cols) * (w + gap), y: origem.y + Math.floor(i / cols) * (h + gap), w, h, html: textoParaHtml(t.slice(0, 5000)), regiao: regiaoId ?? undefined }));
  setDoc((d) => { const itens = { ...d.itens }; let z = proximoZ(itens); for (const n of novos) { n.z = z++; itens[n.id] = n; ids.push(n.id); } return { ...d, itens }; });
  reatribuirRegioes(ids); setUI({ selecao: ids }); avisar(`${ids.length} itens criados`);
  return ids;
}
export function colarHtmlComoItem(html: string, pos: Ponto, tipo: TipoItem = 'postit') {
  const limpo = sanitizarHtml(html); return criarItem({ tipo, x: pos.x, y: pos.y, html: limpo, w: tipo === 'postit' ? 220 : 320, h: tipo === 'postit' ? 220 : 160 });
}
export function colarTextoComoItem(texto: string, pos: Ponto, tipo: TipoItem = 'postit') {
  return criarItem({ tipo, x: pos.x, y: pos.y, html: textoParaHtml(texto.slice(0, 20000)), w: tipo === 'postit' ? 220 : 320, h: tipo === 'postit' ? 220 : 160, autoAjuste: texto.length > 300 });
}
export function colarComoLink(url: string, pos: Ponto) { let titulo = url; try { titulo = new URL(url).hostname.replace(/^www\./, ''); } catch { /* */ } return criarItem({ tipo: 'link', x: pos.x, y: pos.y, url, titulo, html: '' }); }

// ---------- Visibilidade (culling + camadas + modos) ----------
export interface ContextoVisibilidade { camadas: Map<string, Camada>; regioesOcultas: Set<string>; vis: Visualizacao; janela: Retangulo; isolada: string[] | null; filtroAtivo: boolean }
export function contextoVisibilidade(l: Lousa, ui: UI): ContextoVisibilidade {
  const { camera } = l; const vp = ui.viewport; const m = 200 / camera.zoom;
  const janela = { x: -camera.x / camera.zoom - m, y: -camera.y / camera.zoom - m, w: vp.w / camera.zoom + 2 * m, h: vp.h / camera.zoom + 2 * m };
  const f = l.visualizacao.filtro;
  return { camadas: new Map(l.doc.camadas.map((c) => [c.id, c])), regioesOcultas: regioesOcultasSet(l.doc.regioes), vis: l.visualizacao, janela, isolada: ui.regiaoIsolada ? descendentes(ui.regiaoIsolada, l.doc.regioes) : null, filtroAtivo: !!(f.cor || f.etiqueta || f.regiao || f.status || f.texto) };
}
const ehAnotacao = (it: Item) => it.camada === 'anotacoes' || it.tipo === 'desenho';
export function passaFiltro(it: Item, f: Visualizacao['filtro']): boolean {
  if (f.cor && it.cor !== f.cor) return false; if (f.etiqueta && !it.etiquetas.includes(f.etiqueta)) return false; if (f.regiao && it.regiao !== f.regiao) return false; if (f.status && it.status !== f.status) return false;
  if (f.texto && !textoDoItem(it).toLowerCase().includes(f.texto.toLowerCase())) return false; return true;
}
/** Retorna 'oculto', 'esmaecido' ou 'visivel' (sem considerar culling). */
export function estadoVisual(it: Item, ctx: ContextoVisibilidade): 'oculto' | 'esmaecido' | 'visivel' {
  const { vis } = ctx;
  if (vis.ocultarTudo || it.oculto) return 'oculto';
  const cam = ctx.camadas.get(it.camada); if (cam && !cam.visivel) return 'oculto';
  if (it.regiao && ctx.regioesOcultas.has(it.regiao)) return 'oculto';
  if (vis.modo === 'so-lousa') return 'oculto';
  if (vis.modo === 'lousa-anotacoes' && !ehAnotacao(it)) return 'oculto';
  if (vis.modo === 'lousa-postits' && ehAnotacao(it)) return 'oculto';
  if (vis.tiposOcultos.includes(it.tipo)) return vis.esmaecerOcultos ? 'esmaecido' : 'oculto';
  if (vis.destacarTipo && it.tipo !== vis.destacarTipo) return 'esmaecido';
  if (ctx.isolada && (!it.regiao || !ctx.isolada.includes(it.regiao))) return 'esmaecido';
  if (ctx.filtroAtivo && !passaFiltro(it, vis.filtro)) return vis.filtro.esmaecer ? 'esmaecido' : 'oculto';
  return 'visivel';
}
export const dentroDaJanela = (it: Item, janela: Retangulo) => { const b = it.angulo ? bboxDePontos(cantosItem(it)) : it; return b.x < janela.x + janela.w && b.x + b.w > janela.x && b.y < janela.y + janela.h && b.y + b.h > janela.y; };

// ---------- Pomodoro ----------
export function iniciarPomodoro(fase: 'foco' | 'pausa') { const l = estado.lousa.estudo; const min = fase === 'foco' ? l.pomodoroFoco : l.pomodoroPausa; setUI((u) => ({ pomodoro: { fase, fim: Date.now() + min * 60_000, ciclos: u.pomodoro.ciclos + (fase === 'pausa' ? 1 : 0) } })); }
export const pararPomodoro = () => setUI((u) => ({ pomodoro: { ...u.pomodoro, fase: 'parado', fim: null } }));

// ---------- Rotação de grupo em torno de um centro ----------
export function girarGrupo(ids: string[], centro: Ponto, delta: number, antes: Record<string, Item>) {
  atualizarItens(ids, (it) => { const o = antes[it.id] ?? it; const c = rotacionarPonto(centroItem(o), centro, delta); return { x: c.x - o.w / 2, y: c.y - o.h / 2, angulo: o.angulo + delta }; }, false);
}
export const centroRegiao = (r: Regiao) => (r.pontos ? centroidePoligono(r.pontos) : { x: r.bbox.x + r.bbox.w / 2, y: r.bbox.y + r.bbox.h / 2 });
