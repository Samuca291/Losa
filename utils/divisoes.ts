// ============================================================
// DIVISÕES DA LOUSA: catálogo de métodos que geram especificações
// de regiões filhas a partir da caixa (bbox) da região-mãe.
// Divisões retas guardam PROPORÇÕES (%); as livres guardam polígonos.
// ============================================================
import type { Ponto, Retangulo } from '../types';
import {
  cliparPoligono, dividirPoligonoPorReta, elipsePoligono, formaPronta as formaPoly,
  poligonoDoRetangulo, setorAnular, suavizarPoligono,
} from './geometria';

export interface EspecRegiao {
  nome: string;
  pontos?: Ponto[] | null;
  cor?: string;
  sub?: EspecDivisao;
}
export interface EspecDivisao {
  metodo: string;
  layout?: { direcao: 'h' | 'v'; proporcoes: number[] };
  filhos: EspecRegiao[];
}

export interface ParamDef {
  chave: string; rotulo: string; tipo: 'numero' | 'texto' | 'opcao';
  min?: number; max?: number; padrao: string | number; opcoes?: { valor: string; rotulo: string }[];
}
export interface EntradaCatalogo {
  id: string; grupo: string; nome: string; icone: string; descricao: string;
  params?: ParamDef[];
  gerar: (r: Retangulo, p: Record<string, string | number>) => EspecDivisao;
}

const normalizar = (props: number[]) => { const s = props.reduce((a, b) => a + b, 0) || 1; return props.map((p) => Math.max(0.02, p / s)); };
const n = (v: string | number | undefined, padrao: number, min = 1, max = 24) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : padrao; };
const lerProporcoes = (txt: string | number | undefined, qtd: number): number[] => {
  const partes = String(txt ?? '').split(/[,; ]+/).map(Number).filter((x) => x > 0);
  return partes.length === qtd ? normalizar(partes) : Array(qtd).fill(1 / qtd);
};
const lerNomes = (txt: string | number | undefined, qtd: number, prefixo: string): string[] => {
  const partes = String(txt ?? '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  return Array.from({ length: qtd }, (_, i) => partes[i] || `${prefixo} ${i + 1}`);
};

/** Caixas dos filhos de um layout de proporções. */
export function bboxesDoLayout(r: Retangulo, layout: { direcao: 'h' | 'v'; proporcoes: number[] }): Retangulo[] {
  const out: Retangulo[] = []; let acc = 0;
  for (const p of layout.proporcoes) {
    if (layout.direcao === 'h') out.push({ x: r.x + r.w * acc, y: r.y, w: r.w * p, h: r.h });
    else out.push({ x: r.x, y: r.y + r.h * acc, w: r.w, h: r.h * p });
    acc += p;
  }
  return out;
}

// ---------- Retas ----------
export const linhas = (props: number[], nomes?: string[]): EspecDivisao => ({ metodo: 'linhas', layout: { direcao: 'v', proporcoes: normalizar(props) }, filhos: props.map((_, i) => ({ nome: nomes?.[i] ?? `Linha ${i + 1}` })) });
export const colunas = (props: number[], nomes?: string[]): EspecDivisao => ({ metodo: 'colunas', layout: { direcao: 'h', proporcoes: normalizar(props) }, filhos: props.map((_, i) => ({ nome: nomes?.[i] ?? `Coluna ${i + 1}` })) });
export function grade(nl: number, nc: number, propL?: number[], propC?: number[], nomes?: (string | undefined)[][]): EspecDivisao {
  const pl = propL ?? Array(nl).fill(1), pc = propC ?? Array(nc).fill(1);
  return {
    metodo: 'grade',
    layout: { direcao: 'v', proporcoes: normalizar(pl) },
    filhos: pl.map((_, i) => ({ nome: `Linha ${i + 1}`, sub: { metodo: 'colunas', layout: { direcao: 'h', proporcoes: normalizar(pc) }, filhos: pc.map((__, j) => ({ nome: nomes?.[i]?.[j] ?? `L${i + 1}C${j + 1}` })) } })),
  };
}

// ---------- Inclinadas ----------
const poly = (nome: string, pontos: Ponto[], cor?: string): EspecRegiao => ({ nome, pontos, cor });
export function diagonal(r: Retangulo, sentido: string): EspecDivisao {
  const R = poligonoDoRetangulo(r);
  const [a, b] = sentido === 'asc'
    ? dividirPoligonoPorReta(R, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y })
    : dividirPoligonoPorReta(R, { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
  return { metodo: 'diagonal', filhos: [poly('Lado A', a), poly('Lado B', b)] };
}
export function emX(r: Retangulo): EspecDivisao {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const tl = { x: r.x, y: r.y }, tr = { x: r.x + r.w, y: r.y }, br = { x: r.x + r.w, y: r.y + r.h }, bl = { x: r.x, y: r.y + r.h };
  return { metodo: 'x', filhos: [poly('Topo', [tl, tr, c]), poly('Direita', [tr, br, c]), poly('Base', [br, bl, c]), poly('Esquerda', [bl, tl, c])] };
}
export function losangoCentral(r: Retangulo): EspecDivisao {
  const mt = { x: r.x + r.w / 2, y: r.y }, mr = { x: r.x + r.w, y: r.y + r.h / 2 }, mb = { x: r.x + r.w / 2, y: r.y + r.h }, ml = { x: r.x, y: r.y + r.h / 2 };
  const tl = { x: r.x, y: r.y }, tr = { x: r.x + r.w, y: r.y }, br = { x: r.x + r.w, y: r.y + r.h }, bl = { x: r.x, y: r.y + r.h };
  return { metodo: 'losango', filhos: [poly('Centro', [mt, mr, mb, ml]), poly('Canto 1', [tl, mt, ml]), poly('Canto 2', [mt, tr, mr]), poly('Canto 3', [mr, br, mb]), poly('Canto 4', [ml, mb, bl])] };
}
export function faixasInclinadas(r: Retangulo, qtd: number, anguloGraus: number): EspecDivisao {
  const R = poligonoDoRetangulo(r);
  const a = (anguloGraus * Math.PI) / 180;
  const nx = Math.cos(a), ny = Math.sin(a); // normal das faixas
  const projs = R.map((p) => p.x * nx + p.y * ny);
  const min = Math.min(...projs), max = Math.max(...projs);
  const filhos: EspecRegiao[] = [];
  for (let i = 0; i < qtd; i++) {
    const d0 = min + ((max - min) * i) / qtd, d1 = min + ((max - min) * (i + 1)) / qtd;
    let p = R;
    p = cliparMeioPlanoLocal(p, nx, ny, -d0);
    p = cliparMeioPlanoLocal(p, -nx, -ny, d1);
    if (p.length >= 3) filhos.push(poly(`Faixa ${i + 1}`, p));
  }
  return { metodo: 'faixas', filhos };
}
function cliparMeioPlanoLocal(p: Ponto[], a: number, b: number, c: number): Ponto[] {
  const out: Ponto[] = []; const f = (q: Ponto) => a * q.x + b * q.y + c;
  for (let i = 0; i < p.length; i++) {
    const P = p[i], Q = p[(i + 1) % p.length]; const fp = f(P), fq = f(Q);
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t }); }
  }
  return out;
}
export function zigueZague(r: Retangulo, qtd: number): EspecDivisao {
  const filhos: EspecRegiao[] = []; const passo = r.w / qtd;
  for (let i = 0; i < qtd; i++) {
    const x0 = r.x + i * passo, x1 = x0 + passo;
    const cima = i % 2 === 0;
    filhos.push(poly(`Triângulo ${i + 1}`, cima ? [{ x: x0, y: r.y + r.h }, { x: (x0 + x1) / 2, y: r.y }, { x: x1, y: r.y + r.h }] : [{ x: x0, y: r.y }, { x: x1, y: r.y }, { x: (x0 + x1) / 2, y: r.y + r.h }]));
  }
  // preenche os triângulos complementares
  for (let i = 0; i <= qtd; i++) {
    const xm = r.x + i * passo; const xa = xm - passo / 2, xb = xm + passo / 2;
    const par = i % 2 === 0; // vértices no topo para pares
    const pts = par ? [{ x: Math.max(r.x, xa), y: r.y }, { x: Math.min(r.x + r.w, xb), y: r.y }, { x: xm, y: r.y + r.h }] : [{ x: Math.max(r.x, xa), y: r.y + r.h }, { x: xm, y: r.y }, { x: Math.min(r.x + r.w, xb), y: r.y + r.h }];
    filhos.push(poly(`Encaixe ${i + 1}`, pts.filter((p, k, arr) => k === 0 || p.x !== arr[k - 1].x || p.y !== arr[k - 1].y)));
  }
  return { metodo: 'ziguezague', filhos: filhos.filter((f) => (f.pontos?.length ?? 0) >= 3) };
}

