// ============================================================
// SEGURANÇA: filtro central de conteúdo. TODO caminho de entrada
// (colar, arrastar arquivo, importar, restaurar backup, formulários)
// passa por aqui. Nunca inserir HTML da pessoa sem sanitizar.
//
// DOMPurify deve ser mantido SEMPRE atualizado: já houve contornos
// do filtro em versões recentes. Verifique a versão em package.json.
// ============================================================
import DOMPurify from 'dompurify';
import {
  VERSAO_FORMATO, type Camada, type Conector, type Doc, type Item, type Lousa, type Regiao, type TipoItem,
} from '../types';

const TAGS_PERMITIDAS = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'br', 'hr', 'p', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'sub', 'sup', 'code', 'pre', 'blockquote', 'font'];
const ATRIBUTOS_PERMITIDOS = ['href', 'target', 'rel', 'style', 'color', 'align'];
// Só estas propriedades CSS sobrevivem (valores validados abaixo): cor do texto, marca-texto, tamanho e alinhamento.
const COR_CSS = /^(#[0-9a-f]{3,8}|rgba?\([\d.\s,%\/]+\)|hsla?\([\d.\s,%\/]+\)|[a-z]{3,20})$/i;
const ESTILOS_SEGUROS: Record<string, RegExp> = { color: COR_CSS, 'background-color': COR_CSS, 'font-size': /^(\d{1,3}(\.\d+)?(px|pt|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$/i, 'text-align': /^(left|right|center|justify)$/i, 'text-decoration': /^(underline|line-through|none)( (underline|line-through))?$/i, 'font-weight': /^(bold|normal|[1-9]00)$/i, 'font-style': /^(italic|normal)$/i };
export function filtrarEstiloInline(valor: string): string {
  const out: string[] = [];
  for (const decl of valor.split(';')) { const i = decl.indexOf(':'); if (i < 0) continue; const prop = decl.slice(0, i).trim().toLowerCase(); const val = decl.slice(i + 1).trim().replace(/\s*!important\s*$/i, ''); const re = ESTILOS_SEGUROS[prop]; if (re && re.test(val) && !/url|expression|javascript/i.test(val)) out.push(`${prop}: ${val}`); }
  return out.join('; ');
}
const TIPOS_ITEM: TipoItem[] = ['postit', 'texto', 'titulo', 'caixa', 'tarefas', 'tabela', 'imagem', 'link', 'desenho', 'forma', 'cloze', 'contador', 'fita', 'pino', 'carimbo'];
const LIMITE_HTML = 100_000;      // caracteres por item
const LIMITE_ITENS = 20_000;
const LIMITE_REGIOES = 5_000;
const LIMITE_PONTOS = 5_000;

// Ganchos: só http(s)/mailto em links e sempre noopener
if (typeof window !== 'undefined' && typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute('style')) { const limpo = filtrarEstiloInline(node.getAttribute('style') ?? ''); if (limpo) node.setAttribute('style', limpo); else node.removeAttribute('style'); }
    if (node.hasAttribute('color') && !COR_CSS.test(node.getAttribute('color') ?? '')) node.removeAttribute('color');
    if (node.hasAttribute('align') && !/^(left|right|center|justify)$/i.test(node.getAttribute('align') ?? '')) node.removeAttribute('align');
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (!urlSegura(href)) { node.removeAttribute('href'); }
      else { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
    }
  });
}

/** HTML rico limpo: lista explícita de tags; estilos, classes, ids, on*, script, iframe, svg, data: removidos. */
export function sanitizarHtml(html: string): string {
  if (typeof html !== 'string') return '';
  const cortado = html.length > LIMITE_HTML ? html.slice(0, LIMITE_HTML) : html;
  return DOMPurify.sanitize(cortado, {
    ALLOWED_TAGS: TAGS_PERMITIDAS,
    ALLOWED_ATTR: ATRIBUTOS_PERMITIDOS,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'svg', 'math', 'input', 'img', 'video', 'audio', 'link', 'meta', 'base'],
    FORBID_ATTR: ['class', 'id', 'srcset', 'src', 'size', 'face'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  }) as string;
}

