// ============================================================
// CONECTORES: roteamento "sanitizado" das linhas entre itens.
//  - Âncoras nas laterais (não no centro), deslizando para alinhar.
//  - Desvio de obstáculos (outros post-its) por rota ortogonal (A*).
//  - Cantos arredondados; estilo curvo em Bézier quando não há obstáculo.
//  - Saltos ("pontes") onde uma linha cruza outra.
//  - Itens sobrepostos: arco-ponte visível por cima, em vez de uma
//    linha escondida dentro dos dois cartões.
// Tudo em coordenadas do MUNDO. Funções puras + cache por conector.
// ============================================================
import type { Conector, EstiloConector, Item, Ponto, Retangulo } from '../types';
import { bboxItemGirado, clamp, retangulosIntersectam } from './geometria';

export type Lado = 'n' | 'e' | 's' | 'w';
export interface Ancora { p: Ponto; lado: Lado }
export interface OpcoesRota {
  desviar: boolean;        // desviar de outros itens
  margem: number;          // distância mínima da linha até um obstáculo
  raio: number;            // raio dos cantos das rotas ortogonais
  saltos: boolean;         // desenhar saltos onde linhas se cruzam
}
export interface Rota {
  id: string;
  estilo: EstiloConector;
  pontos: Ponto[];         // polilinha final (sem saltos), do item "de" ao item "para"
  inicio: Ancora; fim: Ancora;
  sobreposto: boolean;     // os dois itens se sobrepõem → arco-ponte
  desviou: boolean;        // precisou contornar obstáculos
  comprimento: number;
  meio: Ponto;             // ponto no meio do comprimento (rótulo)
  anguloMeio: number;      // graus
  bbox: Retangulo;
}
export interface Salto { seg: number; t: number }

export const OPCOES_PADRAO: OpcoesRota = { desviar: true, margem: 18, raio: 12, saltos: true };
const DIR: Record<Lado, Ponto> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
const OPOSTO: Record<Lado, Lado> = { n: 's', s: 'n', e: 'w', w: 'e' };
/** Tipos que não contam como obstáculo (decorações, traços). */
export const TIPOS_SEM_OBSTACULO = new Set<Item['tipo']>(['desenho', 'fita', 'pino', 'carimbo']);

const centro = (r: Retangulo): Ponto => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);
const expandir = (r: Retangulo, m: number): Retangulo => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const dentroEstrito = (p: Ponto, r: Retangulo, eps = 0.01) => p.x > r.x + eps && p.x < r.x + r.w - eps && p.y > r.y + eps && p.y < r.y + r.h - eps;