// ---------- Circulares ----------
const centroRaio = (r: Retangulo) => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, raio: Math.min(r.w, r.h) / 2 });
export function circuloCentral(r: Retangulo, fator: number): EspecDivisao {
  const { cx, cy, raio } = centroRaio(r);
  return { metodo: 'circulo', filhos: [poly('Centro', elipsePoligono(cx, cy, raio * fator, raio * fator, 64))] };
}
export function aneis(r: Retangulo, qtd: number): EspecDivisao {
  const { cx, cy, raio } = centroRaio(r); const filhos: EspecRegiao[] = [];
  for (let i = 0; i < qtd; i++) {
    const rExt = (raio * (qtd - i)) / qtd, rInt = (raio * (qtd - i - 1)) / qtd;
    filhos.push(poly(i === qtd - 1 ? 'Centro' : `Anel ${qtd - i}`, setorAnular(cx, cy, rExt, rInt, 0, Math.PI * 2 - 0.0001, 64)));
  }
  return { metodo: 'aneis', filhos };
}
export function pizza(r: Retangulo, qtd: number, inicioGraus = -90, nomes?: string[], raioFator = 1): EspecDivisao {
  const { cx, cy, raio } = centroRaio(r); const filhos: EspecRegiao[] = []; const a0 = (inicioGraus * Math.PI) / 180;
  for (let i = 0; i < qtd; i++) {
    const s = a0 + (i / qtd) * Math.PI * 2, e = a0 + ((i + 1) / qtd) * Math.PI * 2;
    filhos.push(poly(nomes?.[i] ?? `Fatia ${i + 1}`, setorAnular(cx, cy, raio * raioFator, 0, s, e, 16)));
  }
  return { metodo: 'pizza', filhos };
}
export function meiaLua(r: Retangulo): EspecDivisao {
  const { cx, cy, raio } = centroRaio(r);
  return { metodo: 'meia-lua', filhos: [poly('Metade superior', setorAnular(cx, cy, raio, 0, Math.PI, Math.PI * 2, 32)), poly('Metade inferior', setorAnular(cx, cy, raio, 0, 0, Math.PI, 32))] };
}
export function espiral(r: Retangulo, voltas: number): EspecDivisao {
  const { cx, cy, raio } = centroRaio(r); const filhos: EspecRegiao[] = []; const segPorVolta = 6; const total = voltas * segPorVolta;
  for (let i = 0; i < total; i++) {
    const t0 = i / total, t1 = (i + 1) / total;
    const a0 = t0 * voltas * Math.PI * 2 - Math.PI / 2, a1 = t1 * voltas * Math.PI * 2 - Math.PI / 2;
    const rInt0 = raio * (t0 * 0.85), rExt0 = raio * (t0 * 0.85 + 1 / voltas) * 0.85;
    const pts: Ponto[] = []; const nn = 8;
    for (let k = 0; k <= nn; k++) { const a = a0 + ((a1 - a0) * k) / nn; const rr = rExt0 + (raio * (t1 - t0) * 0.85 * k) / nn; pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr }); }
    for (let k = nn; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / nn; const rr = rInt0 + (raio * (t1 - t0) * 0.85 * k) / nn; pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr }); }
    filhos.push(poly(`Passo ${i + 1}`, pts));
  }
  return { metodo: 'espiral', filhos };
}
export const relogio = (r: Retangulo) => ({ ...pizza(r, 12, -105, Array.from({ length: 12 }, (_, i) => `${i + 1}h`)), metodo: 'relogio' });
export const roleta = (r: Retangulo, qtd: number) => { const s = pizza(r, qtd, -90); s.filhos.forEach((f, i) => { f.cor = i % 2 ? '#f87171' : '#1f2937'; }); return { ...s, metodo: 'roleta' }; };