/** Texto puro → HTML seguro (escapa tudo, preserva quebras). */
export function textoParaHtml(texto: string): string {
  const div = document.createElement('div');
  div.textContent = String(texto ?? '');
  return div.innerHTML.replace(/\n/g, '<br>');
}

export function htmlParaTexto(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = sanitizarHtml(html);
  // <br> e blocos viram quebras de linha
  div.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  div.querySelectorAll('p,div,li,h1,h2,h3,h4').forEach((el) => el.append('\n'));
  return (div.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export function texto(s: unknown, max = 2000): string {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max) : s;
}

export function urlSegura(url: string): boolean {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
  } catch { return false; }
}
export const pareceUrl = (t: string) => /^https?:\/\/\S+$/i.test(t.trim()) && !/\s/.test(t.trim());

export function corSegura(c: unknown, padrao = '#fff176'): string {
  if (typeof c !== 'string') return padrao;
  return /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$|^rgba?\([\d\s.,%]+\)$|^hsla?\([\d\s.,%]+\)$/.test(c.trim()) ? c.trim() : padrao;
}

// ---------- Imagens ----------
const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export function imagemPermitida(arquivo: Blob): boolean {
  return TIPOS_IMAGEM.includes(arquivo.type); // SVG recusado: pode conter script
}
/** Redimensiona para lado maior ≤ 2000 px e devolve um Blob PNG/JPEG. */
export async function processarImagem(arquivo: Blob, ladoMax = 2000): Promise<{ blob: Blob; w: number; h: number }> {
  if (!imagemPermitida(arquivo)) throw new Error('Formato de imagem não permitido. Use PNG, JPEG, WebP ou GIF.');
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const el = new Image();
      el.onload = () => ok(el); el.onerror = () => erro(new Error('Não foi possível ler a imagem.'));
      el.src = url;
    });
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    if (escala === 1 && arquivo.type !== 'image/gif') return { blob: arquivo, w: img.naturalWidth, h: img.naturalHeight };
    if (arquivo.type === 'image/gif' && escala === 1) return { blob: arquivo, w: img.naturalWidth, h: img.naturalHeight };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala); canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao converter imagem.'))), arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9));
    return { blob, w: canvas.width, h: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
export const blobParaBase64 = (b: Blob) => new Promise<string>((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => erro(r.error); r.readAsDataURL(b); });
export function base64ParaBlob(dataUrl: string): Blob | null {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch { return null; }
}

// ---------- Texto colado ----------
/** Divide texto colado em tópicos: por linha, parágrafo ou marcadores. */
export function dividirTexto(t: string, modo: 'linha' | 'paragrafo' | 'topico'): string[] {
  const limpo = t.replace(/\r/g, '');
  if (modo === 'paragrafo') return limpo.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  if (modo === 'topico') {
    return limpo.split(/\n(?=\s*(?:[-•*–·▪●]|\d+[.)]|[a-z][.)])\s+)/i).map((s) => s.replace(/^\s*(?:[-•*–·▪●]|\d+[.)]|[a-z][.)])\s+/i, '').trim()).filter(Boolean);
  }
  return limpo.split(/\n+/).map((s) => s.replace(/^\s*(?:[-•*–·▪●]|\d+[.)])\s+/, '').trim()).filter(Boolean);
}
export const temMarcadores = (t: string) => (t.match(/^\s*(?:[-•*–·▪●]|\d+[.)])\s+/gm) ?? []).length >= 2;
export function textoParaTabela(t: string): string[][] | null {
  const linhas = t.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (linhas.length < 1) return null;
  const sep = linhas[0].includes('\t') ? '\t' : linhas[0].includes(';') ? ';' : linhas[0].includes(',') ? ',' : null;
  if (!sep) return null;
  const tab = linhas.map((l) => l.split(sep).map((c) => c.trim().slice(0, 500)));
  const cols = Math.max(...tab.map((r) => r.length));
  if (cols < 2) return null;
  return tab.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
}