// ---------- Âncoras ----------
/** Escolhe o par de lados que se "olham" (maior folga entre os retângulos). */
export function escolherLados(a: Retangulo, b: Retangulo): [Lado, Lado] {
  const ca = centro(a), cb = centro(b);
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (gapX >= gapY) return cb.x >= ca.x ? ['e', 'w'] : ['w', 'e'];
  return cb.y >= ca.y ? ['s', 'n'] : ['n', 's'];
}
/** Ponto na borda do lado, deslizando em direção ao alvo (fica reto quando alinhado). */
export function pontoNoLado(r: Retangulo, lado: Lado, alvo: Ponto): Ponto {
  const mx = Math.min(22, r.w * 0.3), my = Math.min(22, r.h * 0.3);
  switch (lado) {
    case 'n': return { x: clamp(alvo.x, r.x + mx, r.x + r.w - mx), y: r.y };
    case 's': return { x: clamp(alvo.x, r.x + mx, r.x + r.w - mx), y: r.y + r.h };
    case 'e': return { x: r.x + r.w, y: clamp(alvo.y, r.y + my, r.y + r.h - my) };
    default: return { x: r.x, y: clamp(alvo.y, r.y + my, r.y + r.h - my) };
  }
}
/** Interseção do raio centro→alvo com a borda (usado no estilo reto). */
export function pontoNaBordaReta(r: Retangulo, alvo: Ponto): Ancora {
  const c = centro(r); const dx = alvo.x - c.x, dy = alvo.y - c.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { p: { x: c.x, y: r.y }, lado: 'n' };
  const sx = dx !== 0 ? (r.w / 2) / Math.abs(dx) : Infinity, sy = dy !== 0 ? (r.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  const lado: Lado = sx < sy ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
  return { p: { x: c.x + dx * s, y: c.y + dy * s }, lado };
}
export function ancoras(a: Retangulo, b: Retangulo, estilo: EstiloConector): [Ancora, Ancora] {
  if (estilo === 'reto') return [pontoNaBordaReta(a, centro(b)), pontoNaBordaReta(b, centro(a))];
  const [la, lb] = escolherLados(a, b);
  const pa0 = pontoNoLado(a, la, centro(b)); const pb = pontoNoLado(b, lb, pa0); const pa = pontoNoLado(a, la, pb);
  return [{ p: pa, lado: la }, { p: pb, lado: lb }];
}
/** Âncora de um retângulo para um ponto solto (rascunho enquanto se arrasta). */
export function ancoraParaPonto(a: Retangulo, alvo: Ponto, estilo: EstiloConector): Ancora {
  if (estilo === 'reto') return pontoNaBordaReta(a, alvo);
  const [la] = escolherLados(a, { x: alvo.x, y: alvo.y, w: 0, h: 0 });
  return { p: pontoNoLado(a, la, alvo), lado: la };
}

// ---------- Curvas ----------
function bezier(p0: Ponto, p1: Ponto, p2: Ponto, p3: Ponto, n = 24): Ponto[] {
  const out: Ponto[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }); }
  return out;
}
function curvaEntre(a: Ancora, b: Ancora): Ponto[] {
  const d = dist(a.p, b.p); const k = clamp(d * 0.45, 28, 220);
  const c1 = { x: a.p.x + DIR[a.lado].x * k, y: a.p.y + DIR[a.lado].y * k }; const c2 = { x: b.p.x + DIR[b.lado].x * k, y: b.p.y + DIR[b.lado].y * k };
  return bezier(a.p, c1, c2, b.p, d > 600 ? 40 : 24);
}
/** Substitui cada canto por um arco (quadrática) achatado em segmentos. */
export function arredondarCantos(pts: Ponto[], raio: number, passos = 6): Ponto[] {
  if (pts.length < 3 || raio <= 0) return pts;
  const out: Ponto[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const la = dist(a, p), lb = dist(p, b); if (la < 1e-6 || lb < 1e-6) continue;
    const r = Math.min(raio, la / 2, lb / 2);
    const pa = { x: p.x + ((a.x - p.x) / la) * r, y: p.y + ((a.y - p.y) / la) * r }; const pb = { x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r };
    out.push(pa);
    for (let s = 1; s < passos; s++) { const t = s / passos, u = 1 - t; out.push({ x: u * u * pa.x + 2 * u * t * p.x + t * t * pb.x, y: u * u * pa.y + 2 * u * t * p.y + t * t * pb.y }); }
    out.push(pb);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export function simplificarColineares(pts: Ponto[]): Ponto[] {
  if (pts.length < 3) return pts;
  const out: Ponto[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], p = pts[i], b = pts[i + 1];
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    if (Math.abs(cross) > 1e-6 && dist(a, p) > 1e-6) out.push(p);
  }
  if (dist(out[out.length - 1], pts[pts.length - 1]) > 1e-6) out.push(pts[pts.length - 1]);
  return out;
}

// ---------- Interseções ----------
function segmentosCruzam(p1: Ponto, p2: Ponto, p3: Ponto, p4: Ponto): { t: number; u: number } | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x); if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d; const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999 ? { t, u } : null;
}
function segmentoCruzaRet(a: Ponto, b: Ponto, r: Retangulo): boolean {
  if (dentroEstrito(a, r) || dentroEstrito(b, r)) return true;
  const c = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  for (let i = 0; i < 4; i++) if (segmentosCruzam(a, b, c[i], c[(i + 1) % 4])) return true;
  return false;
}
export function polilinhaCruza(pts: Ponto[], obst: Retangulo[]): boolean {
  for (const o of obst) {
    for (let i = 0; i < pts.length - 1; i++) if (segmentoCruzaRet(pts[i], pts[i + 1], o)) return true;
  }
  return false;
}

