// ============================================================
// SEGURANÇA: filtro central de conteúdo. TODO caminho de entrada
// (colar, arrastar arquivo, importar, restaurar backup, formulários)
// passa por aqui. Nunca inserir HTML da pessoa sem sanitizar.
//
// DOMPurify deve ser mantido SEMPRE atualizado: já houve contornos
// do filtro em versões recentes. Verifique a versão em package.json.
// ============================================================
import DOMPurify from 'dompurify';

export const TAGS_PERMITIDAS = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'br', 'hr', 'p', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'sub', 'sup', 'code', 'pre', 'blockquote', 'font'];
const ATRIBUTOS_PERMITIDOS = ['href', 'target', 'rel', 'style', 'color', 'align'];
// Só estas propriedades CSS sobrevivem (valores validados abaixo): cor do texto, marca-texto, tamanho e alinhamento.
const COR_CSS = /^(#[0-9a-f]{3,8}|rgba?\([\d.\s,%\/]+\)|hsla?\([\d.\s,%\/]+\)|[a-z]{3,20})$/i;
const ESTILOS_SEGUROS: Record<string, RegExp> = { color: COR_CSS, 'background-color': COR_CSS, 'font-size': /^(\d{1,3}(\.\d+)?(px|pt|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$/i, 'text-align': /^(left|right|center|justify)$/i, 'text-decoration': /^(underline|line-through|none)( (underline|line-through))?$/i, 'font-weight': /^(bold|normal|[1-9]00)$/i, 'font-style': /^(italic|normal)$/i };
export const ESTILOS_PERMITIDOS = Object.keys(ESTILOS_SEGUROS);
export function filtrarEstiloInline(valor: string): string {
  const out: string[] = [];
  for (const decl of valor.split(';')) { const i = decl.indexOf(':'); if (i < 0) continue; const prop = decl.slice(0, i).trim().toLowerCase(); const val = decl.slice(i + 1).trim().replace(/\s*!important\s*$/i, ''); const re = ESTILOS_SEGUROS[prop]; if (re && re.test(val) && !/url|expression|javascript/i.test(val)) out.push(`${prop}: ${val}`); }
  return out.join('; ');
}
export const LIMITE_HTML = 100_000;      // caracteres por item

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

/** Cores aceitas em itens/regiões/conectores: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla() e "transparent".
 *  (Antes "transparent" e #rrggbbaa eram recusados: exportar/importar pintava textos, títulos e imagens de amarelo.) */
export const RE_COR_SEGURA = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|hsla?\(\s*[\d.]+(deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+%?\s*)?\)|transparent)$/i;
export const ehCorSegura = (c: unknown): c is string => typeof c === 'string' && c.length <= 60 && RE_COR_SEGURA.test(c.trim());
export function corSegura(c: unknown, padrao = '#fff176'): string {
  return ehCorSegura(c) ? c.trim().toLowerCase() === 'transparent' ? 'transparent' : c.trim() : padrao;
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
// Movida para src/lousa/dados/validacao.ts (com relatório detalhado, esquemas e testes).

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