// ---------- Validação de JSON importado ----------
const num = (v: unknown, padrao = 0, min = -1e7, max = 1e7) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : padrao);
const bool = (v: unknown, padrao = false) => (typeof v === 'boolean' ? v : padrao);
const str = (v: unknown, max = 500, padrao = '') => (typeof v === 'string' ? v.slice(0, max) : padrao);
const nomeLimpo = (v: unknown, max = 500, padrao = '') => str(v, max, padrao).replace(/<[^>]*>/g, '').trim() || padrao;
const idSeguro = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);
const listaStr = (v: unknown, max = 50) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, max).map((s) => s.slice(0, 80)) : []);

export function validarItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = idSeguro(r.id); if (!id) return null;
  const tipo = TIPOS_ITEM.includes(r.tipo as TipoItem) ? (r.tipo as TipoItem) : 'postit';
  const rev = (r.revisao ?? {}) as Record<string, unknown>;
  const item: Item = {
    id, tipo,
    x: num(r.x), y: num(r.y), w: num(r.w, 200, 10, 10000), h: num(r.h, 200, 10, 10000),
    angulo: num(r.angulo, 0, -360, 360), z: num(r.z, 0, 0, 1e9),
    camada: idSeguro(r.camada) ?? 'principal', regiao: idSeguro(r.regiao), grupo: idSeguro(r.grupo),
    travado: bool(r.travado), oculto: bool(r.oculto), fixado: bool(r.fixado),
    criadoEm: num(r.criadoEm, Date.now(), 0, 4e12), alteradoEm: num(r.alteradoEm, Date.now(), 0, 4e12),
    cor: corSegura(r.cor), corTexto: r.corTexto ? corSegura(r.corTexto, '#1f2937') : undefined,
    fonte: str(r.fonte, 200, 'Padrão'), tamanhoFonte: num(r.tamanhoFonte, 15, 8, 120), autoAjuste: bool(r.autoAjuste),
    titulo: nomeLimpo(r.titulo, 120), etiquetas: listaStr(r.etiquetas).map((e) => e.replace(/<[^>]*>/g, '')),
    status: (['nao-visto', 'estudando', 'revisar', 'dominado'] as const).includes(r.status as never) ? (r.status as Item['status']) : 'nao-visto',
    revisao: { ativa: bool(rev.ativa), indice: num(rev.indice, 0, 0, 50), proxima: typeof rev.proxima === 'number' ? num(rev.proxima, 0, 0, 4e12) : null, historico: Array.isArray(rev.historico) ? rev.historico.slice(0, 200).map((h: Record<string, unknown>) => ({ data: num(h?.data, 0, 0, 4e12), acertou: bool(h?.acertou) })) : [] },
    modelo: r.modelo ? str(r.modelo, 40) : undefined,
    html: sanitizarHtml(str(r.html, LIMITE_HTML)),
    verso: r.verso !== undefined ? sanitizarHtml(str(r.verso, LIMITE_HTML)) : undefined,
    virado: bool(r.virado),
  };
  if (r.erro && typeof r.erro === 'object') {
    const e = r.erro as Record<string, unknown>;
    item.erro = { disciplina: str(e.disciplina, 80), assunto: str(e.assunto, 120), banca: str(e.banca, 40), ano: str(e.ano, 8), oQueErrei: str(e.oQueErrei, 2000), motivo: (['nao-sabia', 'confundi', 'li-errado', 'falta-atencao', 'chute'] as const).includes(e.motivo as never) ? (e.motivo as never) : 'nao-sabia', respostaCerta: str(e.respostaCerta, 2000), fonte: str(e.fonte, 300) };
  }
  if (Array.isArray(r.tarefas)) item.tarefas = r.tarefas.slice(0, 200).map((t: Record<string, unknown>) => ({ texto: str(t?.texto, 500), feito: bool(t?.feito) }));
  if (Array.isArray(r.tabela)) item.tabela = r.tabela.slice(0, 100).map((l: unknown) => (Array.isArray(l) ? l.slice(0, 30).map((c) => str(c, 1000)) : []));
  if (r.imagemId) item.imagemId = idSeguro(r.imagemId) ?? undefined;
  if (r.opacidade !== undefined) item.opacidade = num(r.opacidade, 1, 0, 1);
  if (r.recorte && typeof r.recorte === 'object') { const c = r.recorte as Record<string, unknown>; item.recorte = { x: num(c.x, 0, 0, 1), y: num(c.y, 0, 0, 1), w: num(c.w, 1, 0.01, 1), h: num(c.h, 1, 0.01, 1) }; }
  if (r.url !== undefined) item.url = urlSegura(str(r.url, 2000)) ? str(r.url, 2000) : '';
  if (Array.isArray(r.tracos)) item.tracos = r.tracos.slice(0, 500).map((tr: Record<string, unknown>) => ({ pontos: Array.isArray(tr?.pontos) ? tr.pontos.slice(0, LIMITE_PONTOS).map((p: Record<string, unknown>) => ({ x: num(p?.x), y: num(p?.y) })) : [], cor: corSegura(tr?.cor, '#1f2937'), espessura: num(tr?.espessura, 3, 1, 60), marcaTexto: bool(tr?.marcaTexto) }));
  if (r.forma !== undefined) item.forma = str(r.forma, 30);
  if (r.valor !== undefined) item.valor = num(r.valor, 0, -1e9, 1e9);
  if (r.carimbo !== undefined) item.carimbo = str(r.carimbo, 30);
  return item;
}