// ---------- Rota ortogonal com desvio (Dijkstra em grade esparsa) ----------
class Heap<T> {
  private a: { k: number; v: T }[] = [];
  get size() { return this.a.length; }
  push(k: number, v: T) { const a = this.a; a.push({ k, v }); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].k <= a[i].k) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop(): { k: number; v: T } | undefined { const a = this.a; if (!a.length) return undefined; const top = a[0]; const last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].k < a[m].k) m = l; if (r < a.length && a[r].k < a[m].k) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}
const LADOS: Lado[] = ['n', 'e', 's', 'w'];
const CUSTO_CURVA = 36;

export function rotaOrtogonal(a: Ancora, b: Ancora, obstaculos: Retangulo[], margem: number): Ponto[] | null {
  const M = margem;
  const sa = { x: a.p.x + DIR[a.lado].x * M, y: a.p.y + DIR[a.lado].y * M };
  const sb = { x: b.p.x + DIR[b.lado].x * M, y: b.p.y + DIR[b.lado].y * M };
  // obstáculos expandidos; os que engolem os "tocos" de saída são ignorados (já estão colados no item)
  const obst = obstaculos.map((o) => expandir(o, M - 0.5)).filter((o) => !dentroEstrito(sa, o) && !dentroEstrito(sb, o));
  const xs = new Set<number>([sa.x, sb.x, (sa.x + sb.x) / 2]); const ys = new Set<number>([sa.y, sb.y, (sa.y + sb.y) / 2]);
  for (const o of obst) { xs.add(o.x); xs.add(o.x + o.w); ys.add(o.y); ys.add(o.y + o.h); }
  const X = [...xs].sort((p, q) => p - q), Y = [...ys].sort((p, q) => p - q);
  if (X.length * Y.length > 40_000) return null; // segurança: cenário gigantesco
  const ix = new Map(X.map((v, i) => [v, i])), iy = new Map(Y.map((v, i) => [v, i]));
  const bloqueado = (p: Ponto) => { for (const o of obst) if (dentroEstrito(p, o)) return true; return false; };
  const W = X.length, H = Y.length; const idx = (i: number, j: number, d: number) => (j * W + i) * 4 + d;
  const custo = new Float64Array(W * H * 4).fill(Infinity); const prev = new Int32Array(W * H * 4).fill(-1);
  const heap = new Heap<number>();
  const i0 = ix.get(sa.x)!, j0 = iy.get(sa.y)!, i1 = ix.get(sb.x)!, j1 = iy.get(sb.y)!;
  const d0 = LADOS.indexOf(a.lado); custo[idx(i0, j0, d0)] = 0; heap.push(0, idx(i0, j0, d0));
  const dAlvo = LADOS.indexOf(OPOSTO[b.lado]); let melhorFim = -1, melhorCusto = Infinity;
  while (heap.size) {
    const { k, v } = heap.pop()!; if (k > custo[v]) continue;
    const d = v % 4; const n = (v - d) / 4; const i = n % W, j = (n - i) / W;
    if (i === i1 && j === j1) { const total = k + (d === dAlvo ? 0 : CUSTO_CURVA); if (total < melhorCusto) { melhorCusto = total; melhorFim = v; } continue; }
    if (k > melhorCusto) break;
    for (let nd = 0; nd < 4; nd++) {
      const dir = DIR[LADOS[nd]]; const ni = i + dir.x, nj = j + dir.y; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const meio = { x: (X[i] + X[ni]) / 2, y: (Y[j] + Y[nj]) / 2 }; if (bloqueado(meio) || bloqueado({ x: X[ni], y: Y[nj] })) continue;
      const passo = Math.abs(X[ni] - X[i]) + Math.abs(Y[nj] - Y[j]); const nk = k + passo + (nd === d ? 0 : CUSTO_CURVA);
      const ni2 = idx(ni, nj, nd); if (nk < custo[ni2]) { custo[ni2] = nk; prev[ni2] = v; heap.push(nk, ni2); }
    }
  }
  if (melhorFim < 0) return null;
  const pts: Ponto[] = []; let cur = melhorFim;
  while (cur >= 0) { const d = cur % 4; const n = (cur - d) / 4; const i = n % W, j = (n - i) / W; pts.push({ x: X[i], y: Y[j] }); cur = prev[cur]; }
  pts.reverse();
  return simplificarColineares([a.p, ...pts, b.p]);
}