// ---------- Livres e formas ----------
export const poligonoLivre = (pontos: Ponto[], suave = false, nome = 'Região livre'): EspecDivisao => ({ metodo: 'poligono', filhos: [poly(nome, suave ? suavizarPoligono(pontos, 2) : pontos)] });
export function formaPronta(r: Retangulo, nome: string, margem = 0.06): EspecDivisao {
  const m = Math.min(r.w, r.h) * margem;
  return { metodo: `forma-${nome}`, filhos: [poly(nomeForma(nome), formaPoly(nome, { x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: r.h - 2 * m }))] };
}
export const FORMAS_PRONTAS = ['arredondado', 'elipse', 'circulo', 'losango', 'triangulo', 'hexagono', 'pentagono', 'estrela', 'nuvem', 'balao', 'chave', 'seta', 'L', 'T', 'U', 'cruz', 'coracao', 'trapezio', 'paralelogramo'];
export const nomeForma = (f: string) => ({ arredondado: 'Retângulo arredondado', elipse: 'Elipse', circulo: 'Círculo', losango: 'Losango', triangulo: 'Triângulo', hexagono: 'Hexágono', pentagono: 'Pentágono', estrela: 'Estrela', nuvem: 'Nuvem', balao: 'Balão', chave: 'Chave', seta: 'Seta', L: 'Forma L', T: 'Forma T', U: 'Forma U', cruz: 'Cruz', coracao: 'Coração', trapezio: 'Trapézio', paralelogramo: 'Paralelogramo' } as Record<string, string>)[f] ?? f;

/** Traçar linha: divide o polígono da região pela reta p1→p2. */
export function porLinha(polyPai: Ponto[], p1: Ponto, p2: Ponto): EspecDivisao {
  const [a, b] = dividirPoligonoPorReta(polyPai, p1, p2);
  return { metodo: 'linha', filhos: [poly('Lado A', a), poly('Lado B', b)].filter((f) => (f.pontos?.length ?? 0) >= 3) };
}
/** Linha em degraus/polilinha que atravessa a caixa de um lado ao outro. */
export function porPolilinha(r: Retangulo, pts: Ponto[]): EspecDivisao {
  if (pts.length < 2) return { metodo: 'linha', filhos: [] };
  const ini = pts[0], fim = pts[pts.length - 1];
  const horizontal = Math.abs(fim.x - ini.x) >= Math.abs(fim.y - ini.y);
  let caminho = [...pts];
  if (horizontal) {
    if (caminho[0].x > caminho[caminho.length - 1].x) caminho = caminho.reverse();
    caminho[0] = { x: r.x, y: caminho[0].y }; caminho[caminho.length - 1] = { x: r.x + r.w, y: caminho[caminho.length - 1].y };
    const A = [...caminho, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y }];
    const B = [...caminho, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
    return { metodo: 'degraus', filhos: [poly('Acima', A), poly('Abaixo', B)] };
  }
  if (caminho[0].y > caminho[caminho.length - 1].y) caminho = caminho.reverse();
  caminho[0] = { x: caminho[0].x, y: r.y }; caminho[caminho.length - 1] = { x: caminho[caminho.length - 1].x, y: r.y + r.h };
  const A = [...caminho, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }];
  const B = [...caminho, { x: r.x + r.w, y: r.y + r.h }, { x: r.x + r.w, y: r.y }];
  return { metodo: 'degraus', filhos: [poly('Esquerda', A), poly('Direita', B)] };
}