export function validarRegiao(raw: unknown): Regiao | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>; const id = idSeguro(r.id); if (!id) return null;
  const b = (r.bbox ?? {}) as Record<string, unknown>; const e = (r.estilo ?? {}) as Record<string, unknown>; const l = r.layout as Record<string, unknown> | null;
  return {
    id, nome: nomeLimpo(r.nome, 120, 'Região'), pai: idSeguro(r.pai), filhos: Array.isArray(r.filhos) ? (r.filhos.map(idSeguro).filter(Boolean) as string[]).slice(0, 500) : [],
    bbox: { x: num(b.x), y: num(b.y), w: num(b.w, 100, 1, 1e6), h: num(b.h, 100, 1, 1e6) },
    pontos: Array.isArray(r.pontos) ? r.pontos.slice(0, LIMITE_PONTOS).map((p: Record<string, unknown>) => ({ x: num(p?.x), y: num(p?.y) })) : null,
    layout: l && (l.direcao === 'h' || l.direcao === 'v') && Array.isArray(l.proporcoes) ? { direcao: l.direcao, proporcoes: l.proporcoes.slice(0, 100).map((p) => num(p, 0.1, 0.01, 1)) } : null,
    metodo: str(r.metodo, 40, 'manual'),
    estilo: { cor: corSegura(e.cor, '#60a5fa'), opacidade: num(e.opacidade, 0.18, 0, 1), corBorda: corSegura(e.corBorda, '#64748b'), espessuraBorda: num(e.espessuraBorda, 2, 0, 20), estiloBorda: (['solida', 'tracejada', 'pontilhada', 'dupla'] as const).includes(e.estiloBorda as never) ? (e.estiloBorda as never) : 'solida', raio: num(e.raio, 8, 0, 100), icone: str(e.icone, 8), padrao: (['nenhum', 'listras', 'pontos', 'grade'] as const).includes(e.padrao as never) ? (e.padrao as never) : 'nenhum', rotuloAngulo: num(e.rotuloAngulo, 0, -360, 360), numerar: bool(e.numerar), mostrarTitulo: bool(e.mostrarTitulo, true) },
    recolhida: bool(r.recolhida), oculta: bool(r.oculta), travada: bool(r.travada), ima: bool(r.ima), itensAcompanham: bool(r.itensAcompanham, true), criadoEm: num(r.criadoEm, Date.now(), 0, 4e12), ordem: num(r.ordem, 0, 0, 1e6),
  };
}