// ---------- Arco-ponte para itens sobrepostos ----------
function arcoPonte(a: Retangulo, b: Retangulo): { pontos: Ponto[]; inicio: Ancora; fim: Ancora } {
  const ca = centro(a), cb = centro(b);
  let xa = clamp(ca.x, a.x + 12, a.x + a.w - 12), xb = clamp(cb.x, b.x + 12, b.x + b.w - 12);
  if (Math.abs(xa - xb) < 36) { const s = xa <= xb ? 1 : -1; xa = clamp(xa - 22 * s, a.x + 8, a.x + a.w - 8); xb = clamp(xb + 22 * s, b.x + 8, b.x + b.w - 8); }
  const pa = { x: xa, y: a.y }, pb = { x: xb, y: b.y };
  const topo = Math.min(a.y, b.y) - clamp(Math.abs(xa - xb) * 0.6, 44, 140);
  const pontos = bezier(pa, { x: pa.x, y: topo }, { x: pb.x, y: topo }, pb, 28);
  return { pontos, inicio: { p: pa, lado: 'n' }, fim: { p: pb, lado: 'n' } };
}

// ---------- Medidas ----------
function medir(pts: Ponto[]): { comprimento: number; meio: Ponto; angulo: number; bbox: Retangulo } {
  let total = 0; for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i], pts[i + 1]);
  let acc = 0; let meio = pts[0]; let angulo = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = dist(pts[i], pts[i + 1]); if (acc + l >= total / 2 && l > 0) { const t = (total / 2 - acc) / l; meio = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; angulo = (Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x) * 180) / Math.PI; break; }
    acc += l;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  return { comprimento: total, meio, angulo, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

// ---------- Rota de um conector ----------
export function calcularRota(id: string, estilo: EstiloConector, a: Retangulo, b: Retangulo, obstaculos: Retangulo[], op: OpcoesRota): Rota {
  const base = (pontos: Ponto[], inicio: Ancora, fim: Ancora, sobreposto: boolean, desviou: boolean): Rota => ({ id, estilo, pontos, inicio, fim, sobreposto, desviou, ...(() => { const m = medir(pontos); return { comprimento: m.comprimento, meio: m.meio, anguloMeio: m.angulo, bbox: m.bbox }; })() });
  if (retangulosIntersectam(a, b)) { const arco = arcoPonte(a, b); return base(arco.pontos, arco.inicio, arco.fim, true, false); }
  const [ia, ib] = ancoras(a, b, estilo);
  // só os obstáculos perto do corredor entre os dois itens
  const corredor = expandir({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) }, op.margem * 2 + 20);
  const perto = op.desviar ? obstaculos.filter((o) => retangulosIntersectam(o, corredor)).slice(0, 80) : [];
  let direto: Ponto[];
  if (estilo === 'curvo') direto = curvaEntre(ia, ib);
  else if (estilo === 'reto') direto = [ia.p, ib.p];
  else {
    // ângulo: cotovelo simples (sem obstáculos) a partir dos lados
    const horiz = ia.lado === 'e' || ia.lado === 'w';
    if (horiz) { const mx = (ia.p.x + ib.p.x) / 2; direto = simplificarColineares([ia.p, { x: mx, y: ia.p.y }, { x: mx, y: ib.p.y }, ib.p]); }
    else { const my = (ia.p.y + ib.p.y) / 2; direto = simplificarColineares([ia.p, { x: ia.p.x, y: my }, { x: ib.p.x, y: my }, ib.p]); }
    if (ib.lado !== OPOSTO[ia.lado]) direto = rotaOrtogonal(ia, ib, [], op.margem) ?? direto; // lados não opostos: deixa o roteador resolver
    direto = arredondarCantos(direto, op.raio);
  }
  if (!perto.length || !polilinhaCruza(direto, perto)) return base(direto, ia, ib, false, false);
  const rota = rotaOrtogonal(ia, ib, perto, op.margem);
  if (!rota) return base(direto, ia, ib, false, false);
  const raio = estilo === 'curvo' ? Math.max(op.raio, 36) : estilo === 'reto' ? Math.max(op.raio, 14) : op.raio;
  return base(arredondarCantos(rota, raio), ia, ib, false, true);
}

