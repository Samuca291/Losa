// ============================================================
// DADOS · FORMATO SIMPLIFICADO (AUTORIA À MÃO)
// Converte um JSON amigável — sem ids obrigatórios, com nomes de
// cores, regiões/camadas por NOME, posição automática e divisões do
// catálogo — na estrutura interna, que depois passa pelo MESMO
// validador dos backups (validarLousa). Uma única porta de entrada.
// ============================================================
import { PALETA, ROTULOS_STATUS, TAMANHOS_POSTIT, type Regiao, type Retangulo, type TipoItem } from '../types';
import { textoParaHtml } from '../utils/seguranca';
import { bboxesDoLayout, CATALOGO, colunas, grade, linhas, type EspecDivisao } from '../utils/divisoes';
import { criarLousaVazia, expandirDivisao } from '../store';
import { avisarChavesDesconhecidas, sugerirChave, type Relatorio } from './relatorio';
import { STATUS_ESTUDO, TIPOS_ITEM } from './esquemas';
import { ehObj, geradorIds, idSeguro, validarRegiao } from './validacao';

type Obj = Record<string, unknown>;
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export const CHAVES_AUTORIA = ['formato', 'versao', '$schema', 'nome', 'config', 'visualizacao', 'estudo', 'camera', 'camadas', 'regioes', 'itens', 'conectores', 'edital', 'questoes', 'legenda', 'visoesSalvas', 'modelosDivisao', 'imagens', 'arquivada', 'lixeira'] as const;

/** Tamanho e aparência padrão de cada tipo (espelha novoItem do store). */
export const PADROES_TIPO: Record<TipoItem, { w: number; h: number; cor?: string; extra?: Obj }> = {
  postit: { w: 200, h: 200, cor: '#fff176' },
  texto: { w: 240, h: 60, cor: 'transparent' },
  titulo: { w: 420, h: 70, cor: 'transparent', extra: { tamanhoFonte: 32 } },
  caixa: { w: 260, h: 160, cor: '#ffffff' },
  tarefas: { w: 220, h: 180, cor: '#fff176' },
  tabela: { w: 320, h: 160, cor: '#ffffff' },
  imagem: { w: 320, h: 220, cor: 'transparent' },
  link: { w: 260, h: 90, cor: '#ffffff' },
  desenho: { w: 300, h: 200, cor: 'transparent', extra: { camada: 'anotacoes' } },
  forma: { w: 180, h: 120, cor: '#90caf9', extra: { forma: 'retangulo' } },
  cloze: { w: 280, h: 140, cor: '#e6ee9c' },
  contador: { w: 120, h: 90, cor: '#fff176', extra: { valor: 0 } },
  fita: { w: 120, h: 30, cor: 'rgba(255,240,180,0.8)', extra: { angulo: -8 } },
  pino: { w: 28, h: 28, cor: '#ef4444' },
  carimbo: { w: 150, h: 60, cor: '#dc2626', extra: { carimbo: 'importante', angulo: -12 } },
};

/** "amarelo", "Pêssego", "transparente" → cor da paleta. */
export const CORES_NOMEADAS: Record<string, string> = { ...Object.fromEntries(PALETA.map((p) => [semAcento(p.nome), p.cor])), transparente: 'transparent', transparent: 'transparent' };
export const resolverCor = (v: unknown): unknown => (typeof v === 'string' && CORES_NOMEADAS[semAcento(v)] ? CORES_NOMEADAS[semAcento(v)] : v);
const STATUS_POR_ROTULO: Record<string, string> = Object.fromEntries(Object.entries(ROTULOS_STATUS).flatMap(([k, r]) => [[semAcento(r), k], [semAcento(k), k], [semAcento(r).replace(/\s+/g, '-'), k]]));
export const resolverStatus = (v: unknown): unknown => (typeof v === 'string' && !STATUS_ESTUDO.includes(v as never) ? STATUS_POR_ROTULO[semAcento(v)] ?? v : v);