export function validarConector(raw: unknown): Conector | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>; const id = idSeguro(r.id), de = idSeguro(r.de), para = idSeguro(r.para);
  if (!id || !de || !para) return null;
  return { id, de, para, estilo: (['reto', 'curvo', 'angulo'] as const).includes(r.estilo as never) ? (r.estilo as never) : 'curvo', tracejado: bool(r.tracejado), rotulo: str(r.rotulo, 120), setaInicio: bool(r.setaInicio), setaFim: bool(r.setaFim, true), cor: corSegura(r.cor, '#475569'), espessura: num(r.espessura, 2, 1, 12), camada: idSeguro(r.camada) ?? 'principal' };
}

export function validarCamada(raw: unknown): Camada | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>; const id = idSeguro(r.id); if (!id) return null;
  return { id, nome: nomeLimpo(r.nome, 60, 'Camada'), visivel: bool(r.visivel, true), travada: bool(r.travada), opacidade: num(r.opacidade, 1, 0, 1) };
}

/** Valida e migra uma lousa importada. Ignora campos desconhecidos. Nunca executa nada do arquivo. */
export function validarLousa(raw: unknown, base: Lousa): Lousa {
  if (!raw || typeof raw !== 'object') throw new Error('O arquivo não contém uma lousa válida.');
  let r = raw as Record<string, unknown>;
  // envelope de exportação { tipo: 'lousa-estudos', lousa, imagens }
  if (r.lousa && typeof r.lousa === 'object') r = r.lousa as Record<string, unknown>;
  const versao = num(r.versao, 1, 0, 1000);
  if (versao > VERSAO_FORMATO) throw new Error(`Este arquivo foi salvo por uma versão mais nova (formato ${versao}). Atualize o programa.`);
  r = migrar(r, versao);
  const doc = (r.doc ?? {}) as Record<string, unknown>;
  const itensRaw = doc.itens && typeof doc.itens === 'object' ? Object.values(doc.itens as Record<string, unknown>) : [];
  if (itensRaw.length > LIMITE_ITENS) throw new Error(`O arquivo tem itens demais (${itensRaw.length}). O limite é ${LIMITE_ITENS}.`);
  const itens: Record<string, Item> = {};
  for (const it of itensRaw) { const v = validarItem(it); if (v) itens[v.id] = v; }
  const regRaw = doc.regioes && typeof doc.regioes === 'object' ? Object.values(doc.regioes as Record<string, unknown>).slice(0, LIMITE_REGIOES) : [];
  const regioes: Record<string, Regiao> = {};
  for (const rg of regRaw) { const v = validarRegiao(rg); if (v) regioes[v.id] = v; }
  for (const rg of Object.values(regioes)) { rg.filhos = rg.filhos.filter((f) => regioes[f]); if (rg.pai && !regioes[rg.pai]) rg.pai = null; }
  const conRaw = doc.conectores && typeof doc.conectores === 'object' ? Object.values(doc.conectores as Record<string, unknown>).slice(0, LIMITE_ITENS) : [];
  const conectores: Record<string, Conector> = {};
  for (const c of conRaw) { const v = validarConector(c); if (v && itens[v.de] && itens[v.para]) conectores[v.id] = v; }
  let camadas = Array.isArray(doc.camadas) ? (doc.camadas.map(validarCamada).filter(Boolean) as Camada[]).slice(0, 50) : [];
  if (!camadas.find((c) => c.id === 'principal')) camadas = [{ id: 'principal', nome: 'Teoria', visivel: true, travada: false, opacidade: 1 }, ...camadas];
  if (!camadas.find((c) => c.id === 'anotacoes')) camadas.push({ id: 'anotacoes', nome: 'Anotações', visivel: true, travada: false, opacidade: 1 });
  for (const it of Object.values(itens)) { if (!camadas.find((c) => c.id === it.camada)) it.camada = 'principal'; if (it.regiao && !regioes[it.regiao]) it.regiao = null; }
  const cam = (r.camera ?? {}) as Record<string, unknown>;
  const cfg = (r.config ?? {}) as Record<string, unknown>;
  const vis = (r.visualizacao ?? {}) as Record<string, unknown>;
  const est = (r.estudo ?? {}) as Record<string, unknown>;
  const novo: Lousa = {
    ...base,
    versao: VERSAO_FORMATO,
    id: idSeguro(r.id) ?? base.id,
    nome: nomeLimpo(r.nome, 80, 'Lousa importada'),
    doc: { itens, conectores, regioes, camadas } as Doc,
    camera: { x: num(cam.x), y: num(cam.y), zoom: num(cam.zoom, 1, 0.05, 8) },
    config: { ...base.config, ...filtrarObjeto(cfg, base.config as unknown as Record<string, unknown>) } as Lousa['config'],
    visualizacao: { ...base.visualizacao, ...filtrarObjeto(vis, base.visualizacao as unknown as Record<string, unknown>), filtro: { ...base.visualizacao.filtro, ...filtrarObjeto((vis.filtro ?? {}) as Record<string, unknown>, base.visualizacao.filtro as unknown as Record<string, unknown>) } } as Lousa['visualizacao'],
    visoesSalvas: Array.isArray(r.visoesSalvas) ? r.visoesSalvas.slice(0, 50).filter((v: Record<string, unknown>) => v && idSeguro(v.id)).map((v: Record<string, unknown>) => ({ id: v.id as string, nome: str(v.nome, 60, 'Visão'), visualizacao: { ...base.visualizacao, ...filtrarObjeto((v.visualizacao ?? {}) as Record<string, unknown>, base.visualizacao as unknown as Record<string, unknown>) } as Lousa['visualizacao'], camera: { x: num((v.camera as Record<string, unknown>)?.x), y: num((v.camera as Record<string, unknown>)?.y), zoom: num((v.camera as Record<string, unknown>)?.zoom, 1, 0.05, 8) } })) : [],
    lixeira: Array.isArray(r.lixeira) ? r.lixeira.slice(0, 500).map((l: Record<string, unknown>) => { const it = validarItem(l?.item); return it ? { item: it, excluidoEm: num(l.excluidoEm, Date.now(), 0, 4e12) } : null; }).filter(Boolean) as Lousa['lixeira'] : [],
    estudo: { ...base.estudo, ...filtrarObjeto(est, base.estudo as unknown as Record<string, unknown>), intervalos: Array.isArray(est.intervalos) ? est.intervalos.map((d) => num(d, 1, 0.01, 3650)).slice(0, 20) : base.estudo.intervalos },
    edital: Array.isArray(r.edital) ? r.edital.slice(0, 2000).filter((t: Record<string, unknown>) => t && idSeguro(t.id)).map((t: Record<string, unknown>) => ({ id: t.id as string, disciplina: str(t.disciplina, 80), topico: str(t.topico, 200), status: (['nao-visto', 'estudando', 'revisar', 'dominado'] as const).includes(t.status as never) ? (t.status as never) : 'nao-visto', dominio: num(t.dominio, 0, 0, 100) })) : [],
    questoes: Array.isArray(r.questoes) ? r.questoes.slice(0, 5000).filter((q: Record<string, unknown>) => q && idSeguro(q.id)).map((q: Record<string, unknown>) => ({ id: q.id as string, data: num(q.data, Date.now(), 0, 4e12), disciplina: str(q.disciplina, 80), assunto: str(q.assunto, 120), acertos: num(q.acertos, 0, 0, 10000), total: num(q.total, 0, 0, 10000) })) : [],
    legenda: Array.isArray(r.legenda) ? r.legenda.slice(0, 30).map((l: Record<string, unknown>) => ({ cor: corSegura(l?.cor), significado: str(l?.significado, 60) })) : [],
    modelosDivisao: Array.isArray(r.modelosDivisao) ? r.modelosDivisao.slice(0, 50).filter((m: Record<string, unknown>) => m && idSeguro(m.id)).map((m: Record<string, unknown>) => ({ id: m.id as string, nome: str(m.nome, 60, 'Modelo'), spec: m.spec })) : [],
    arquivada: bool(r.arquivada),
    criadoEm: num(r.criadoEm, Date.now(), 0, 4e12), alteradoEm: Date.now(),
  };
  return novo;
}