// ---------- Todas as rotas (com cache) ----------
const cache = new Map<string, { chave: string; rota: Rota }>();
const geo = (r: Retangulo) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;
export function calcularRotas(conectores: Conector[], itens: Record<string, Item>, visivel: (it: Item) => boolean, op: OpcoesRota): Map<string, Rota> {
  const out = new Map<string, Rota>();
  const caixas = new Map<string, Retangulo>(); const obstaculosTodos: { id: string; r: Retangulo }[] = [];
  for (const it of Object.values(itens)) { if (!visivel(it)) continue; const r = bboxItemGirado(it); caixas.set(it.id, r); if (!TIPOS_SEM_OBSTACULO.has(it.tipo)) obstaculosTodos.push({ id: it.id, r }); }
  const vivos = new Set<string>();
  for (const c of conectores) {
    const a = caixas.get(c.de), b = caixas.get(c.para); if (!a || !b) continue; vivos.add(c.id);
    const corredor = expandir({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) }, op.margem * 2 + 20);
    const obst: Retangulo[] = []; let chaveObst = '';
    if (op.desviar) for (const o of obstaculosTodos) { if (o.id === c.de || o.id === c.para) continue; if (retangulosIntersectam(o.r, corredor)) { obst.push(o.r); chaveObst += geo(o.r) + ';'; } }
    const chave = `${c.estilo}|${geo(a)}|${geo(b)}|${op.desviar ? 1 : 0}|${op.margem}|${op.raio}|${chaveObst}`;
    const hit = cache.get(c.id);
    if (hit && hit.chave === chave) { out.set(c.id, hit.rota); continue; }
    const rota = calcularRota(c.id, c.estilo, a, b, obst, op); cache.set(c.id, { chave, rota }); out.set(c.id, rota);
  }
  if (cache.size > vivos.size + 200) for (const k of cache.keys()) if (!vivos.has(k)) cache.delete(k);
  return out;
}

// ---------- Saltos onde linhas se cruzam ----------
export function calcularSaltos(rotas: Rota[]): Map<string, Salto[]> {
  const out = new Map<string, Salto[]>();
  const lista = [...rotas].sort((p, q) => (p.id < q.id ? -1 : 1));
  for (let i = 0; i < lista.length; i++) {
    const A = lista[i];
    for (let j = i + 1; j < lista.length; j++) {
      const B = lista[j]; if (!retangulosIntersectam(A.bbox, B.bbox)) continue;
      for (let s = 0; s < B.pontos.length - 1; s++) {
        const p3 = B.pontos[s], p4 = B.pontos[s + 1];
        for (let r = 0; r < A.pontos.length - 1; r++) {
          const x = segmentosCruzam(A.pontos[r], A.pontos[r + 1], p3, p4); if (!x) continue;
          const arr = out.get(B.id) ?? []; arr.push({ seg: s, t: x.u }); out.set(B.id, arr);
        }
      }
    }
  }
  return out;
}