/** Converte o atalho "divisao" de uma região em especificação, usando o catálogo do menu Dividir. */
export function especDeDivisao(div: unknown, bbox: Retangulo, caminho: string, rel?: Relatorio): EspecDivisao | null {
  const d: Obj | null = typeof div === 'string' ? { metodo: div } : ehObj(div) ? div : null;
  if (!d) { rel?.aviso(caminho, 'Use "divisao": "kanban" ou { "metodo": "...", ... }.'); return null; }
  const nomes = Array.isArray(d.nomes) ? d.nomes.map((x) => String(x).slice(0, 120)) : typeof d.nomes === 'string' ? d.nomes.split(',').map((x) => x.trim()) : undefined;
  const props = (v: unknown): number[] | null => (typeof v === 'number' && v >= 1 ? Array(Math.min(24, Math.round(v))).fill(1) : Array.isArray(v) && v.length ? v.slice(0, 24).map((x) => (typeof x === 'number' && x > 0 ? x : 1)) : null);
  let spec: EspecDivisao | null = null;
  if (d.metodo === undefined) {
    const pc = props(d.colunas), pl = props(d.linhas);
    if (pc && pl) spec = grade(pl.length, pc.length, pl, pc);
    else if (pc) spec = colunas(pc, nomes);
    else if (pl) spec = linhas(pl, nomes);
    else { rel?.aviso(caminho, 'Divisão sem "metodo", "colunas" ou "linhas": ignorada.'); return null; }
  } else {
    const m = String(d.metodo); const ent = CATALOGO.find((c) => c.id === m) ?? CATALOGO.find((c) => semAcento(c.nome) === semAcento(m));
    if (!ent) { const s = sugerirChave(m, CATALOGO.map((c) => c.id)); rel?.aviso(`${caminho}.metodo`, `Método de divisão "${m}" não existe${s ? ` (você quis dizer "${s}"?)` : ''}. Veja a lista no guia.`); return null; }
    const params: Record<string, string | number> = {}; const fonte: Obj = ehObj(d.params) ? { ...d, ...d.params } : d;
    for (const p of ent.params ?? []) {
      let v = fonte[p.chave];
      if (Array.isArray(v)) v = v.join(p.chave.startsWith('prop') || p.chave === 'props' ? ',' : ', ');
      if (p.tipo === 'numero') { const num = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; params[p.chave] = Number.isFinite(num) ? Math.min(p.max ?? 1e6, Math.max(p.min ?? -1e6, num)) : p.padrao; if (v !== undefined && !Number.isFinite(num)) rel?.aviso(`${caminho}.${p.chave}`, `Número inválido; usado ${p.padrao}.`); }
      else if (p.tipo === 'opcao') { const ok = p.opcoes?.some((o) => o.valor === String(v)); params[p.chave] = ok ? String(v) : p.padrao; if (v !== undefined && !ok) rel?.aviso(`${caminho}.${p.chave}`, `Opção inválida; aceitas: ${p.opcoes?.map((o) => o.valor).join(', ')}.`); }
      else params[p.chave] = typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 2000) : p.padrao;
    }
    try { spec = ent.gerar(bbox, params); } catch { rel?.aviso(caminho, `Não foi possível gerar a divisão "${m}" com esses parâmetros.`); return null; }
  }
  if (spec && nomes) spec.filhos.forEach((f, i) => { if (nomes[i]) f.nome = nomes[i]; });
  if (spec && Array.isArray(d.cores)) spec.filhos.forEach((f, i) => { const c = resolverCor(d.cores && (d.cores as unknown[])[i]); if (typeof c === 'string') f.cor = c; });
  return spec;
}

export interface ResultadoAutoria { bruto: Obj; imagens: Obj; posicionados: number }