/** Só mantém chaves conhecidas e com o mesmo tipo do padrão. */
function filtrarObjeto(origem: Record<string, unknown>, padrao: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(padrao)) {
    const v = origem[k];
    if (v === undefined) continue;
    const tp = typeof padrao[k];
    if (padrao[k] === null) { out[k] = typeof v === 'string' ? v.slice(0, 200) : v === null ? null : undefined; if (out[k] === undefined) delete out[k]; continue; }
    if (Array.isArray(padrao[k])) { if (Array.isArray(v)) out[k] = v.slice(0, 100).map((x) => (typeof x === 'string' ? x.slice(0, 100) : x)); continue; }
    if (typeof v === tp && tp !== 'object') out[k] = tp === 'string' ? (v as string).slice(0, 200) : tp === 'number' && !Number.isFinite(v as number) ? padrao[k] : v;
  }
  return out;
}

/** Migrações de formato. Acrescente um caso por versão antiga. */
function migrar(r: Record<string, unknown>, versao: number): Record<string, unknown> {
  let atual = r;
  if (versao < 1) {
    // formato 0 (protótipo): itens em lista em vez de dicionário
    const doc = (atual.doc ?? {}) as Record<string, unknown>;
    if (Array.isArray(doc.itens)) doc.itens = Object.fromEntries(doc.itens.map((i: Record<string, unknown>) => [i.id, i]));
    atual = { ...atual, doc, versao: 1 };
  }
  return atual;
}

