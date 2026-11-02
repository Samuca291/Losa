// ============================================================
// GEOMETRIA: câmera, rotação, polígonos e formas.
// Único lugar com telaParaMundo / mundoParaTela.
// ============================================================
import type { Camera, Item, Ponto, Retangulo } from '../types';

export const telaParaMundo = (p: Ponto, cam: Camera): Ponto => ({
  x: (p.x - cam.x) / cam.zoom,
  y: (p.y - cam.y) / cam.zoom,
});
export const mundoParaTela = (p: Ponto, cam: Camera): Ponto => ({
  x: p.x * cam.zoom + cam.x,
  y: p.y * cam.zoom + cam.y,
});

/** Zoom centrado num ponto da tela: o ponto sob o cursor não sai do lugar. */
export function zoomEmTorno(cam: Camera, pontoTela: Ponto, novoZoom: number): Camera {
  const m = telaParaMundo(pontoTela, cam);
  return { zoom: novoZoom, x: pontoTela.x - m.x * novoZoom, y: pontoTela.y - m.y * novoZoom };
}

export const grausParaRad = (g: number) => (g * Math.PI) / 180;
export const radParaGraus = (r: number) => (r * 180) / Math.PI;

export function rotacionarPonto(p: Ponto, centro: Ponto, grausAng: number): Ponto {
  const a = grausParaRad(grausAng);
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - centro.x, dy = p.y - centro.y;
  return { x: centro.x + dx * c - dy * s, y: centro.y + dx * s + dy * c };
}

export const centroItem = (it: { x: number; y: number; w: number; h: number }): Ponto => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 });

/** Quatro cantos do item já girados (coordenadas do mundo). */
export function cantosItem(it: { x: number; y: number; w: number; h: number; angulo: number }): Ponto[] {
  const c = centroItem(it);
  const cs = [
    { x: it.x, y: it.y }, { x: it.x + it.w, y: it.y },
    { x: it.x + it.w, y: it.y + it.h }, { x: it.x, y: it.y + it.h },
  ];
  return it.angulo ? cs.map((p) => rotacionarPonto(p, c, it.angulo)) : cs;
}