// ---------- Path SVG ----------
const f = (n: number) => (Math.round(n * 100) / 100).toString();
/** Encurta a ponta final (ou inicial) para a seta não "vazar" pelo item. */
export function encurtar(pts: Ponto[], fim: number, inicio: number): Ponto[] {
  let out = pts.map((p) => ({ ...p }));
  const corta = (arr: Ponto[], q: number) => { let rest = q; while (arr.length > 1 && rest > 0) { const a = arr[arr.length - 1], b = arr[arr.length - 2]; const l = dist(a, b); if (l <= rest) { arr.pop(); rest -= l; } else { arr[arr.length - 1] = { x: a.x + ((b.x - a.x) / l) * rest, y: a.y + ((b.y - a.y) / l) * rest }; rest = 0; } } return arr; };
  if (fim > 0) out = corta(out, fim);
  if (inicio > 0) out = corta(out.reverse(), inicio).reverse();
  return out;
}
export function pathComSaltos(pts: Ponto[], saltos: Salto[] | undefined, raio: number): string {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  const porSeg = new Map<number, number[]>(); for (const s of saltos ?? []) { const arr = porSeg.get(s.seg) ?? []; arr.push(s.t); porSeg.set(s.seg, arr); }
  for (let i = 0; i < pts.length - 1; i++) {
    const P = pts[i], Q = pts[i + 1]; const L = dist(P, Q); const ts = porSeg.get(i);
    if (!ts || L < raio * 2.2) { d += `L${f(Q.x)} ${f(Q.y)}`; continue; }
    const u = { x: (Q.x - P.x) / L, y: (Q.y - P.y) / L }; const sweep = u.x > 0 || (u.x === 0 && u.y < 0) ? 1 : 0;
    const centros = ts.map((t) => clamp(t * L, raio, L - raio)).sort((p, q) => p - q);
    let pos = 0;
    for (let k = 0; k < centros.length; k++) {
      let ini = centros[k] - raio, fimS = centros[k] + raio;
      while (k + 1 < centros.length && centros[k + 1] - raio <= fimS) { k++; fimS = centros[k] + raio; } // mescla saltos vizinhos
      if (ini < pos) ini = pos; if (fimS <= ini) continue;
      const a = { x: P.x + u.x * ini, y: P.y + u.y * ini }, b = { x: P.x + u.x * fimS, y: P.y + u.y * fimS }; const r = (fimS - ini) / 2;
      d += `L${f(a.x)} ${f(a.y)}A${f(r)} ${f(r)} 0 0 ${sweep} ${f(b.x)} ${f(b.y)}`; pos = fimS;
    }
    d += `L${f(Q.x)} ${f(Q.y)}`;
  }
  return d;
}
export function pathSimples(pts: Ponto[]): string { return pts.length ? `M${f(pts[0].x)} ${f(pts[0].y)}` + pts.slice(1).map((p) => `L${f(p.x)} ${f(p.y)}`).join('') : ''; }
/** Triângulo da seta na ponta (ou no início) da polilinha. */
export function seta(pts: Ponto[], tamanho: number, noInicio = false): string {
  if (pts.length < 2) return '';
  const tip = noInicio ? pts[0] : pts[pts.length - 1]; let prev = noInicio ? pts[1] : pts[pts.length - 2]; let k = 2;
  while (dist(tip, prev) < 0.5 && k < pts.length) { prev = noInicio ? pts[k] : pts[pts.length - 1 - k]; k++; }
  const l = dist(tip, prev) || 1; const u = { x: (tip.x - prev.x) / l, y: (tip.y - prev.y) / l }; const n = { x: -u.y, y: u.x };
  const base = { x: tip.x - u.x * tamanho, y: tip.y - u.y * tamanho }; const w = tamanho * 0.48;
  return `M${f(tip.x)} ${f(tip.y)}L${f(base.x + n.x * w)} ${f(base.y + n.y * w)}L${f(base.x - n.x * w)} ${f(base.y - n.y * w)}Z`;
}
export const ladoOposto = (l: Lado) => OPOSTO[l];
export const direcaoLado = (l: Lado) => DIR[l];
/** Rascunho: rota de um item até um ponto solto (ponteiro). */
export function rotaParaPonto(a: Retangulo, alvo: Ponto, estilo: EstiloConector): Ponto[] {
  const an = ancoraParaPonto(a, alvo, estilo);
  if (estilo === 'reto') return [an.p, alvo];
  const lb: Lado = OPOSTO[an.lado];
  if (estilo === 'angulo') { const horiz = an.lado === 'e' || an.lado === 'w'; const pts = horiz ? [an.p, { x: (an.p.x + alvo.x) / 2, y: an.p.y }, { x: (an.p.x + alvo.x) / 2, y: alvo.y }, alvo] : [an.p, { x: an.p.x, y: (an.p.y + alvo.y) / 2 }, { x: alvo.x, y: (an.p.y + alvo.y) / 2 }, alvo]; return arredondarCantos(simplificarColineares(pts), 12); }
  return curvaEntre(an, { p: alvo, lado: lb });
}