/** Testes de segurança executáveis pela tela Sobre. */
export function testesDeSeguranca(): { nome: string; passou: boolean; resultado: string }[] {
  const casos: [string, string, (s: string) => boolean][] = [
    ['img onerror', '<img src=x onerror=alert(1)>', (s) => !/onerror|<img/i.test(s)],
    ['svg onload', '<svg onload=alert(1)><circle r=1/></svg>', (s) => !/onload|<svg/i.test(s)],
    ['link javascript:', '<a href="javascript:alert(1)">x</a>', (s) => !/javascript:/i.test(s)],
    ['link data:', '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', (s) => !/data:/i.test(s)],
    ['iframe', '<iframe src="https://exemplo.com"></iframe>', (s) => !/<iframe/i.test(s)],
    ['script', '<script>alert(1)</script><b>ok</b>', (s) => !/<script/i.test(s) && /<b>ok<\/b>/.test(s)],
    ['style embutido', '<p style="position:fixed">x</p>', (s) => !/style=/i.test(s)],
    ['atributo on*', '<b onmouseover="alert(1)">x</b>', (s) => !/onmouseover/i.test(s)],
    ['form', '<form action="https://x"><input></form>', (s) => !/<form|<input/i.test(s)],
    ['object/embed', '<object data="x"></object><embed src="x">', (s) => !/<object|<embed/i.test(s)],
    ['link https permitido', '<a href="https://exemplo.com">ok</a>', (s) => /href="https:\/\/exemplo\.com"/.test(s) && /noopener/.test(s)],
    ['texto enorme', 'a'.repeat(500_000), (s) => s.length <= LIMITE_HTML],
  ];
  return casos.map(([nome, entrada, ok]) => { const r = sanitizarHtml(entrada); return { nome, passou: ok(r), resultado: r.slice(0, 80) }; });
}