export function bboxDePontos(pts: Ponto[]): Retangulo {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const bboxItemGirado = (it: Item): Retangulo => (it.angulo ? bboxDePontos(cantosItem(it)) : { x: it.x, y: it.y, w: it.w, h: it.h });

export function retangulosIntersectam(a: Retangulo, b: Retangulo): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function retanguloContem(a: Retangulo, b: Retangulo): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}
export function pontoEmRetangulo(p: Ponto, r: Retangulo): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
export function uniaoRetangulos(rs: Retangulo[]): Retangulo {
  const pts: Ponto[] = [];
  for (const r of rs) pts.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
  return bboxDePontos(pts);
}
export function normalizarRetangulo(a: Ponto, b: Ponto): Retangulo {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
export const expandirRetangulo = (r: Retangulo, m: number): Retangulo => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

export const poligonoDoRetangulo = (r: Retangulo): Ponto[] => [
  { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
];

/** Ray casting. */
export function pontoEmPoligono(p: Ponto, poly: Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersecta = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

export function areaPoligono(poly: Ponto[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
}

export function centroidePoligono(poly: Ponto[]): Ponto {
  if (!poly.length) return { x: 0, y: 0 };
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += f; cx += (poly[j].x + poly[i].x) * f; cy += (poly[j].y + poly[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = bboxDePontos(poly); return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Mantém a parte do polígono onde a*x + b*y + c >= 0. */
export function cliparMeioPlano(poly: Ponto[], a: number, b: number, c: number): Ponto[] {
  const out: Ponto[] = [];
  const f = (p: Ponto) => a * p.x + b * p.y + c;
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const fp = f(P), fq = f(Q);
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t });
    }
  }
  return out;
}

/** Sutherland–Hodgman: recorta `subject` por um polígono CONVEXO `clip`. */
export function cliparPoligono(subject: Ponto[], clip: Ponto[]): Ponto[] {
  if (!ehConvexo(clip)) return subject;
  // garantir orientação anti-horária do clip (área com sinal positiva)
  let poly = subject;
  const sinal = areaComSinal(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length];
    // reta AB: lado interior
    const a = -(B.y - A.y) * sinal, b = (B.x - A.x) * sinal;
    const c = -(a * A.x + b * A.y);
    poly = cliparMeioPlano(poly, a, b, c);
    if (!poly.length) break;
  }
  return poly;
}

function areaComSinal(poly: Ponto[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
  return a / 2;
}

export function ehConvexo(poly: Ponto[]): boolean {
  if (poly.length < 4) return true;
  let sinal = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sinal === 0) sinal = s; else if (s !== sinal) return false;
  }
  return true;
}

/** Divide um polígono por uma reta que passa por p1 e p2; retorna os dois lados. */
export function dividirPoligonoPorReta(poly: Ponto[], p1: Ponto, p2: Ponto): [Ponto[], Ponto[]] {
  const a = -(p2.y - p1.y), b = p2.x - p1.x;
  const c = -(a * p1.x + b * p1.y);
  return [cliparMeioPlano(poly, a, b, c), cliparMeioPlano(poly, -a, -b, -c)];
}

/** Polígono de elipse. */
export function elipsePoligono(cx: number, cy: number, rx: number, ry: number, n = 48, inicio = 0): Ponto[] {
  const pts: Ponto[] = [];
  for (let i = 0; i < n; i++) {
    const a = inicio + (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/** Setor anular (fatia de anel) entre ângulos a0 e a1 (radianos). rInt=0 vira fatia de pizza. */
export function setorAnular(cx: number, cy: number, rExt: number, rInt: number, a0: number, a1: number, n = 24, ryFator = 1): Ponto[] {
  const pts: Ponto[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push({ x: cx + Math.cos(a) * rExt, y: cy + Math.sin(a) * rExt * ryFator });
  }
  if (rInt > 0) {
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push({ x: cx + Math.cos(a) * rInt, y: cy + Math.sin(a) * rInt * ryFator });
    }
  } else {
    pts.push({ x: cx, y: cy });
  }
  return pts;
}

/** Suaviza um polígono (Chaikin). */
export function suavizarPoligono(poly: Ponto[], iteracoes = 2): Ponto[] {
  let pts = poly;
  for (let k = 0; k < iteracoes; k++) {
    const out: Ponto[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      out.push({ x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y });
      out.push({ x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y });
    }
    pts = out;
  }
  return pts;
}

/** Reduz pontos muito próximos (para laços à mão livre). */
export function simplificarPontos(pts: Ponto[], tol: number): Ponto[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const u = out[out.length - 1];
    if (Math.hypot(pts[i].x - u.x, pts[i].y - u.y) >= tol) out.push(pts[i]);
  }
  return out;
}

export const caminhoSvg = (pts: Ponto[]): string => (pts.length ? `M${pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('L')}Z` : '');

/** Formas prontas em coordenadas normalizadas (0..1) depois escaladas para o retângulo r. */
export function formaPronta(nome: string, r: Retangulo): Ponto[] {
  const esc = (pts: [number, number][]) => pts.map(([x, y]) => ({ x: r.x + x * r.w, y: r.y + y * r.h }));
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  switch (nome) {
    case 'elipse': return elipsePoligono(cx, cy, r.w / 2, r.h / 2, 64);
    case 'circulo': { const rr = Math.min(r.w, r.h) / 2; return elipsePoligono(cx, cy, rr, rr, 64); }
    case 'arredondado': {
      const rad = Math.min(r.w, r.h) * 0.12; const pts: Ponto[] = [];
      const cantos = [[r.x + r.w - rad, r.y + rad, -Math.PI / 2], [r.x + r.w - rad, r.y + r.h - rad, 0], [r.x + rad, r.y + r.h - rad, Math.PI / 2], [r.x + rad, r.y + rad, Math.PI]];
      for (const [ccx, ccy, a0] of cantos) for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); pts.push({ x: ccx + Math.cos(a) * rad, y: ccy + Math.sin(a) * rad }); }
      return pts;
    }
    case 'losango': return esc([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
    case 'triangulo': return esc([[0.5, 0], [1, 1], [0, 1]]);
    case 'hexagono': return esc([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]);
    case 'estrela': {
      const pts: Ponto[] = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 === 0 ? 0.5 : 0.22; pts.push({ x: cx + Math.cos(a) * rr * r.w, y: cy + Math.sin(a) * rr * r.h }); }
      return pts;
    }
    case 'nuvem': {
      const pts: Ponto[] = []; const bolhas = [[0.3, 0.55, 0.28], [0.5, 0.4, 0.3], [0.72, 0.55, 0.26], [0.5, 0.65, 0.3]];
      // contorno aproximado por união angular
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2; let melhor = { x: cx, y: cy }, dist = 0;
        for (const [bx, by, br] of bolhas) {
          const px = r.x + bx * r.w + Math.cos(a) * br * r.w, py = r.y + by * r.h + Math.sin(a) * br * r.h;
          const d = Math.hypot(px - cx, py - cy); if (d > dist) { dist = d; melhor = { x: px, y: py }; }
        }
        pts.push(melhor);
      }
      return pts;
    }
    case 'balao': return [...elipsePoligono(cx, r.y + r.h * 0.4, r.w / 2, r.h * 0.4, 40, Math.PI * 0.62).slice(0, 36), { x: r.x + r.w * 0.25, y: r.y + r.h }, { x: r.x + r.w * 0.32, y: r.y + r.h * 0.78 }];
    case 'chave': return esc([[0, 0.5], [0.15, 0.4], [0.15, 0.05], [0.3, 0], [0.3, 0.1], [0.22, 0.12], [0.22, 0.45], [0.1, 0.5], [0.22, 0.55], [0.22, 0.88], [0.3, 0.9], [0.3, 1], [0.15, 0.95], [0.15, 0.6]]);
    case 'seta': return esc([[0, 0.3], [0.65, 0.3], [0.65, 0], [1, 0.5], [0.65, 1], [0.65, 0.7], [0, 0.7]]);
    case 'L': return esc([[0, 0], [0.35, 0], [0.35, 0.65], [1, 0.65], [1, 1], [0, 1]]);
    case 'T': return esc([[0, 0], [1, 0], [1, 0.3], [0.65, 0.3], [0.65, 1], [0.35, 1], [0.35, 0.3], [0, 0.3]]);
    case 'U': return esc([[0, 0], [0.3, 0], [0.3, 0.7], [0.7, 0.7], [0.7, 0], [1, 0], [1, 1], [0, 1]]);
    case 'cruz': return esc([[0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65], [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]]);
    case 'pentagono': return esc([[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]]);
    case 'coracao': {
      const pts: Ponto[] = [];
      for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2; const x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); pts.push({ x: cx + (x / 34) * r.w, y: cy + (y / 34) * r.h }); }
      return pts;
    }
    case 'trapezio': return esc([[0.2, 0], [0.8, 0], [1, 1], [0, 1]]);
    case 'paralelogramo': return esc([[0.2, 0], [1, 0], [0.8, 1], [0, 1]]);
    default: return poligonoDoRetangulo(r);
  }
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const arredondarPara = (v: number, passo: number) => Math.round(v / passo) * passo;
export const normalizarAngulo = (a: number) => ((a % 360) + 360) % 360;

/** Ponto onde a reta centro→alvo cruza a borda do retângulo (para conectores). */
export function pontoNaBorda(r: Retangulo, alvo: Ponto): Ponto {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const dx = alvo.x - c.x, dy = alvo.y - c.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return c;
  const sx = dx !== 0 ? (r.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (r.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export function luminancia(hex: string): number {
  const m = hex.replace('#', '');
  if (m.length < 6) return 1;
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const corTextoPara = (fundo: string) => (luminancia(fundo) > 0.55 ? '#1f2937' : '#f8fafc');