export function normalizarAutoria(entrada: unknown, rel?: Relatorio): ResultadoAutoria {
  const base = criarLousaVazia();
  const r: Obj = Array.isArray(entrada) ? { itens: entrada } : ehObj(entrada) ? entrada : {};
  avisarChavesDesconhecidas(r, CHAVES_AUTORIA, '', rel);
  const usados = new Set<string>();
  for (const lista of [r.itens, r.regioes, r.conectores]) if (Array.isArray(lista)) for (const x of lista) if (ehObj(x) && typeof x.id === 'string') usados.add(x.id);
  const novoId = geradorIds(usados);
  const imagens: Obj = ehObj(r.imagens) ? { ...r.imagens } : {};
  const cfg: Obj = ehObj(r.config) ? { ...r.config } : {};
  for (const k of ['corFundo', 'corConector']) if (cfg[k] !== undefined) cfg[k] = resolverCor(cfg[k]);
  if (Array.isArray(cfg.coresFavoritas)) cfg.coresFavoritas = cfg.coresFavoritas.map(resolverCor);
  const tamPostit = typeof cfg.tamanhoPostit === 'string' && TAMANHOS_POSTIT[cfg.tamanhoPostit] ? TAMANHOS_POSTIT[cfg.tamanhoPostit] : TAMANHOS_POSTIT.medio;

  // ---------- Camadas: as padrão + as do arquivo (por id ou nome) ----------
  const camadas: Obj[] = base.doc.camadas.map((c) => ({ ...c }));
  if (Array.isArray(r.camadas)) r.camadas.forEach((c, i) => {
    const o: Obj | null = typeof c === 'string' ? { nome: c } : ehObj(c) ? { ...c } : null;
    if (!o) { rel?.aviso(`camadas[${i}]`, 'Use um texto ("Leis") ou um objeto { "nome": "Leis" }.'); return; }
    const ex = camadas.find((x) => (typeof o.id === 'string' && x.id === o.id) || (typeof o.nome === 'string' && semAcento(String(x.nome)) === semAcento(o.nome)));
    if (ex) Object.assign(ex, o, { id: ex.id }); else camadas.push(o);
  });
  else if (r.camadas !== undefined) rel?.aviso('camadas', 'Deveria ser uma lista [ ].');

  // ---------- Regiões (com filhos aninhados e atalho "divisao") ----------
  const regioes: Obj[] = []; const caixas = new Map<string, Retangulo>(); const nomesRegiao = new Map<string, string>(); const filhosDe = new Map<string, string[]>();
  let cursorX = 0;
  const caixaDe = (o: Obj, auto: Retangulo | null): Retangulo | null => {
    if (ehObj(o.bbox)) return null;
    const tem = ['x', 'y', 'w', 'h'].some((k) => typeof o[k] === 'number');
    if (!tem) return auto;
    const n = (k: string, p: number) => (typeof o[k] === 'number' ? (o[k] as number) : p);
    const bx = { x: n('x', auto?.x ?? 0), y: n('y', auto?.y ?? 0), w: n('w', auto?.w ?? 900), h: n('h', auto?.h ?? 600) };
    delete o.x; delete o.y; delete o.w; delete o.h; return bx;
  };
  const registrar = (id: string, nome: unknown, pai: string | null, bbox: Retangulo) => {
    caixas.set(id, bbox); if (typeof nome === 'string' && !nomesRegiao.has(semAcento(nome))) nomesRegiao.set(semAcento(nome), id);
    if (pai) filhosDe.set(pai, [...(filhosDe.get(pai) ?? []), id]);
  };
  const processarRegiao = (rg: unknown, caminho: string, pai: string | null, auto: Retangulo | null) => {
    if (!ehObj(rg)) { rel?.aviso(caminho, 'Região ignorada: deveria ser um objeto { }.'); return; }
    const o: Obj = { ...rg };
    if (!idSeguro(o.id)) { if (o.id !== undefined) rel?.correcao(`${caminho}.id`, `Id inválido "${String(o.id)}" trocado; referências por esse id devem usar o NOME da região.`); o.id = novoId(); }
    const id = o.id as string;
    const bx = caixaDe(o, auto);
    if (bx) o.bbox = bx;
    else if (!ehObj(o.bbox)) { o.bbox = { x: cursorX, y: 0, w: 900, h: 600 }; rel?.info(caminho, `Região "${String(o.nome ?? 'sem nome')}" sem posição: colocada automaticamente em x=${cursorX}.`); }
    if (pai && (o.pai === undefined || o.pai === null)) o.pai = pai;
    const bbox = o.bbox as Retangulo;
    if (!pai && typeof bbox.x === 'number' && typeof bbox.w === 'number') cursorX = Math.max(cursorX, bbox.x + bbox.w + 80);
    if (o.cor !== undefined) { o.estilo = { ...(ehObj(o.estilo) ? o.estilo : {}), cor: resolverCor(o.cor) }; delete o.cor; }
    if (ehObj(o.estilo)) o.estilo = { ...o.estilo, ...(o.estilo.cor !== undefined ? { cor: resolverCor(o.estilo.cor) } : {}), ...(o.estilo.corBorda !== undefined ? { corBorda: resolverCor(o.estilo.corBorda) } : {}) };
    const div = o.divisao; delete o.divisao;
    const filhosObj = Array.isArray(o.filhos) ? o.filhos.filter(ehObj) : [];
    if (Array.isArray(o.filhos)) o.filhos = o.filhos.filter((f) => typeof f === 'string');
    regioes.push(o); registrar(id, o.nome, typeof o.pai === 'string' ? o.pai : null, bbox);
    if (div !== undefined) {
      const spec = especDeDivisao(div, bbox, `${caminho}.divisao`, rel);
      const toco = spec ? validarRegiao({ ...o, filhos: [], pai: null }) : null;
      if (spec && toco) {
        toco.id = id; const gerado = expandirDivisao({ [id]: toco } as Record<string, Regiao>, id, spec, true, novoId);
        o.layout = gerado[id].layout; o.metodo = gerado[id].metodo;
        for (const g of Object.values(gerado)) if (g.id !== id) { regioes.push({ ...g }); registrar(g.id, g.nome, g.pai, g.bbox); }
      }
    }
    if (filhosObj.length) {
      const semCaixa = filhosObj.filter((f) => !ehObj(f.bbox) && !['x', 'y', 'w', 'h'].some((k) => typeof f[k] === 'number'));
      const interna = { x: bbox.x + 12, y: bbox.y + 44, w: Math.max(20, bbox.w - 24), h: Math.max(20, bbox.h - 56) };
      const autos = semCaixa.length ? bboxesDoLayout(interna, { direcao: interna.w >= interna.h ? 'h' : 'v', proporcoes: semCaixa.map(() => 1 / semCaixa.length) }) : [];
      filhosObj.forEach((f, i) => processarRegiao(f, `${caminho}.filhos[${i}]`, id, semCaixa.includes(f) ? autos[semCaixa.indexOf(f)] : null));
    }
  };
  if (Array.isArray(r.regioes)) r.regioes.forEach((rg, i) => processarRegiao(rg, `regioes[${i}]`, null, null));
  else if (r.regioes !== undefined) rel?.aviso('regioes', 'Deveria ser uma lista [ ].');

  /** Resolve "Nome", "id" ou caminho "Mãe / Filha" para o id da região. */
  const resolverRegiao = (v: string): string | undefined => {
    if (caixas.has(v)) return v;
    const partes = v.split(/\s*(?:\/|›|>)\s*/).filter(Boolean);
    if (partes.length > 1) {
      let atual: string | undefined = nomesRegiao.get(semAcento(partes[0]));
      for (const p of partes.slice(1)) { if (!atual) break; atual = (filhosDe.get(atual) ?? []).find((f) => { const reg = regioes.find((x) => x.id === f); return reg && semAcento(String(reg.nome ?? '')) === semAcento(p); }); }
      return atual;
    }
    return nomesRegiao.get(semAcento(v));
  };

  // ---------- Itens (com posição automática) ----------
  const itens: Obj[] = []; let posicionados = 0;
  const fundoRegioes = regioes.filter((x) => !x.pai).reduce((m, x) => { const b = x.bbox as Retangulo; return Math.max(m, (b.y ?? 0) + (b.h ?? 0)); }, -Infinity);
  const cursores = new Map<string, { x: number; y: number; linha: number; ini: number; lim: number }>();
  const proxima = (regiao: string | undefined, w: number, h: number) => {
    const chave = regiao ?? '__lousa__'; let c = cursores.get(chave);
    if (!c) {
      const b = regiao ? caixas.get(regiao) : undefined;
      c = b ? { x: b.x + 16, y: b.y + 48, linha: 0, ini: b.x + 16, lim: b.x + b.w - 16 } : { x: 0, y: Number.isFinite(fundoRegioes) ? fundoRegioes + 60 : 0, linha: 0, ini: 0, lim: 1160 };
      cursores.set(chave, c);
    }
    if (c.x + w > c.lim && c.x > c.ini) { c.x = c.ini; c.y += c.linha + 16; c.linha = 0; }
    const p = { x: c.x, y: c.y }; c.x += w + 16; c.linha = Math.max(c.linha, h); return p;
  };
  const listaItens = Array.isArray(r.itens) ? r.itens : ehObj(r.itens) ? Object.values(r.itens) : [];
  if (r.itens !== undefined && !Array.isArray(r.itens) && !ehObj(r.itens)) rel?.aviso('itens', 'Deveria ser uma lista [ ].');
  listaItens.forEach((it, i) => {
    const caminho = `itens[${i}]`;
    if (!ehObj(it) && typeof it !== 'string') { rel?.aviso(caminho, 'Item ignorado: use um objeto { } ou um texto.'); return; }
    const o: Obj = typeof it === 'string' ? { texto: it } : { ...it };
    const tipo: TipoItem = TIPOS_ITEM.includes(o.tipo as TipoItem) ? (o.tipo as TipoItem) : typeof o.imagem === 'string' && o.tipo === undefined ? 'imagem' : 'postit';
    if (o.tipo === undefined && tipo === 'imagem') o.tipo = 'imagem';
    if (o.html === undefined) { const t = o.texto ?? o.frente; if (typeof t === 'string') o.html = textoParaHtml(t); else if (typeof t === 'number') o.html = String(t); }
    delete o.texto; delete o.frente;
    if (typeof o.versoTexto === 'string' && o.verso === undefined) o.verso = textoParaHtml(o.versoTexto);
    else if (typeof o.verso === 'string' && !/<[a-z][\s\S]*>/i.test(o.verso)) o.verso = textoParaHtml(o.verso);
    delete o.versoTexto;
    if (o.cor !== undefined) o.cor = resolverCor(o.cor);
    if (o.corTexto !== undefined) o.corTexto = resolverCor(o.corTexto);
    if (o.status !== undefined) o.status = resolverStatus(o.status);
    if (o.revisao === true) { o.revisao = { ativa: true, indice: 0, proxima: Date.now() }; if (o.status === undefined) o.status = 'revisar'; }
    else if (o.revisao === false) delete o.revisao;
    else if (ehObj(o.revisao) && o.revisao.ativa === true && o.status === undefined) o.status = 'revisar';
    if (Array.isArray(o.tarefas)) o.tarefas = o.tarefas.map((t) => (typeof t === 'string' ? { texto: t.replace(/^\s*\[(?:x|X| )?\]\s*/, ''), feito: /^\s*\[(x|X)\]/.test(t) } : t));
    if (typeof o.imagem === 'string') { const idImg = novoId(); imagens[idImg] = o.imagem; o.imagemId = idImg; }
    delete o.imagem;
    if (tipo === 'link' && !o.titulo && typeof o.url === 'string') { try { o.titulo = new URL(o.url).hostname.replace(/^www\./, ''); } catch { /* validador avisa */ } }
    if (Array.isArray(o.tracos)) o.tracos = o.tracos.map((t) => (ehObj(t) && t.cor !== undefined ? { ...t, cor: resolverCor(t.cor) } : t));
    const pd = PADROES_TIPO[tipo];
    const w = typeof o.w === 'number' ? o.w : tipo === 'postit' ? tamPostit.w : pd.w;
    const h = typeof o.h === 'number' ? o.h : tipo === 'postit' ? tamPostit.h : pd.h;
    o.w = w; o.h = h;
    if (o.cor === undefined && pd.cor) o.cor = pd.cor;
    for (const [k, v] of Object.entries(pd.extra ?? {})) if (o[k] === undefined) o[k] = v;
    let reg: string | undefined;
    if (typeof o.regiao === 'string' && o.regiao) { reg = resolverRegiao(o.regiao); if (reg) o.regiao = reg; }
    if (typeof o.x !== 'number' || typeof o.y !== 'number') {
      const p = proxima(reg, w, h); if (typeof o.x !== 'number') o.x = p.x; if (typeof o.y !== 'number') o.y = p.y; posicionados++;
    }
    if (o.z === undefined) o.z = i + 1;
    itens.push(o);
  });
  if (posicionados) rel?.info('itens', `${posicionados} item(ns) sem "x"/"y" foram posicionados automaticamente (em grade, dentro da região indicada ou abaixo das regiões).`);

  // ---------- Conectores ----------
  const conectores: Obj[] = [];
  if (Array.isArray(r.conectores)) r.conectores.forEach((c, i) => {
    if (Array.isArray(c)) { conectores.push({ de: c[0], para: c[1], ...(typeof c[2] === 'string' ? { rotulo: c[2] } : {}) }); return; }
    if (!ehObj(c)) { rel?.aviso(`conectores[${i}]`, 'Use { "de": "id1", "para": "id2" } ou ["id1", "id2", "rótulo"].'); return; }
    conectores.push({ ...c, ...(c.cor !== undefined ? { cor: resolverCor(c.cor) } : {}) });
  });

  // ---------- Edital, legenda ----------
  let edital: unknown = r.edital;
  if (ehObj(r.edital)) edital = Object.entries(r.edital).flatMap(([disc, tops]) => (Array.isArray(tops) ? tops : typeof tops === 'string' ? tops.split(/[,;]/) : []).map((t) => (typeof t === 'string' ? { disciplina: disc, topico: t.trim() } : ehObj(t) ? { disciplina: disc, ...t } : null)).filter(Boolean));
  if (Array.isArray(edital)) edital = edital.map((t) => { if (typeof t === 'string') { const k = t.indexOf(':'); return k > 0 ? { disciplina: t.slice(0, k).trim(), topico: t.slice(k + 1).trim() } : { topico: t.trim() }; } return ehObj(t) ? { ...t, ...(t.status !== undefined ? { status: resolverStatus(t.status) } : {}) } : t; });
  let legenda: unknown = r.legenda;
  if (ehObj(r.legenda)) legenda = Object.entries(r.legenda).map(([cor, significado]) => ({ cor: resolverCor(cor), significado }));
  else if (Array.isArray(r.legenda)) legenda = r.legenda.map((l) => (ehObj(l) ? { ...l, cor: resolverCor(l.cor) } : l));

  const bruto: Obj = { versao: 1, nome: typeof r.nome === 'string' ? r.nome : 'Lousa importada', doc: { itens, regioes, conectores, camadas }, config: cfg };
  for (const k of ['visualizacao', 'estudo', 'camera', 'questoes', 'visoesSalvas', 'modelosDivisao', 'arquivada', 'lixeira'] as const) if (r[k] !== undefined) bruto[k] = r[k];
  if (edital !== undefined) bruto.edital = edital;
  if (legenda !== undefined) bruto.legenda = legenda;
  return { bruto, imagens, posicionados };
}