// ---------- Modelos de estudo ----------
export const cornell = (): EspecDivisao => ({ metodo: 'cornell', layout: { direcao: 'v', proporcoes: [0.72, 0.28] }, filhos: [{ nome: 'Anotações', sub: { metodo: 'colunas', layout: { direcao: 'h', proporcoes: [0.3, 0.7] }, filhos: [{ nome: 'Pistas e perguntas', cor: '#fbbf24' }, { nome: 'Anotações', cor: '#60a5fa' }] } }, { nome: 'Resumo', cor: '#34d399' }] });
export function matriz2x2(tipo: string): EspecDivisao {
  const nomes: Record<string, string[][]> = {
    'importante-urgente': [['Importante e urgente', 'Importante, não urgente'], ['Urgente, não importante', 'Nem urgente nem importante']],
    'facil-dificil': [['Fácil e cai muito', 'Difícil e cai muito'], ['Fácil e cai pouco', 'Difícil e cai pouco']],
    'sei-nao-sei': [['Sei e acerto', 'Sei mas erro'], ['Não sei e chuto', 'Não sei e deixo em branco']],
  };
  return { ...grade(2, 2, undefined, undefined, nomes[tipo] ?? nomes['importante-urgente']), metodo: 'matriz' };
}
export const kanban = (): EspecDivisao => { const s = colunas([1, 1, 1, 1], ['A estudar', 'Estudando', 'Revisar', 'Dominado']); s.filhos.forEach((f, i) => { f.cor = ['#94a3b8', '#60a5fa', '#fbbf24', '#34d399'][i]; }); return { ...s, metodo: 'kanban' }; };
export const raias = (qtd: number, nomesTxt: string | number | undefined, prefixo: string) => ({ ...linhas(Array(qtd).fill(1), lerNomes(nomesTxt, qtd, prefixo)), metodo: 'raias' });
export const linhaDoTempo = (qtd: number, dir: 'h' | 'v', nomesTxt?: string | number) => ({ ...(dir === 'h' ? colunas(Array(qtd).fill(1), lerNomes(nomesTxt, qtd, 'Período')) : linhas(Array(qtd).fill(1), lerNomes(nomesTxt, qtd, 'Período'))), metodo: 'linha-tempo' });
export function mapaMental(r: Retangulo, ramos: number, nomesTxt?: string | number): EspecDivisao {
  const { cx, cy, raio } = centroRaio(r); const R = poligonoDoRetangulo(r); const nomes = lerNomes(nomesTxt, ramos, 'Ramo');
  const filhos: EspecRegiao[] = [poly('Tema central', elipsePoligono(cx, cy, raio * 0.32, raio * 0.32, 48), '#fbbf24')];
  const rExt = Math.hypot(r.w, r.h);
  for (let i = 0; i < ramos; i++) {
    const s = -Math.PI / 2 + (i / ramos) * Math.PI * 2, e = -Math.PI / 2 + ((i + 1) / ramos) * Math.PI * 2;
    const setor = setorAnular(cx, cy, rExt, raio * 0.34, s, e, 24);
    filhos.push(poly(nomes[i], cliparPoligono(setor, R)));
  }
  return { metodo: 'mapa-mental', filhos };
}
export function comparativo(criterios: number, nomesTxt?: string | number): EspecDivisao {
  const nomesCrit = lerNomes(nomesTxt, criterios, 'Critério');
  const nomes: string[][] = [['Critério', 'Conceito A', 'Conceito B'], ...nomesCrit.map((c) => [c, `${c}: A`, `${c}: B`])];
  return { ...grade(criterios + 1, 3, [0.6, ...Array(criterios).fill(1)], [0.8, 1, 1], nomes), metodo: 'comparativo' };
}
export function semanaEstudo(blocos: number): EspecDivisao {
  const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const nomesBloco = blocos === 3 ? ['Manhã', 'Tarde', 'Noite'] : Array.from({ length: blocos }, (_, i) => `Bloco ${i + 1}`);
  return { metodo: 'semana', layout: { direcao: 'h', proporcoes: Array(7).fill(1 / 7) }, filhos: dias.map((d) => ({ nome: d, sub: { metodo: 'linhas', layout: { direcao: 'v', proporcoes: Array(blocos).fill(1 / blocos) }, filhos: nomesBloco.map((b) => ({ nome: `${d.slice(0, 3)} · ${b}` })) } })) };
}
/** Mural do edital: "Disciplina: tópico 1, tópico 2" por linha. */
export function muralEdital(texto: string): EspecDivisao {
  const linhasTxt = String(texto).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const discs = linhasTxt.length ? linhasTxt : ['Português', 'Direito Constitucional', 'Direito Administrativo', 'Raciocínio Lógico'];
  const filhos: EspecRegiao[] = discs.map((l, i) => {
    const [nome, resto] = l.split(':'); const topicos = (resto ?? '').split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
    const cor = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'][i % 8];
    if (!topicos.length) return { nome: nome.trim(), cor };
    return { nome: nome.trim(), cor, sub: { metodo: 'linhas', layout: { direcao: 'v', proporcoes: Array(topicos.length).fill(1 / topicos.length) }, filhos: topicos.map((t) => ({ nome: t })) } };
  });
  return { metodo: 'edital', layout: { direcao: 'h', proporcoes: Array(filhos.length).fill(1 / filhos.length) }, filhos };
}
export const leitner = (): EspecDivisao => { const s = colunas([1, 1, 1, 1, 1], ['Caixa 1 · todo dia', 'Caixa 2 · 3 dias', 'Caixa 3 · semana', 'Caixa 4 · quinzena', 'Caixa 5 · mês']); s.filhos.forEach((f, i) => { f.cor = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399'][i]; }); return { ...s, metodo: 'leitner' }; };
export function venn(r: Retangulo, qtd: number): EspecDivisao {
  const { cx, cy, raio } = centroRaio(r); const rr = raio * 0.62;
  if (qtd === 3) {
    const A = elipsePoligono(cx - rr * 0.55, cy - rr * 0.3, rr, rr, 64), B = elipsePoligono(cx + rr * 0.55, cy - rr * 0.3, rr, rr, 64), C = elipsePoligono(cx, cy + rr * 0.6, rr, rr, 64);
    const AB = cliparPoligono(A, B), BC = cliparPoligono(B, C), AC = cliparPoligono(A, C), ABC = cliparPoligono(AB, C);
    return { metodo: 'venn', filhos: [poly('A', A, '#60a5fa'), poly('B', B, '#f472b6'), poly('C', C, '#34d399'), poly('A ∩ B', AB), poly('B ∩ C', BC), poly('A ∩ C', AC), poly('A ∩ B ∩ C', ABC, '#fbbf24')] };
  }
  const A = elipsePoligono(cx - rr * 0.55, cy, rr, rr, 64), B = elipsePoligono(cx + rr * 0.55, cy, rr, rr, 64);
  return { metodo: 'venn', filhos: [poly('A', A, '#60a5fa'), poly('B', B, '#f472b6'), poly('A ∩ B', cliparPoligono(A, B), '#fbbf24')] };
}
export function piramide(r: Retangulo, niveis: number, invertida = false): EspecDivisao {
  const filhos: EspecRegiao[] = [];
  for (let i = 0; i < niveis; i++) {
    const t0 = i / niveis, t1 = (i + 1) / niveis;
    const w0 = r.w * t0, w1 = r.w * t1;
    const y0 = invertida ? r.y + r.h * (1 - t0) : r.y + r.h * t0, y1 = invertida ? r.y + r.h * (1 - t1) : r.y + r.h * t1;
    const cx = r.x + r.w / 2;
    const pts = t0 === 0 ? [{ x: cx, y: y0 }, { x: cx + w1 / 2, y: y1 }, { x: cx - w1 / 2, y: y1 }] : [{ x: cx - w0 / 2, y: y0 }, { x: cx + w0 / 2, y: y0 }, { x: cx + w1 / 2, y: y1 }, { x: cx - w1 / 2, y: y1 }];
    filhos.push(poly(invertida ? `Etapa ${i + 1}` : `Nível ${i + 1}`, pts));
  }
  return { metodo: invertida ? 'funil' : 'piramide', filhos };
}
export function escada(r: Retangulo, degraus: number): EspecDivisao {
  const filhos: EspecRegiao[] = []; const lw = r.w / degraus;
  for (let i = 0; i < degraus; i++) {
    const h = (r.h * (i + 1)) / degraus;
    filhos.push(poly(`Degrau ${i + 1}`, poligonoDoRetangulo({ x: r.x + i * lw, y: r.y + r.h - h, w: lw, h })));
  }
  return { metodo: 'escada', filhos };
}
export function pastasAbas(qtd: number, nomesTxt?: string | number): EspecDivisao {
  const nomes = lerNomes(nomesTxt, qtd, 'Aba');
  return { metodo: 'abas', layout: { direcao: 'v', proporcoes: [0.1, 0.9] }, filhos: [{ nome: 'Abas', sub: { metodo: 'colunas', layout: { direcao: 'h', proporcoes: Array(qtd).fill(1 / qtd) }, filhos: nomes.map((nm, i) => ({ nome: nm, cor: ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'][i % 6] })) } }, { nome: 'Página' }] };
}

/** Interpretação de comandos em português: "3 colunas, a segunda em 2 linhas", "grade 3x4", "pizza 6". */
export function interpretarComando(texto: string, r: Retangulo): EspecDivisao | null {
  const t = texto.toLowerCase().trim();
  const ordinais: Record<string, number> = { primeira: 1, primeiro: 1, segunda: 2, segundo: 2, terceira: 3, terceiro: 3, quarta: 4, quarto: 4, quinta: 5, quinto: 5, sexta: 6, sétima: 7, setima: 7, oitava: 8, última: 99, ultima: 99 };
  let m: RegExpMatchArray | null;
  if ((m = t.match(/grade\s*(\d+)\s*[x×por]+\s*(\d+)/))) return grade(n(m[1], 2, 1, 12), n(m[2], 2, 1, 12));
  if ((m = t.match(/(pizza|fatias?)\s*(\d+)/))) return pizza(r, n(m[2], 6, 2, 24));
  if ((m = t.match(/an[eé]is\s*(\d+)/))) return aneis(r, n(m[1], 3, 2, 10));
  if (/cruz/.test(t)) return grade(2, 2);
  if (/cornell/.test(t)) return cornell();
  if (/kanban|quadro/.test(t)) return kanban();
  if (/leitner/.test(t)) return leitner();
  if (/venn/.test(t)) return venn(r, 2);
  if (/mapa mental/.test(t)) return mapaMental(r, 6);
  if (/diagonal/.test(t)) return diagonal(r, 'desc');
  if (/\bx\b/.test(t) && /em x/.test(t)) return emX(r);
  if ((m = t.match(/pir[âa]mide\s*(\d+)?/))) return piramide(r, n(m[1], 4, 2, 10));
  if ((m = t.match(/funil\s*(\d+)?/))) return piramide(r, n(m[1], 4, 2, 10), true);
  if ((m = t.match(/escada\s*(\d+)?/))) return escada(r, n(m[1], 4, 2, 12));
  if ((m = t.match(/semana/))) return semanaEstudo(3);
  const principal = t.match(/(\d+)\s*(colunas?|linhas?)/);
  if (!principal) return null;
  const qtd = n(principal[1], 2, 1, 24); const ehCol = principal[2].startsWith('col');
  const spec = ehCol ? colunas(Array(qtd).fill(1)) : linhas(Array(qtd).fill(1));
  const re = /(?:a|o)\s+(\w+)\s+em\s+(\d+)\s*(colunas?|linhas?)/g;
  let sub: RegExpExecArray | null;
  while ((sub = re.exec(t))) {
    let idx = ordinais[sub[1]] ?? parseInt(sub[1], 10);
    if (idx === 99) idx = qtd;
    if (!Number.isFinite(idx) || idx < 1 || idx > qtd) continue;
    const q2 = n(sub[2], 2, 1, 24);
    spec.filhos[idx - 1].sub = sub[3].startsWith('col') ? colunas(Array(q2).fill(1)) : linhas(Array(q2).fill(1));
  }
  return spec;
}

/** Surpreenda-me: mistura retas, círculos e polígonos. */
export function surpreendaMe(r: Retangulo): EspecDivisao {
  const sorte = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const base = sorte<() => EspecDivisao>([
    () => grade(2 + Math.floor(Math.random() * 2), 2 + Math.floor(Math.random() * 3)),
    () => pizza(r, 3 + Math.floor(Math.random() * 6)),
    () => faixasInclinadas(r, 3 + Math.floor(Math.random() * 4), Math.random() * 180),
    () => losangoCentral(r),
    () => emX(r),
    () => colunas([1 + Math.random(), 1 + Math.random(), 1 + Math.random()]),
    () => mapaMental(r, 4 + Math.floor(Math.random() * 4)),
    () => piramide(r, 3 + Math.floor(Math.random() * 3), Math.random() > 0.5),
  ])();
  // subdivide um filho aleatório com outro método se for de layout
  if (base.layout && base.filhos.length) {
    const alvo = sorte(base.filhos);
    if (!alvo.sub) alvo.sub = sorte<() => EspecDivisao>([() => linhas([1, 1]), () => colunas([1, 2]), () => grade(2, 2)])();
  }
  return { ...base, metodo: 'surpresa' };
}

// ---------- Catálogo para o diálogo ----------
const P = (chave: string, rotulo: string, padrao: number, min = 1, max = 24): ParamDef => ({ chave, rotulo, tipo: 'numero', padrao, min, max });
const T = (chave: string, rotulo: string, padrao = ''): ParamDef => ({ chave, rotulo, tipo: 'texto', padrao });
export const CATALOGO: EntradaCatalogo[] = [
  // Retas
  { id: 'horizontal', grupo: 'Retas', nome: 'Horizontal', icone: '▬', descricao: 'Duas faixas, uma sobre a outra', params: [T('props', 'Proporções (ex.: 1,1)', '1,1')], gerar: (_r, p) => linhas(lerProporcoes(p.props, 2)) },
  { id: 'vertical', grupo: 'Retas', nome: 'Vertical', icone: '▮▮', descricao: 'Duas colunas lado a lado', params: [T('props', 'Proporções (ex.: 1,1)', '1,1')], gerar: (_r, p) => colunas(lerProporcoes(p.props, 2)) },
  { id: 'cruz', grupo: 'Retas', nome: 'Cruz (4 partes)', icone: '▦', descricao: 'Dois por dois', gerar: () => grade(2, 2) },
  { id: 'grade', grupo: 'Retas', nome: 'Grade', icone: '▦', descricao: 'Linhas × colunas, com tamanhos desiguais', params: [P('linhas', 'Linhas', 3, 1, 12), P('colunas', 'Colunas', 3, 1, 12), T('propL', 'Proporção das linhas', ''), T('propC', 'Proporção das colunas', '')], gerar: (_r, p) => grade(n(p.linhas, 3, 1, 12), n(p.colunas, 3, 1, 12), lerProporcoes(p.propL, n(p.linhas, 3, 1, 12)), lerProporcoes(p.propC, n(p.colunas, 3, 1, 12))) },
  { id: 'qtd-colunas', grupo: 'Retas', nome: 'N colunas', icone: '|||', descricao: 'Por quantidade (ex.: 7 dias)', params: [P('n', 'Quantidade', 7, 1, 24), T('nomes', 'Nomes (separados por vírgula)', '')], gerar: (_r, p) => colunas(Array(n(p.n, 7)).fill(1), lerNomes(p.nomes, n(p.n, 7), 'Coluna')) },
  { id: 'qtd-linhas', grupo: 'Retas', nome: 'N linhas', icone: '☰', descricao: 'Por quantidade', params: [P('n', 'Quantidade', 4, 1, 24), T('nomes', 'Nomes (separados por vírgula)', '')], gerar: (_r, p) => linhas(Array(n(p.n, 4)).fill(1), lerNomes(p.nomes, n(p.n, 4), 'Linha')) },
  { id: 'proporcao', grupo: 'Retas', nome: 'Por proporção', icone: '⅓', descricao: 'Um terço e dois terços, áurea, 70/30', params: [{ chave: 'preset', rotulo: 'Proporção', tipo: 'opcao', padrao: '1,2', opcoes: [{ valor: '1,2', rotulo: '1/3 e 2/3' }, { valor: '2,1', rotulo: '2/3 e 1/3' }, { valor: '1,1.618', rotulo: 'Razão áurea' }, { valor: '7,3', rotulo: '70 e 30' }, { valor: '3,7', rotulo: '30 e 70' }, { valor: '1,2,1', rotulo: '1:2:1' }, { valor: '1,1,1', rotulo: 'Terços' }] }, { chave: 'dir', rotulo: 'Direção', tipo: 'opcao', padrao: 'h', opcoes: [{ valor: 'h', rotulo: 'Colunas' }, { valor: 'v', rotulo: 'Linhas' }] }], gerar: (_r, p) => { const props = String(p.preset).split(',').map(Number); return p.dir === 'v' ? linhas(props) : colunas(props); } },
  // Inclinadas
  { id: 'diagonal', grupo: 'Inclinadas', nome: 'Diagonal', icone: '◩', descricao: 'Dois triângulos', params: [{ chave: 'sentido', rotulo: 'Sentido', tipo: 'opcao', padrao: 'desc', opcoes: [{ valor: 'desc', rotulo: '↘ Descendente' }, { valor: 'asc', rotulo: '↗ Ascendente' }] }], gerar: (r, p) => diagonal(r, String(p.sentido)) },
  { id: 'x', grupo: 'Inclinadas', nome: 'Em X', icone: '✕', descricao: 'Quatro triângulos', gerar: (r) => emX(r) },
  { id: 'ziguezague', grupo: 'Inclinadas', nome: 'Triângulos', icone: '◭', descricao: 'Serra de triângulos', params: [P('n', 'Triângulos', 4, 2, 12)], gerar: (r, p) => zigueZague(r, n(p.n, 4, 2, 12)) },
  { id: 'losango', grupo: 'Inclinadas', nome: 'Losango central', icone: '◇', descricao: 'Centro e quatro cantos', gerar: (r) => losangoCentral(r) },
  { id: 'faixas', grupo: 'Inclinadas', nome: 'Faixas inclinadas', icone: '⫽', descricao: 'Faixas paralelas em qualquer ângulo', params: [P('n', 'Faixas', 4, 2, 16), P('angulo', 'Ângulo (graus)', 30, 0, 180)], gerar: (r, p) => faixasInclinadas(r, n(p.n, 4, 2, 16), Number(p.angulo) || 30) },
  // Circulares
  { id: 'circulo', grupo: 'Circulares', nome: 'Círculo central', icone: '◯', descricao: 'Um círculo dentro da região', params: [P('fator', 'Tamanho (%)', 70, 20, 100)], gerar: (r, p) => circuloCentral(r, (Number(p.fator) || 70) / 100) },
  { id: 'aneis', grupo: 'Circulares', nome: 'Anéis (alvo)', icone: '◎', descricao: 'Anéis concêntricos', params: [P('n', 'Anéis', 3, 2, 10)], gerar: (r, p) => aneis(r, n(p.n, 3, 2, 10)) },
  { id: 'pizza', grupo: 'Circulares', nome: 'Fatias de pizza', icone: '🍕', descricao: 'De 2 a 24 fatias', params: [P('n', 'Fatias', 6, 2, 24), P('inicio', 'Ângulo inicial', -90, -180, 180), T('nomes', 'Nomes', '')], gerar: (r, p) => pizza(r, n(p.n, 6, 2, 24), Number(p.inicio) || -90, p.nomes ? lerNomes(p.nomes, n(p.n, 6, 2, 24), 'Fatia') : undefined) },
  { id: 'meia-lua', grupo: 'Circulares', nome: 'Meia-lua', icone: '◐', descricao: 'Duas metades de um círculo', gerar: (r) => meiaLua(r) },
  { id: 'espiral', grupo: 'Circulares', nome: 'Espiral', icone: '🌀', descricao: 'Passos em espiral', params: [P('voltas', 'Voltas', 2, 1, 4)], gerar: (r, p) => espiral(r, n(p.voltas, 2, 1, 4)) },
  { id: 'relogio', grupo: 'Circulares', nome: 'Relógio (12h)', icone: '🕛', descricao: 'Doze fatias numeradas', gerar: (r) => relogio(r) },
  { id: 'roleta', grupo: 'Circulares', nome: 'Roleta', icone: '🎯', descricao: 'Fatias alternadas', params: [P('n', 'Casas', 8, 2, 24)], gerar: (r, p) => roleta(r, n(p.n, 8, 2, 24)) },
  // Formas prontas
  ...FORMAS_PRONTAS.map((f): EntradaCatalogo => ({ id: `forma-${f}`, grupo: 'Formas prontas', nome: nomeForma(f), icone: '⬠', descricao: 'Região com forma pronta dentro da atual', params: [P('margem', 'Margem (%)', 6, 0, 40)], gerar: (r, p) => formaPronta(r, f, (Number(p.margem) || 0) / 100) })),
  // Modelos de estudo
  { id: 'cornell', grupo: 'Modelos de estudo', nome: 'Método Cornell', icone: '📝', descricao: 'Pistas, anotações e resumo', gerar: () => cornell() },
  { id: 'matriz', grupo: 'Modelos de estudo', nome: 'Matriz 2 × 2', icone: '⊞', descricao: 'Importante/urgente, fácil/difícil, sei/não sei', params: [{ chave: 'tipo', rotulo: 'Tipo', tipo: 'opcao', padrao: 'importante-urgente', opcoes: [{ valor: 'importante-urgente', rotulo: 'Importante × urgente' }, { valor: 'facil-dificil', rotulo: 'Fácil × difícil' }, { valor: 'sei-nao-sei', rotulo: 'Sei × não sei' }] }], gerar: (_r, p) => matriz2x2(String(p.tipo)) },
  { id: 'kanban', grupo: 'Modelos de estudo', nome: 'Quadro de colunas', icone: '📋', descricao: 'A estudar, Estudando, Revisar, Dominado', gerar: () => kanban() },
  { id: 'raias', grupo: 'Modelos de estudo', nome: 'Raias', icone: '🏊', descricao: 'Por disciplina, banca ou semana', params: [P('n', 'Raias', 4, 1, 16), T('nomes', 'Nomes (vírgula)', ''), { chave: 'prefixo', rotulo: 'Tipo', tipo: 'opcao', padrao: 'Disciplina', opcoes: [{ valor: 'Disciplina', rotulo: 'Disciplina' }, { valor: 'Banca', rotulo: 'Banca' }, { valor: 'Semana', rotulo: 'Semana' }] }], gerar: (_r, p) => raias(n(p.n, 4, 1, 16), p.nomes, String(p.prefixo)) },
  { id: 'linha-tempo-h', grupo: 'Modelos de estudo', nome: 'Linha do tempo (horizontal)', icone: '⟶', descricao: 'História, leis por data, prazos', params: [P('n', 'Períodos', 6, 2, 24), T('nomes', 'Nomes', '')], gerar: (_r, p) => linhaDoTempo(n(p.n, 6, 2, 24), 'h', p.nomes) },
  { id: 'linha-tempo-v', grupo: 'Modelos de estudo', nome: 'Linha do tempo (vertical)', icone: '⟱', descricao: 'Períodos de cima para baixo', params: [P('n', 'Períodos', 6, 2, 24), T('nomes', 'Nomes', '')], gerar: (_r, p) => linhaDoTempo(n(p.n, 6, 2, 24), 'v', p.nomes) },
  { id: 'mapa-mental', grupo: 'Modelos de estudo', nome: 'Mapa mental', icone: '🧠', descricao: 'Centro e ramos em volta', params: [P('n', 'Ramos', 6, 2, 12), T('nomes', 'Nomes dos ramos', '')], gerar: (r, p) => mapaMental(r, n(p.n, 6, 2, 12), p.nomes) },
  { id: 'comparativo', grupo: 'Modelos de estudo', nome: 'Comparativo A × B', icone: '⚖️', descricao: 'Critérios nas linhas', params: [P('n', 'Critérios', 4, 1, 12), T('nomes', 'Critérios (vírgula)', '')], gerar: (_r, p) => comparativo(n(p.n, 4, 1, 12), p.nomes) },
  { id: 'semana', grupo: 'Modelos de estudo', nome: 'Semana de estudo', icone: '📅', descricao: '7 dias com blocos de horário', params: [P('blocos', 'Blocos por dia', 3, 1, 6)], gerar: (_r, p) => semanaEstudo(n(p.blocos, 3, 1, 6)) },
  { id: 'edital', grupo: 'Modelos de estudo', nome: 'Mural do edital', icone: '📜', descricao: 'Uma região por disciplina e sub-regiões por tópico', params: [T('texto', 'Uma disciplina por linha: "Nome: tópico 1, tópico 2"', 'Português: Crase, Concordância, Regência\nConstitucional: Direitos fundamentais, Organização do Estado\nAdministrativo: Atos, Licitações, Servidores')], gerar: (_r, p) => muralEdital(String(p.texto)) },
  { id: 'leitner', grupo: 'Modelos de estudo', nome: 'Caixas de Leitner', icone: '🗃️', descricao: 'Cinco caixas de revisão', gerar: () => leitner() },
  { id: 'venn', grupo: 'Modelos de estudo', nome: 'Diagrama de Venn', icone: '◎', descricao: 'Círculos com interseção', params: [{ chave: 'n', rotulo: 'Conjuntos', tipo: 'opcao', padrao: '2', opcoes: [{ valor: '2', rotulo: 'Dois' }, { valor: '3', rotulo: 'Três' }] }], gerar: (r, p) => venn(r, n(p.n, 2, 2, 3)) },
  { id: 'piramide', grupo: 'Modelos de estudo', nome: 'Pirâmide', icone: '🔺', descricao: 'Hierarquia de níveis', params: [P('n', 'Níveis', 4, 2, 10)], gerar: (r, p) => piramide(r, n(p.n, 4, 2, 10)) },
  { id: 'funil', grupo: 'Modelos de estudo', nome: 'Funil', icone: '🔻', descricao: 'Etapas que afunilam', params: [P('n', 'Etapas', 4, 2, 10)], gerar: (r, p) => piramide(r, n(p.n, 4, 2, 10), true) },
  { id: 'escada', grupo: 'Modelos de estudo', nome: 'Escada', icone: '📶', descricao: 'Degraus crescentes', params: [P('n', 'Degraus', 5, 2, 12)], gerar: (r, p) => escada(r, n(p.n, 5, 2, 12)) },
  { id: 'abas', grupo: 'Modelos de estudo', nome: 'Pastas e abas', icone: '🗂️', descricao: 'Abas no topo e uma página', params: [P('n', 'Abas', 4, 2, 10), T('nomes', 'Nomes', '')], gerar: (_r, p) => pastasAbas(n(p.n, 4, 2, 10), p.nomes) },
  // Experimental
  { id: 'surpresa', grupo: 'Experimental', nome: 'Surpreenda-me', icone: '🎲', descricao: 'Mistura retas, círculos e polígonos', gerar: (r) => surpreendaMe(r) },
  { id: 'comando', grupo: 'Experimental', nome: 'Linha de comando', icone: '⌨️', descricao: 'Ex.: "3 colunas, a segunda em 2 linhas", "grade 3x4", "pizza 6"', params: [T('cmd', 'Comando', '3 colunas, a segunda em 2 linhas')], gerar: (r, p) => interpretarComando(String(p.cmd), r) ?? colunas([1, 1, 1]) },
];

export const GRUPOS_CATALOGO = ['Retas', 'Inclinadas', 'Circulares', 'Formas prontas', 'Modelos de estudo', 'Experimental'];
