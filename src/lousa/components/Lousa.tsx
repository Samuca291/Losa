// ============================================================
// LOUSA: câmera, camada do mundo, ferramentas e gestos.
// Um só ouvinte de ponteiro no contêiner (delegação), com
// setPointerCapture, touch-action: none e pointercancel.
// ============================================================
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { LIMITES_ZOOM, ZOOM_SEMANTICO, type Item as TItem, type Ponto, type Regiao, type Retangulo } from '../types';
import {
  agora, aplicarDivisao, arrastarDivisoria, atualizarItens, atualizarItem, avisar, contextoVisibilidade, criarConector, criarItem, criarRegiaoRaiz,
  dentroDaJanela, estadoVisual, excluirItens, finalizarGesto, getEstado, iniciarGesto, moverRegiao, reatribuirRegioes, redimensionarRegiao, regiaoNoPonto,
  selecionar, setCamera, setUI, useEstado, girarGrupo, poligonoRegiao, limparSelecao, colarTextoComoItem, colarComoLink,
  criarPostitEm, conectarCriandoNovo, atualizarConector, iniciarConexaoPendente, concluirConexaoPendente, cancelarConexaoPendente, reconectar,
} from '../store';
import { Conectores, type Rascunho } from './Conectores';
import { calcularRota, calcularRotas, calcularSaltos, rotaParaPonto, TIPOS_SEM_OBSTACULO, type OpcoesRota } from '../utils/conectores';
import { bboxItemGirado, cantosItem, centroItem as centroDe, clamp, normalizarRetangulo, mundoParaTela, luminancia, retangulosIntersectam, rotacionarPonto, telaParaMundo, zoomEmTorno, simplificarPontos, bboxDePontos, uniaoRetangulos, arredondarPara } from '../utils/geometria';
import { poligonoLivre, porLinha, porPolilinha } from '../utils/divisoes';
import { Item } from './Item';
import { Regioes } from './Regioes';
import { criarItemImagem } from '../persistencia';
import { imagemPermitida, pareceUrl } from '../utils/seguranca';

type Gesto =
  | { tipo: 'pan'; ultimo: Ponto }
  | { tipo: 'mover'; ids: string[]; inicio: Ponto; antes: Record<string, TItem>; moveu: boolean; clicouEm: string; modif: boolean }
  | { tipo: 'redimensionar'; id: string; alca: string; antes: TItem }
  | { tipo: 'girar'; ids: string[]; centro: Ponto; angulo0: number; antes: Record<string, TItem> }
  | { tipo: 'marquee'; inicio: Ponto; somar: boolean }
  | { tipo: 'criar'; inicio: Ponto; tipoItem: string }
  | { tipo: 'desenho'; pontos: Ponto[]; marcador: boolean }
  | { tipo: 'conector'; de: string; inicio: Ponto; moveu: boolean }
  | { tipo: 'reconectar'; id: string; extremo: 'de' | 'para'; fixo: string }
  | { tipo: 'divisoria'; regiaoId: string; i: number }
  | { tipo: 'mover-regiao'; id: string; ultimo: Ponto; moveu: boolean }
  | { tipo: 'redim-regiao'; id: string; antes: Retangulo }
  | { tipo: 'laco'; pontos: Ponto[] }
  | { tipo: 'linha'; pontos: Ponto[] }
  | { tipo: 'pinch'; d0: number; c0: Ponto; cam0: { x: number; y: number; zoom: number } }
  | { tipo: 'nada' };

export const ultimoPonteiro: Ponto = { x: typeof window !== 'undefined' ? window.innerWidth / 2 : 640, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 400 };
const ALCAS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);

export function Lousa({ mundoRef }: { mundoRef: RefObject<HTMLDivElement | null> }) {
  const e = useEstado((s) => s);
  const { lousa, ui } = e; const { camera, doc, config, visualizacao: vis } = lousa;
  const ref = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto>({ tipo: 'nada' });
  const ponteiros = useRef<Map<number, Ponto>>(new Map());
  const raf = useRef<number | null>(null);
  const timerLongo = useRef<number | null>(null);
  const sobMouse = useRef<string | null>(null);
  const [mouseMundo, setMouseMundo] = useState<Ponto>({ x: 0, y: 0 });
  const zoomBaixo = camera.zoom < ZOOM_SEMANTICO;
  const exportando = ui.arrastando;

  // ---- Viewport ----
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setUI({ viewport: { w: el.clientWidth, h: el.clientHeight } }));
    ro.observe(el); setUI({ viewport: { w: el.clientWidth, h: el.clientHeight } });
    return () => ro.disconnect();
  }, []);

  // ---- Roda: zoom com Ctrl/Meta (pinch do trackpad chega como ctrlKey), pan no resto ----
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const cam = getEstado().lousa.camera;
      const mult = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1;
      if (ev.ctrlKey || ev.metaKey) {
        const fator = Math.exp(-ev.deltaY * mult * 0.01);
        setCamera(zoomEmTorno(cam, { x: ev.clientX, y: ev.clientY }, clamp(cam.zoom * fator, LIMITES_ZOOM.min, LIMITES_ZOOM.max)));
      } else {
        const dx = ev.shiftKey && !ev.deltaX ? ev.deltaY : ev.deltaX; const dy = ev.shiftKey && !ev.deltaX ? 0 : ev.deltaY;
        setCamera({ ...cam, x: cam.x - dx * mult, y: cam.y - dy * mult });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- Visibilidade / culling ----
  const ctx = useMemo(() => contextoVisibilidade(lousa, ui), [camera, ui.viewport, vis, doc.camadas, doc.regioes, ui.regiaoIsolada]); // eslint-disable-line react-hooks/exhaustive-deps
  const selecaoSet = useMemo(() => new Set(ui.selecao), [ui.selecao]);
  const itensRender = useMemo(() => {
    const out: { it: TItem; esm: boolean }[] = [];
    for (const it of Object.values(doc.itens)) {
      const ev = estadoVisual(it, ctx); if (ev === 'oculto') continue;
      if (!exportando && !selecaoSet.has(it.id) && !dentroDaJanela(it, ctx.janela)) continue;
      out.push({ it, esm: ev === 'esmaecido' });
    }
    return out;
  }, [doc.itens, ctx, exportando, selecaoSet]);
  const contagens = useMemo(() => { const c: Record<string, number> = {}; for (const it of Object.values(doc.itens)) if (it.regiao) c[it.regiao] = (c[it.regiao] ?? 0) + 1; for (const r of Object.values(doc.regioes)) { let s = c[r.id] ?? 0; const pilha = [...r.filhos]; while (pilha.length) { const f = pilha.pop()!; s += c[f] ?? 0; pilha.push(...(doc.regioes[f]?.filhos ?? [])); } c[r.id] = s; } return c; }, [doc.itens, doc.regioes]);
  const conexoes = useMemo(() => { if (!ui.conexoesDe) return null; const s = new Set<string>([ui.conexoesDe]); for (const c of Object.values(doc.conectores)) { if (c.de === ui.conexoesDe) s.add(c.para); if (c.para === ui.conexoesDe) s.add(c.de); } return s; }, [ui.conexoesDe, doc.conectores]);
  const opacidadeCamada = (id: string) => ctx.camadas.get(id)?.opacidade ?? 1;

  // ---- Utilidades de gesto ----
  const mundo = (p: Ponto) => telaParaMundo(p, getEstado().lousa.camera);
  const agendar = (fn: () => void) => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => { raf.current = null; fn(); }); };
  const snap = (v: number) => (getEstado().lousa.config.grade ? arredondarPara(v, getEstado().lousa.config.tamanhoGrade) : v);
  const alvoDe = (t: EventTarget | null) => { const el = t as HTMLElement | null; if (!el?.closest) return {}; return { interativo: el.closest('[data-interativo]'), editando: el.closest('.conteudo.editando, [contenteditable="true"]'), alca: el.closest('[data-alca]') as HTMLElement | null, porta: el.closest('[data-porta]') as HTMLElement | null, extremo: el.closest('[data-extremo]') as HTMLElement | null, alcaRegiao: el.closest('[data-alca-regiao]') as HTMLElement | null, divisoria: el.closest('[data-divisoria]') as HTMLElement | null, rotulo: el.closest('[data-regiao-id]') as HTMLElement | null, conector: el.closest('[data-conector-id]') as HTMLElement | null, item: el.closest('[data-item-id]') as HTMLElement | null }; };

  const concluirPoligono = () => {
    const pts = getEstado().ui.pontosPoligono; setUI({ pontosPoligono: [] });
    if (pts.length < 3) return; criarRegiaoDePontos(pts, false);
  };
  const criarRegiaoDePontos = (pts: Ponto[], suave: boolean) => {
    const bb = bboxDePontos(pts); const centro = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
    const pai = regiaoNoPonto(centro);
    if (pai) aplicarDivisao(pai.id, poligonoLivre(pts, suave), false);
    else { const spec = poligonoLivre(pts, suave); criarRegiaoRaiz(bboxDePontos(spec.filhos[0].pontos!), 'Região livre', spec.filhos[0].pontos!); }
    avisar('Região criada. Dê um nome no painel de regiões.');
    setUI({ ferramenta: 'selecionar' });
  };
  const guiasPara = (ids: string[], prim: TItem, d: Ponto): { dx: number; dy: number; v: number[]; h: number[] } => {
    const cfg = getEstado().lousa.config; if (!cfg.guiasInteligentes) return { dx: 0, dy: 0, v: [], h: [] };
    const lim = 6 / getEstado().lousa.camera.zoom; const bx = { x: prim.x + d.x, y: prim.y + d.y, w: prim.w, h: prim.h };
    const candX = [bx.x, bx.x + bx.w / 2, bx.x + bx.w], candY = [bx.y, bx.y + bx.h / 2, bx.y + bx.h];
    let melhorX: { d: number; g: number } | null = null, melhorY: { d: number; g: number } | null = null; let n = 0;
    for (const { it } of itensRender) { if (ids.includes(it.id)) continue; if (n++ > 400) break;
      const ex = [it.x, it.x + it.w / 2, it.x + it.w], ey = [it.y, it.y + it.h / 2, it.y + it.h];
      for (const a of candX) for (const b of ex) { const dd = b - a; if (Math.abs(dd) < lim && (!melhorX || Math.abs(dd) < Math.abs(melhorX.d))) melhorX = { d: dd, g: b }; }
      for (const a of candY) for (const b of ey) { const dd = b - a; if (Math.abs(dd) < lim && (!melhorY || Math.abs(dd) < Math.abs(melhorY.d))) melhorY = { d: dd, g: b }; } }
    return { dx: melhorX?.d ?? 0, dy: melhorY?.d ?? 0, v: melhorX ? [melhorX.g] : [], h: melhorY ? [melhorY.g] : [] };
  };

  // ---- Pointer down ----
  const onPointerDown = (ev: React.PointerEvent) => {
    const el = ref.current!; const p = { x: ev.clientX, y: ev.clientY }; ultimoPonteiro.x = p.x; ultimoPonteiro.y = p.y;
    setUI({ menuContexto: null });
    ponteiros.current.set(ev.pointerId, p);
    const a = alvoDe(ev.target);
    if (a.interativo || a.editando) return;
    // segundo dedo: pinça
    if (ponteiros.current.size === 2) {
      const [p1, p2] = [...ponteiros.current.values()];
      if (gesto.current.tipo === 'mover' && !gesto.current.moveu) { /* cancela movimento */ }
      gesto.current = { tipo: 'pinch', d0: dist(p1, p2) || 1, c0: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, cam0: getEstado().lousa.camera };
      setUI({ marquee: null, tracoAtual: null });
      return;
    }
    if (ev.button === 2) return; // menu de contexto
    el.setPointerCapture(ev.pointerId);
    const u = getEstado().ui; const ferramenta = u.ferramenta; const pm = mundo(p);
    if (ev.pointerType === 'touch') { if (timerLongo.current) window.clearTimeout(timerLongo.current); timerLongo.current = window.setTimeout(() => { gesto.current = { tipo: 'nada' }; abrirMenu(p, a.item?.dataset.itemId, a.rotulo?.dataset.regiaoId, a.conector?.dataset.conectorId); }, 550); }
    if (ev.button === 1 || u.espacoPressionado || ferramenta === 'mao') { gesto.current = { tipo: 'pan', ultimo: p }; el.classList.add('arrastando-lousa'); return; }
    // Alça na ponta de um conector selecionado → religar a outro item
    if (a.extremo) {
      const cid = a.extremo.dataset.conectorId!; const extremo = a.extremo.dataset.extremo as 'de' | 'para'; const c = getEstado().lousa.doc.conectores[cid];
      if (c) { const fixo = extremo === 'de' ? c.para : c.de; gesto.current = { tipo: 'reconectar', id: cid, extremo, fixo }; setUI({ reconectando: { id: cid, extremo }, conectorRascunho: { de: fixo, ate: pm }, alvoConector: null }); return; }
    }
    // Clique-a-clique: já existe uma origem pendente → este clique escolhe o destino (ou cancela no vazio)
    if (u.conectorPendente) {
      const alvoId = a.item?.dataset.itemId;
      if (alvoId && alvoId !== u.conectorPendente) { concluirConexaoPendente(alvoId); gesto.current = { tipo: 'nada' }; return; }
      if (!alvoId) { cancelarConexaoPendente(); if (!a.porta) { gesto.current = { tipo: 'nada' }; return; } }
    }
    // Porta de conexão (bolinha na borda do item) ou Alt+arrastar sobre um item → começa um conector
    const itemAlt = ev.altKey && a.item?.dataset.itemId;
    if (a.porta || itemAlt) {
      const de = a.porta ? a.porta.dataset.porta! : (itemAlt as string);
      if (getEstado().lousa.doc.itens[de]) { gesto.current = { tipo: 'conector', de, inicio: pm, moveu: false }; setUI({ conectorRascunho: { de, ate: pm }, selecao: [de], editando: null, conectorPendente: null }); return; }
    }
    if (a.alca && u.selecao.length) {
      const alca = a.alca.dataset.alca!; const prim = getEstado().lousa.doc.itens[u.selecao[0]];
      iniciarGesto();
      if (alca === 'girar') { const ids = u.selecao; const itens = ids.map((id) => getEstado().lousa.doc.itens[id]).filter(Boolean); const bb = uniaoRetangulos(itens.map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h }))); const centro = ids.length === 1 ? centroDe(prim) : { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 }; gesto.current = { tipo: 'girar', ids, centro, angulo0: Math.atan2(pm.y - centro.y, pm.x - centro.x), antes: Object.fromEntries(itens.map((i) => [i.id, i])) }; }
      else gesto.current = { tipo: 'redimensionar', id: prim.id, alca, antes: prim };
      return;
    }
    if (a.alcaRegiao) { const id = a.alcaRegiao.dataset.alcaRegiao!; iniciarGesto(); gesto.current = { tipo: 'redim-regiao', id, antes: getEstado().lousa.doc.regioes[id].bbox }; return; }
    if (a.divisoria) { const [rid, i] = a.divisoria.dataset.divisoria!.split(':'); iniciarGesto(); gesto.current = { tipo: 'divisoria', regiaoId: rid, i: Number(i) }; return; }
    if (a.rotulo) { const id = a.rotulo.dataset.regiaoId!; setUI({ regiaoSelecionada: id, selecao: [], conectorSelecionado: null }); const r = getEstado().lousa.doc.regioes[id]; if (!r.travada) { iniciarGesto(); gesto.current = { tipo: 'mover-regiao', id, ultimo: pm, moveu: false }; } return; }
    if (a.conector) { setUI({ conectorSelecionado: a.conector.dataset.conectorId!, selecao: [], regiaoSelecionada: null }); return; }
    const itemId = a.item?.dataset.itemId; const item = itemId ? getEstado().lousa.doc.itens[itemId] : null;
    if (ferramenta === 'borracha') { if (item && item.tipo === 'desenho') excluirItens([item.id], true); gesto.current = { tipo: 'desenho', pontos: [], marcador: false }; (gesto.current as unknown as { apagar: boolean }).apagar = true; return; }
    if (ferramenta === 'conector') { if (item) { gesto.current = { tipo: 'conector', de: item.id, inicio: pm, moveu: false }; setUI({ conectorRascunho: { de: item.id, ate: pm }, selecao: [item.id] }); } return; }
    if (ferramenta === 'desenho' || ferramenta === 'marcador') { iniciarGesto(); gesto.current = { tipo: 'desenho', pontos: [pm], marcador: ferramenta === 'marcador' }; setUI({ tracoAtual: [pm] }); return; }
    if (ferramenta === 'poligono') { setUI((x) => ({ pontosPoligono: [...x.pontosPoligono, pm] })); return; }
    if (ferramenta === 'laco') { gesto.current = { tipo: 'laco', pontos: [pm] }; setUI({ tracoAtual: [pm] }); return; }
    if (ferramenta === 'linha-divisao') { gesto.current = { tipo: 'linha', pontos: [pm] }; setUI({ tracoAtual: [pm] }); return; }
    if (['postit', 'texto', 'caixa', 'titulo', 'forma', 'regiao', 'tarefas', 'cloze'].includes(ferramenta)) { gesto.current = { tipo: 'criar', inicio: pm, tipoItem: ferramenta }; return; }
    // Ferramenta selecionar
    if (item) {
      const modif = ev.shiftKey || ev.ctrlKey || ev.metaKey;
      let sel = u.selecao;
      if (modif) { selecionar([item.id], 'alternar'); sel = getEstado().ui.selecao; }
      else if (!sel.includes(item.id)) { selecionar([item.id]); sel = getEstado().ui.selecao; }
      if (item.travado || (ctx.camadas.get(item.camada)?.travada)) { gesto.current = { tipo: 'nada' }; return; }
      const ids = sel.filter((id) => { const it = getEstado().lousa.doc.itens[id]; return it && !it.travado; });
      iniciarGesto();
      gesto.current = { tipo: 'mover', ids, inicio: pm, antes: Object.fromEntries(ids.map((id) => [id, getEstado().lousa.doc.itens[id]])), moveu: false, clicouEm: item.id, modif };
      return;
    }
    // fundo
    gesto.current = { tipo: 'marquee', inicio: pm, somar: ev.shiftKey || ev.ctrlKey || ev.metaKey };
    if (!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) limparSelecao();
  };

  const abrirMenu = (p: Ponto, itemId?: string, regiaoId?: string, conectorId?: string) => {
    if (itemId) { if (!getEstado().ui.selecao.includes(itemId)) selecionar([itemId]); setUI({ menuContexto: { x: p.x, y: p.y, alvo: 'item', id: itemId } }); }
    else if (regiaoId) setUI({ regiaoSelecionada: regiaoId, menuContexto: { x: p.x, y: p.y, alvo: 'regiao', id: regiaoId } });
    else if (conectorId) setUI({ conectorSelecionado: conectorId, menuContexto: { x: p.x, y: p.y, alvo: 'conector', id: conectorId } });
    else { const r = regiaoNoPonto(mundo(p)); setUI({ menuContexto: { x: p.x, y: p.y, alvo: r ? 'regiao' : 'fundo', id: r?.id }, regiaoSelecionada: r?.id ?? null }); }
  };

  // ---- Pointer move ----
  const onPointerMove = (ev: React.PointerEvent) => {
    const p = { x: ev.clientX, y: ev.clientY }; ultimoPonteiro.x = p.x; ultimoPonteiro.y = p.y;
    if (ponteiros.current.has(ev.pointerId)) ponteiros.current.set(ev.pointerId, p);
    const g = gesto.current; const pm = mundo(p);
    if (timerLongo.current && g.tipo !== 'nada') { const ini = (g as { inicio?: Ponto }).inicio; if (!ini || dist(ini, pm) * getEstado().lousa.camera.zoom > 8) { window.clearTimeout(timerLongo.current); timerLongo.current = null; } }
    if (['poligono', 'linha-divisao', 'laco', 'conector'].includes(ui.ferramenta) || g.tipo === 'nada') setMouseMundo(pm);
    if (g.tipo === 'nada' && ev.pointerType !== 'touch') {
      const a = alvoDe(ev.target); let id = a.porta ? sobMouse.current : (a.item?.dataset.itemId ?? null);
      // tolerância: ao sair do item em direção às bolinhas, mantém as portas visíveis por uma margem
      if (!id && sobMouse.current) { const it = getEstado().lousa.doc.itens[sobMouse.current]; if (it) { const m = 30 / getEstado().lousa.camera.zoom; const bb = bboxItemGirado(it); if (pm.x >= bb.x - m && pm.x <= bb.x + bb.w + m && pm.y >= bb.y - m && pm.y <= bb.y + bb.h + m) id = sobMouse.current; } }
      if (id !== sobMouse.current) { sobMouse.current = id; setUI({ itemSobMouse: id }); }
      const cid = a.conector?.dataset.conectorId ?? null; if (cid !== getEstado().ui.conectorSobMouse) setUI({ conectorSobMouse: cid });
      const pend = getEstado().ui.conectorPendente;
      if (pend) { const alvoId = a.item?.dataset.itemId; agendar(() => setUI({ conectorRascunho: { de: pend, ate: pm }, alvoConector: alvoId && alvoId !== pend ? alvoId : null })); }
    }
    switch (g.tipo) {
      case 'pinch': {
        if (ponteiros.current.size < 2) return; const [p1, p2] = [...ponteiros.current.values()]; const d = dist(p1, p2); const c = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const z = clamp(g.cam0.zoom * (d / g.d0), LIMITES_ZOOM.min, LIMITES_ZOOM.max); const cam = zoomEmTorno(g.cam0, g.c0, z);
        agendar(() => setCamera({ zoom: cam.zoom, x: cam.x + c.x - g.c0.x, y: cam.y + c.y - g.c0.y })); return;
      }
      case 'pan': { const cam = getEstado().lousa.camera; const dx = p.x - g.ultimo.x, dy = p.y - g.ultimo.y; g.ultimo = p; agendar(() => setCamera({ ...getEstado().lousa.camera, x: cam.x + dx, y: cam.y + dy })); return; }
      case 'mover': {
        const d = { x: pm.x - g.inicio.x, y: pm.y - g.inicio.y }; if (!g.moveu && Math.hypot(d.x, d.y) * getEstado().lousa.camera.zoom < 3) return; g.moveu = true;
        agendar(() => {
          const prim = g.antes[g.clicouEm] ?? g.antes[g.ids[0]]; if (!prim) return;
          let dx = d.x, dy = d.y;
          if (getEstado().lousa.config.grade) { dx = snap(prim.x + d.x) - prim.x; dy = snap(prim.y + d.y) - prim.y; }
          const gu = guiasPara(g.ids, prim, { x: dx, y: dy }); dx += gu.dx; dy += gu.dy;
          const regioes = getEstado().lousa.doc.regioes;
          atualizarItens(g.ids, (it) => { const o = g.antes[it.id]; let nx = o.x + dx, ny = o.y + dy; const r = o.regiao ? regioes[o.regiao] : null; if (r?.ima) { nx = clamp(nx, r.bbox.x, r.bbox.x + r.bbox.w - o.w); ny = clamp(ny, r.bbox.y, r.bbox.y + r.bbox.h - o.h); } return { x: nx, y: ny }; }, false);
          setUI({ guias: { v: gu.v, h: gu.h } });
        });
        return;
      }
      case 'redimensionar': {
        agendar(() => {
          const o = g.antes; const c = centroDe(o); const local = rotacionarPonto(pm, c, -o.angulo); // mouse no eixo local do item
          const sx = g.alca.includes('e') ? 1 : g.alca.includes('w') ? -1 : 0, sy = g.alca.includes('s') ? 1 : g.alca.includes('n') ? -1 : 0;
          const minW = o.tipo === 'pino' ? 12 : 40, minH = o.tipo === 'pino' ? 12 : o.tipo === 'fita' ? 12 : 30;
          let w = o.w, h = o.h;
          if (sx === 1) w = Math.max(minW, local.x - o.x); if (sx === -1) w = Math.max(minW, o.x + o.w - local.x);
          if (sy === 1) h = Math.max(minH, local.y - o.y); if (sy === -1) h = Math.max(minH, o.y + o.h - local.y);
          if (ev.shiftKey && sx && sy) { const k = Math.max(w / o.w, h / o.h); w = o.w * k; h = o.h * k; }
          if (getEstado().lousa.config.grade) { w = Math.max(minW, snap(w)); h = Math.max(minH, snap(h)); }
          // âncora: lado/canto oposto fica parado
          const ax = -sx * o.w / 2, ay = -sy * o.h / 2; const A = rotacionarPonto({ x: c.x + ax, y: c.y + ay }, c, o.angulo);
          const nax = -sx * w / 2, nay = -sy * h / 2; const off = rotacionarPonto({ x: nax, y: nay }, { x: 0, y: 0 }, o.angulo);
          const nc = { x: A.x - off.x, y: A.y - off.y };
          atualizarItem(g.id, { x: nc.x - w / 2, y: nc.y - h / 2, w, h, autoAjuste: sy ? false : o.autoAjuste }, false);
        });
        return;
      }
      case 'girar': {
        agendar(() => { const ang = Math.atan2(pm.y - g.centro.y, pm.x - g.centro.x); let delta = ((ang - g.angulo0) * 180) / Math.PI; if (g.ids.length === 1) { const o = g.antes[g.ids[0]]; let novo = o.angulo + delta; if (ev.shiftKey) novo = Math.round(novo / 15) * 15; atualizarItem(g.ids[0], { angulo: ((novo % 360) + 360) % 360 }, false); } else { if (ev.shiftKey) delta = Math.round(delta / 15) * 15; girarGrupo(g.ids, g.centro, delta, g.antes); } });
        return;
      }
      case 'marquee': { agendar(() => setUI({ marquee: normalizarRetangulo(g.inicio, pm) })); return; }
      case 'criar': { agendar(() => setUI({ marquee: normalizarRetangulo(g.inicio, pm) })); return; }
      case 'desenho': {
        if ((g as unknown as { apagar?: boolean }).apagar) { const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null; const it = el?.closest?.('[data-item-id]') as HTMLElement | null; if (it) { const item = getEstado().lousa.doc.itens[it.dataset.itemId!]; if (item?.tipo === 'desenho') excluirItens([item.id], true); } return; }
        g.pontos.push(pm); agendar(() => setUI({ tracoAtual: [...g.pontos] })); return;
      }
      case 'laco': case 'linha': { g.pontos.push(pm); agendar(() => setUI({ tracoAtual: [...g.pontos] })); return; }
      case 'conector': { if (!g.moveu && dist(g.inicio, pm) * getEstado().lousa.camera.zoom > 5) g.moveu = true; const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null; const alvoEl = el?.closest?.('[data-item-id]') as HTMLElement | null; const alvo = alvoEl && alvoEl.dataset.itemId !== g.de ? alvoEl.dataset.itemId! : null; agendar(() => setUI({ conectorRascunho: { de: g.de, ate: pm }, alvoConector: alvo })); return; }
      case 'reconectar': { const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null; const alvoEl = el?.closest?.('[data-item-id]') as HTMLElement | null; const alvo = alvoEl && alvoEl.dataset.itemId !== g.fixo ? alvoEl.dataset.itemId! : null; agendar(() => setUI({ conectorRascunho: { de: g.fixo, ate: pm }, alvoConector: alvo })); return; }
      case 'divisoria': { agendar(() => { const r = getEstado().lousa.doc.regioes[g.regiaoId]; if (r?.layout) arrastarDivisoria(g.regiaoId, g.i, r.layout.direcao === 'h' ? pm.x : pm.y); }); return; }
      case 'mover-regiao': { const dx = pm.x - g.ultimo.x, dy = pm.y - g.ultimo.y; g.ultimo = pm; g.moveu = true; const r = getEstado().lousa.doc.regioes[g.id]; if (r?.pai && r.pai !== null && getEstado().lousa.doc.regioes[r.pai]?.layout) return; agendar(() => moverRegiao(g.id, dx, dy)); return; }
      case 'redim-regiao': { agendar(() => redimensionarRegiao(g.id, { x: g.antes.x, y: g.antes.y, w: snap(pm.x) - g.antes.x, h: snap(pm.y) - g.antes.y })); return; }
    }
  };

  // ---- Pointer up / cancel ----
  const onPointerUp = (ev: React.PointerEvent) => {
    const p = { x: ev.clientX, y: ev.clientY }; const pm = mundo(p); const g = gesto.current;
    ponteiros.current.delete(ev.pointerId);
    if (timerLongo.current) { window.clearTimeout(timerLongo.current); timerLongo.current = null; }
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    ref.current?.classList.remove('arrastando-lousa');
    const u = getEstado().ui; const manterFerramenta = ev.shiftKey;
    gesto.current = { tipo: 'nada' };
    switch (g.tipo) {
      case 'pinch': if (ponteiros.current.size === 1) { const [resto] = [...ponteiros.current.values()]; gesto.current = { tipo: 'pan', ultimo: resto }; } return;
      case 'mover': {
        if (g.moveu) { const d = { x: pm.x - g.inicio.x, y: pm.y - g.inicio.y }; const prim = g.antes[g.clicouEm] ?? g.antes[g.ids[0]]; const gu = guiasPara(g.ids, prim, d); let dx = d.x + gu.dx, dy = d.y + gu.dy; if (getEstado().lousa.config.grade) { dx = snap(prim.x + d.x) - prim.x; dy = snap(prim.y + d.y) - prim.y; } const regioes = getEstado().lousa.doc.regioes; atualizarItens(g.ids, (it) => { const o = g.antes[it.id]; let nx = o.x + dx, ny = o.y + dy; const r = o.regiao ? regioes[o.regiao] : null; if (r?.ima) { nx = clamp(nx, r.bbox.x, r.bbox.x + r.bbox.w - o.w); ny = clamp(ny, r.bbox.y, r.bbox.y + r.bbox.h - o.h); } return { x: nx, y: ny }; }, false); reatribuirRegioes(g.ids); setUI({ guias: { v: [], h: [] }, anuncio: 'Itens movidos' }); }
        else if (!g.modif && u.selecao.length > 1 && !getEstado().lousa.doc.itens[g.clicouEm]?.grupo) selecionar([g.clicouEm]);
        finalizarGesto(); return;
      }
      case 'redimensionar': case 'girar': case 'divisoria': case 'redim-regiao': finalizarGesto(); if (g.tipo === 'redim-regiao') reatribuirRegioes(Object.keys(getEstado().lousa.doc.itens)); return;
      case 'mover-regiao': { if (g.moveu) reatribuirRegioes(Object.keys(getEstado().lousa.doc.itens)); finalizarGesto(); return; }
      case 'marquee': {
        const r = u.marquee; setUI({ marquee: null });
        if (r && r.w * getEstado().lousa.camera.zoom > 4) { const ids = itensRender.filter(({ it, esm }) => !esm && retangulosIntersectam(r, bboxItemGirado(it)) && !it.travado).map(({ it }) => it.id); selecionar(ids, g.somar ? 'adicionar' : 'substituir'); if (ids.length) setUI({ anuncio: `${ids.length} itens selecionados` }); }
        return;
      }
      case 'criar': {
        const r = u.marquee; setUI({ marquee: null }); const arrastou = r && r.w * getEstado().lousa.camera.zoom > 12 && r.h * getEstado().lousa.camera.zoom > 12;
        const pos = arrastou ? { x: r!.x, y: r!.y } : { x: snap(g.inicio.x), y: snap(g.inicio.y) };
        if (g.tipoItem === 'regiao') { const bb = arrastou ? r! : { x: g.inicio.x, y: g.inicio.y, w: 600, h: 400 }; criarRegiaoRaiz(bb, 'Nova região'); setUI({ ferramenta: 'selecionar', dialogo: { tipo: 'dividir', regiaoId: getEstado().ui.regiaoSelecionada } }); return; }
        const tam = arrastou ? { w: r!.w, h: r!.h } : {};
        criarItem({ tipo: g.tipoItem as TItem['tipo'], x: pos.x, y: pos.y, ...tam, forma: g.tipoItem === 'forma' ? u.formaAtual : undefined }, { selecionar: true, editar: ['postit', 'texto', 'caixa', 'titulo', 'cloze', 'forma'].includes(g.tipoItem) });
        if (!manterFerramenta) setUI({ ferramenta: 'selecionar' });
        return;
      }
      case 'desenho': {
        setUI({ tracoAtual: null }); if ((g as unknown as { apagar?: boolean }).apagar) return;
        if (g.pontos.length < 2) { finalizarGesto(); return; }
        const bb = bboxDePontos(g.pontos); const esp = u.espessuraDesenho * (g.marcador ? 5 : 1); const m = esp;
        criarItem({ tipo: 'desenho', x: bb.x - m, y: bb.y - m, w: bb.w + 2 * m, h: bb.h + 2 * m, angulo: 0, cor: 'transparent', camada: 'anotacoes', tracos: [{ pontos: g.pontos.map((q) => ({ x: q.x - bb.x + m, y: q.y - bb.y + m })), cor: g.marcador ? '#facc15' : u.corDesenho, espessura: esp, marcaTexto: g.marcador }] }, { selecionar: false });
        finalizarGesto(); return;
      }
      case 'laco': {
        setUI({ tracoAtual: null }); const pts = simplificarPontos(g.pontos, 8 / getEstado().lousa.camera.zoom); if (pts.length >= 3) criarRegiaoDePontos(pts, true); return;
      }
      case 'linha': {
        setUI({ tracoAtual: null }); const pts = simplificarPontos(g.pontos, 20 / getEstado().lousa.camera.zoom); if (pts.length < 2) return;
        const ini = pts[0], fim = pts[pts.length - 1]; const meio = { x: (ini.x + fim.x) / 2, y: (ini.y + fim.y) / 2 };
        const r = regiaoNoPonto(meio) ?? regiaoNoPonto(ini); if (!r) { avisar('Trace a linha sobre uma região para dividi-la.'); return; }
        const degraus = ev.altKey || pts.length > 3;
        const spec = degraus && !r.pontos ? porPolilinha(r.bbox, pts.map((q) => ({ x: clamp(q.x, r.bbox.x, r.bbox.x + r.bbox.w), y: clamp(q.y, r.bbox.y, r.bbox.y + r.bbox.h) }))) : porLinha(poligonoRegiao(r), ini, fim);
        if (spec.filhos.length === 2) { aplicarDivisao(r.id, spec, !r.filhos.length); avisar('Região dividida pela linha'); } else avisar('A linha precisa atravessar a região.');
        if (!manterFerramenta) setUI({ ferramenta: 'selecionar' }); return;
      }
      case 'reconectar': {
        setUI({ conectorRascunho: null, alvoConector: null, reconectando: null }); const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null; const alvo = el?.closest?.('[data-item-id]') as HTMLElement | null;
        if (alvo && alvo.dataset.itemId && alvo.dataset.itemId !== g.fixo) reconectar(g.id, g.extremo, alvo.dataset.itemId);
        return;
      }
      case 'conector': {
        setUI({ conectorRascunho: null, alvoConector: null }); const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null; const alvo = el?.closest?.('[data-item-id]') as HTMLElement | null;
        const origem = getEstado().lousa.doc.itens[g.de];
        if (!g.moveu && (!alvo || alvo.dataset.itemId === g.de)) { iniciarConexaoPendente(g.de); return; } // clique simples na bolinha: modo clique-a-clique
        if (alvo && alvo.dataset.itemId !== g.de) criarConector(g.de, alvo.dataset.itemId!);
        else if (origem && !alvo) { const c = centroDe(origem); const longe = Math.hypot(pm.x - c.x, pm.y - c.y) > Math.max(origem.w, origem.h) * 0.75 + 24; if (longe) conectarCriandoNovo(g.de, pm); }
        if (u.ferramenta === 'conector' && !manterFerramenta) setUI({ ferramenta: 'selecionar' }); return;
      }
      case 'pan': return;
    }
  };
  const onPointerCancel = (ev: React.PointerEvent) => { ponteiros.current.delete(ev.pointerId); const g = gesto.current; gesto.current = { tipo: 'nada' }; setUI({ marquee: null, tracoAtual: null, conectorRascunho: null, alvoConector: null, reconectando: null, guias: { v: [], h: [] } }); if (['mover', 'redimensionar', 'girar', 'divisoria', 'mover-regiao', 'redim-regiao', 'desenho'].includes(g.tipo)) finalizarGesto(); ref.current?.classList.remove('arrastando-lousa'); };

  // Duplo clique: em um item → editar; no vazio (inclusive dentro de uma região) → criar post-it ali mesmo.
  const onDoubleClick = (ev: React.MouseEvent) => {
    // Com setPointerCapture, o dblclick chega com target = lousa; por isso usamos o elemento real sob o ponteiro.
    const real = document.elementFromPoint(ev.clientX, ev.clientY); const a = alvoDe(real && ref.current?.contains(real) ? real : ev.target);
    if (a.interativo || a.editando || a.alca || a.porta || a.alcaRegiao || a.divisoria) return;
    if (ui.ferramenta === 'poligono') { concluirPoligono(); return; }
    if (a.conector) { const cid = a.conector.dataset.conectorId!; if (doc.conectores[cid]) setUI({ rotuloEditando: cid, conectorSelecionado: cid, selecao: [] }); return; }
    if (a.rotulo) { setUI({ regiaoSelecionada: a.rotulo.dataset.regiaoId!, painel: 'regioes' }); return; }
    const id = a.item?.dataset.itemId; const pm = mundo({ x: ev.clientX, y: ev.clientY });
    if (id) {
      const it = doc.itens[id]; if (!it) return;
      if (it.travado) { avisar('Este item está travado. Destrave em Propriedades para editar.', undefined, 'info', 3000); return; }
      if (['postit', 'texto', 'titulo', 'caixa', 'cloze', 'forma', 'tarefas', 'tabela'].includes(it.tipo)) { setUI({ editando: id, selecao: [id], conectorSelecionado: null, regiaoSelecionada: null, ferramenta: 'selecionar' }); return; }
      if (it.tipo === 'imagem') { setUI({ dialogo: { tipo: 'imagem', id } }); return; }
      if (it.tipo === 'link' && it.url) { window.open(it.url, '_blank', 'noopener,noreferrer'); return; }
      if (it.tipo === 'contador' || it.tipo === 'carimbo' || it.tipo === 'desenho' || it.tipo === 'fita' || it.tipo === 'pino') { setUI({ selecao: [id], painel: 'propriedades' }); return; }
      return;
    }
    const cfg = getEstado().lousa.config;
    if (cfg.duploCliqueCria && ['selecionar', 'mao', 'postit', 'texto'].includes(ui.ferramenta)) {
      criarPostitEm(pm, { tipo: ui.ferramenta === 'texto' ? 'texto' : 'postit', editar: true });
      if (ui.ferramenta !== 'selecionar') setUI({ ferramenta: 'selecionar' });
    }
  };
  const onContextMenu = (ev: React.MouseEvent) => { ev.preventDefault(); const a = alvoDe(ev.target); if (a.editando) return; abrirMenu({ x: ev.clientX, y: ev.clientY }, a.item?.dataset.itemId, a.rotulo?.dataset.regiaoId, a.conector?.dataset.conectorId); };

  // ---- Arrastar e soltar arquivos ----
  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault(); const pm = mundo({ x: ev.clientX, y: ev.clientY }); const arquivos = [...ev.dataTransfer.files]; let i = 0;
    for (const f of arquivos) { const pos = { x: pm.x + i * 30, y: pm.y + i * 30 }; i++; if (imagemPermitida(f)) await criarItemImagem(f, pos); else if (/\.(txt|md|csv)$/i.test(f.name) || f.type.startsWith('text/')) { const t = await f.text(); if (/\.csv$/i.test(f.name) || t.split('\n').length > 1) setUI({ dialogo: { tipo: 'colar', texto: t.slice(0, 200000), html: '', pos } }); else colarTextoComoItem(t, pos); } else avisar(`Arquivo "${f.name}" não é suportado (use imagens PNG/JPEG/WebP/GIF ou textos .txt/.md).`, undefined, 'erro'); }
    if (!arquivos.length) { const uri = ev.dataTransfer.getData('text/uri-list') || ev.dataTransfer.getData('text/plain'); if (uri && pareceUrl(uri)) colarComoLink(uri.trim(), pm); else if (uri) colarTextoComoItem(uri, pm); }
  };

  // ---- Fundo adaptado ao zoom ----
  const fundo = useMemo(() => {
    const t = config.tamanhoGrade * camera.zoom; const tam = t < 8 ? t * Math.ceil(8 / t) : t; const a = config.intensidadeFundo * 0.5; const escuro = luminancia(config.corFundo) < 0.5; const cor = `rgba(${escuro ? '255,255,255' : '31,41,55'},${a})`;
    const pos = `${camera.x % tam}px ${camera.y % tam}px`;
        switch (config.fundo) {
      case 'pontilhado': return { backgroundImage: `radial-gradient(${cor} ${Math.max(1, camera.zoom)}px, transparent ${Math.max(1, camera.zoom)}px)`, backgroundSize: `${tam}px ${tam}px`, backgroundPosition: pos };
      case 'quadriculado': return { backgroundImage: `linear-gradient(${cor} 1px, transparent 1px), linear-gradient(90deg, ${cor} 1px, transparent 1px)`, backgroundSize: `${tam}px ${tam}px`, backgroundPosition: pos };
      case 'pautado': return { backgroundImage: `linear-gradient(${cor} 1px, transparent 1px)`, backgroundSize: `100% ${tam * 1.5}px`, backgroundPosition: `0 ${camera.y % (tam * 1.5)}px` };
      default: return {};
    }
  }, [config, camera, vis.ocultarTudo]);

  const selecaoItens = ui.selecao.map((id) => doc.itens[id]).filter(Boolean);
  const inv = 1 / camera.zoom;
  // ---- Conectores: rotas sanitizadas (âncoras laterais, desvio, saltos, sobreposição) ----
  const opRota = useMemo<OpcoesRota>(() => ({ desviar: config.desviarObstaculos !== false, margem: config.margemDesvio || 18, raio: config.raioCanto ?? 12, saltos: config.saltosLinha !== false }), [config.desviarObstaculos, config.margemDesvio, config.raioCanto, config.saltosLinha]);
  const conectoresVisiveis = vis.mostrarConectores && !vis.ocultarTudo && vis.modo !== 'so-lousa';
  const rotas = useMemo(() => (conectoresVisiveis ? calcularRotas(Object.values(doc.conectores), doc.itens, (it) => estadoVisual(it, ctx) !== 'oculto', opRota) : new Map()), [doc.conectores, doc.itens, ctx, opRota, conectoresVisiveis]);
  const saltos = useMemo(() => (opRota.saltos && rotas.size > 1 ? calcularSaltos([...rotas.values()]) : new Map()), [rotas, opRota.saltos]);
  const rascunho = useMemo<Rascunho | null>(() => {
    const r = ui.conectorRascunho; if (!r) return null; const a = doc.itens[r.de]; if (!a) return null;
    const ba = bboxItemGirado(a); const estilo = config.estiloConector ?? 'curvo'; const cor = config.corConector;
    const alvo = ui.alvoConector ? doc.itens[ui.alvoConector] : null;
    if (alvo) { const obst = itensRender.filter(({ it }) => it.id !== a.id && it.id !== alvo.id && !TIPOS_SEM_OBSTACULO.has(it.tipo)).map(({ it }) => bboxItemGirado(it)); return { pontos: calcularRota('rascunho', estilo, ba, bboxItemGirado(alvo), obst, opRota).pontos, alvo: true, cor }; }
    return { pontos: rotaParaPonto(ba, r.ate, estilo), alvo: false, cor };
  }, [ui.conectorRascunho, ui.alvoConector, doc.itens, config.estiloConector, config.corConector, itensRender, opRota]);
  const propsConectores = { conectores: doc.conectores, rotas, saltos, conectoresAcima: !!config.conectoresAcima, selecionado: ui.conectorSelecionado, sobMouse: ui.conectorSobMouse, recem: ui.conectorRecem, destacados: conexoes, opacidadeCamada, inv, mostrarRotulos: config.rotulosConector !== false, rascunho, reconectando: ui.reconectando, zoomBaixo };
  const tenteSet = ui.tenteLembrar;

  return (
    <div ref={ref} className={`lousa ${ui.arrastando ? 'arrastando' : ''}`} data-ferramenta={ui.ferramenta} style={{ backgroundColor: config.corFundo, ...fundo }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
      onDragOver={(ev) => ev.preventDefault()} onDrop={onDrop} onDragStart={(ev) => ev.preventDefault()} role="application" aria-label="Lousa de estudos. Use as ferramentas da barra ou os atalhos; pressione ? para ajuda." tabIndex={-1}>
      <div ref={mundoRef} className="mundo" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, ['--inv' as string]: inv, ['--opacidade-esmaecer' as string]: vis.opacidadeEsmaecer }}>
        {/* Regiões */}
        <Regioes regioes={doc.regioes} selecionada={ui.regiaoSelecionada} isolada={ui.regiaoIsolada} zoom={camera.zoom} mostrarRotulos={vis.mostrarRotulos && !vis.ocultarTudo} contagens={contagens} mostrar={vis.mostrarRegioes} ocultarTudo={vis.ocultarTudo} />
        {/* Conectores (camada de baixo) */}
        {conectoresVisiveis && <Conectores {...propsConectores} camada="baixo" />}
        {/* Itens */}
        {itensRender.map(({ it, esm }) => (
          <Item key={it.id} item={it} selecionado={selecaoSet.has(it.id)} editando={ui.editando === it.id} esmaecido={esm || (!!conexoes && !conexoes.has(it.id))} zoomBaixo={zoomBaixo} modoProva={vis.modoProva} tenteLembrar={!!tenteSet[it.id]} destaque={ui.destaqueBusca === it.id} opacidadeCamada={opacidadeCamada(it.camada)} conexaoDestacada={!!conexoes && conexoes.has(it.id) && it.id !== ui.conexoesDe} corretor={config.corretorOrtografico} recemCriado={ui.recemCriado === it.id} alvoConector={ui.alvoConector === it.id} />
        ))}
        {/* Conectores por cima (itens sobrepostos, rascunho, opção "acima") */}
        {(conectoresVisiveis || ui.conectorRascunho) && <Conectores {...propsConectores} camada="cima" />}
        {/* Portas de conexão: arraste de uma bolinha até outro item (ou até o vazio para criar um post-it já conectado) */}
        {config.portasConexao && !ui.editando && !vis.ocultarTudo && !ui.conectorRascunho && !ui.conectorPendente && (() => {
          const idPorta = selecaoItens.length === 1 ? selecaoItens[0].id : ui.itemSobMouse; if (!idPorta) return null;
          const it = doc.itens[idPorta]; if (!it || it.travado || ['desenho', 'fita', 'pino'].includes(it.tipo)) return null;
          const off = 14 * inv; const h = it.autoAjuste ? it.h : it.h;
          const portas: { k: string; x: number; y: number }[] = [{ k: 'n', x: it.w / 2, y: -off }, { k: 'e', x: it.w + off, y: h / 2 }, { k: 's', x: it.w / 2, y: h + off }, { k: 'w', x: -off, y: h / 2 }];
          return (
            <div className="portas" data-nao-exportar="1" style={{ transform: `translate(${it.x}px, ${it.y}px) rotate(${it.angulo}deg)`, width: it.w, height: h }}>
              {portas.map((q) => <div key={q.k} className={`porta porta-${q.k}`} data-porta={it.id} style={{ left: q.x, top: q.y }} role="button" aria-label="Arrastar para conectar a outro item" title="Arraste para conectar (solte no vazio para criar um post-it ligado)" />)}
            </div>
          );
        })()}
        {/* Seleção e alças */}
        {selecaoItens.length === 1 && !ui.editando && !vis.ocultarTudo && (() => { const it = selecaoItens[0]; if (it.travado) return null; const topo = -30 * inv; return (
          <div className="alcas" data-nao-exportar="1" style={{ transform: `translate(${it.x}px, ${it.y}px) rotate(${it.angulo}deg)`, width: it.w, height: it.autoAjuste ? it.h : it.h }}>
            {ALCAS.map((a) => { const x = a.includes('e') ? '100%' : a.includes('w') ? '0%' : '50%'; const y = a.includes('s') ? '100%' : a.includes('n') ? '0%' : '50%'; return <div key={a} className={`alca ${a}`} data-alca={a} style={{ left: x, top: y }} role="button" aria-label={`Redimensionar ${a}`} />; })}
            <div className="linha-girar" style={{ top: topo, height: -topo }} />
            <div className="alca girar" data-alca="girar" style={{ left: '50%', top: topo }} role="button" aria-label="Girar item (Shift prende em 15 graus)" title={`${Math.round(it.angulo)}°`} />
          </div>
        ); })()}
        {selecaoItens.length > 1 && !vis.ocultarTudo && (() => { const bb = uniaoRetangulos(selecaoItens.map(bboxItemGirado)); const topo = -30 * inv; return (
          <div className="alcas" data-nao-exportar="1" style={{ transform: `translate(${bb.x}px, ${bb.y}px)`, width: bb.w, height: bb.h, outline: `${1.5 * inv}px dashed var(--selecao)` }}>
            <div className="linha-girar" style={{ top: topo, height: -topo }} />
            <div className="alca girar" data-alca="girar" style={{ left: '50%', top: topo }} role="button" aria-label="Girar seleção" />
          </div>
        ); })()}
        {/* Guias inteligentes */}
        {ui.guias.v.map((x) => <div key={`v${x}`} className="guia" style={{ left: x, top: ctx.janela.y, width: inv, height: ctx.janela.h }} />)}
        {ui.guias.h.map((y) => <div key={`h${y}`} className="guia" style={{ top: y, left: ctx.janela.x, height: inv, width: ctx.janela.w }} />)}
        {ui.marquee && <div className="marquee" style={{ left: ui.marquee.x, top: ui.marquee.y, width: ui.marquee.w, height: ui.marquee.h, borderWidth: inv }} />}
        {/* Traço / laço / linha / polígono em andamento */}
        {(ui.tracoAtual || ui.pontosPoligono.length > 0) && (
          <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1} style={{ pointerEvents: 'none' }} aria-hidden="true">
            {ui.tracoAtual && <polyline points={ui.tracoAtual.map((q) => `${q.x},${q.y}`).join(' ')} fill={ui.ferramenta === 'laco' ? 'rgba(37,99,235,0.1)' : 'none'} stroke={ui.ferramenta === 'marcador' ? '#facc15' : ui.ferramenta === 'desenho' ? ui.corDesenho : 'var(--selecao)'} strokeWidth={ui.ferramenta === 'marcador' ? ui.espessuraDesenho * 5 : ui.ferramenta === 'desenho' ? ui.espessuraDesenho : 2 * inv} strokeOpacity={ui.ferramenta === 'marcador' ? 0.4 : 1} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={ui.ferramenta === 'linha-divisao' ? `${8 * inv} ${5 * inv}` : undefined} />}
            {ui.pontosPoligono.length > 0 && <polyline points={[...ui.pontosPoligono, mouseMundo].map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(37,99,235,0.08)" stroke="var(--selecao)" strokeWidth={2 * inv} strokeDasharray={`${6 * inv} ${4 * inv}`} />}
            {ui.pontosPoligono.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={5 * inv} fill="#fff" stroke="var(--selecao)" strokeWidth={2 * inv} />)}
          </svg>
        )}
      </div>
      {/* Editor inline do rótulo do conector */}
      {ui.rotuloEditando && rotas.get(ui.rotuloEditando) && doc.conectores[ui.rotuloEditando] && <EditorRotulo id={ui.rotuloEditando} pos={mundoParaTela(rotas.get(ui.rotuloEditando)!.meio, camera)} rotulo={doc.conectores[ui.rotuloEditando].rotulo} />}
      {ui.conectorPendente && <div className="ui vidro aviso-flutuante" role="status">Conectando… clique no item de destino · <kbd>Esc</kbd> cancela <button type="button" className="btn !min-h-7 text-xs" onClick={cancelarConexaoPendente}>Cancelar</button></div>}
      {/* Réguas */}
      {vis.reguas && <Reguas camera={camera} vp={ui.viewport} />}
      {/* Minimapa */}
      {vis.minimapa && !vis.modoFoco && ui.mostrarInterface && <Minimapa itens={doc.itens} regioes={doc.regioes} camera={camera} vp={ui.viewport} />}
      {ui.pontosPoligono.length > 0 && <div className="ui absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm">Polígono: clique para adicionar pontos · duplo clique ou Enter conclui · Esc cancela <button type="button" className="btn primario ml-2 !min-h-7 text-xs" onClick={concluirPoligono}>Concluir</button></div>}
    </div>
  );
}

const SUGESTOES_ROTULO = ['exceção de', 'depende de', 'prazo para', 'regra geral', 'cai junto com', 'contrasta com', 'causa', 'consequência', 'exemplo', 'ver também'];
function EditorRotulo({ id, pos, rotulo }: { id: string; pos: Ponto; rotulo: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const concluir = (salvar: boolean) => { const v = ref.current?.value ?? ''; if (salvar) atualizarConector(id, { rotulo: v.trim().slice(0, 60) }); setUI({ rotuloEditando: null }); };
  return (
    <div className="editor-rotulo ui vidro surgir" style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} data-nao-exportar="1">
      <input ref={ref} className="campo !py-1 text-sm" defaultValue={rotulo} placeholder="Rótulo da ligação (ex.: exceção de)" maxLength={60} list="sugestoes-rotulo" aria-label="Rótulo do conector"
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') concluir(true); if (e.key === 'Escape') concluir(false); }} onBlur={() => concluir(true)} />
      <datalist id="sugestoes-rotulo">{SUGESTOES_ROTULO.map((r) => <option key={r} value={r} />)}</datalist>
      <div className="mt-1 flex flex-wrap gap-1">{SUGESTOES_ROTULO.slice(0, 5).map((r) => <button key={r} type="button" className="chip" onMouseDown={(e) => { e.preventDefault(); atualizarConector(id, { rotulo: r }); setUI({ rotuloEditando: null }); }}>{r}</button>)}</div>
    </div>
  );
}

function Reguas({ camera, vp }: { camera: { x: number; y: number; zoom: number }; vp: { w: number; h: number } }) {
  const passoMundo = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((p) => p * camera.zoom >= 60) ?? 5000;
  const ticksX: number[] = []; const ticksY: number[] = [];
  const x0 = Math.floor(-camera.x / camera.zoom / passoMundo) * passoMundo; for (let x = x0; x * camera.zoom + camera.x < vp.w; x += passoMundo) ticksX.push(x);
  const y0 = Math.floor(-camera.y / camera.zoom / passoMundo) * passoMundo; for (let y = y0; y * camera.zoom + camera.y < vp.h; y += passoMundo) ticksY.push(y);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 text-[10px]" aria-hidden="true">
      <div className="absolute left-0 right-0 top-14 h-5 border-b" style={{ background: 'var(--ui-fundo)', borderColor: 'var(--ui-borda)', opacity: 0.9 }}>{ticksX.map((x) => <span key={x} className="absolute top-0 border-l pl-0.5" style={{ left: x * camera.zoom + camera.x, height: '100%', borderColor: 'var(--ui-borda)' }}>{x}</span>)}</div>
      <div className="absolute bottom-0 left-0 top-14 w-6 border-r" style={{ background: 'var(--ui-fundo)', borderColor: 'var(--ui-borda)', opacity: 0.9 }}>{ticksY.map((y) => <span key={y} className="absolute left-0 border-t pl-0.5" style={{ top: y * camera.zoom + camera.y, width: '100%', borderColor: 'var(--ui-borda)' }}>{y}</span>)}</div>
    </div>
  );
}

function Minimapa({ itens, regioes, camera, vp }: { itens: Record<string, TItem>; regioes: Record<string, Regiao>; camera: { x: number; y: number; zoom: number }; vp: { w: number; h: number } }) {
  const W = 200, H = 130;
  const dados = useMemo(() => {
    const caixas = [...Object.values(itens).filter((i) => !i.oculto).map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h, cor: i.cor, tipo: 'i' as const })), ...Object.values(regioes).filter((r) => !r.pai).map((r) => ({ ...r.bbox, cor: r.estilo.cor, tipo: 'r' as const }))];
    const janela = { x: -camera.x / camera.zoom, y: -camera.y / camera.zoom, w: vp.w / camera.zoom, h: vp.h / camera.zoom };
    const u = uniaoRetangulos([...caixas, janela]); const esc = Math.min(W / (u.w || 1), H / (u.h || 1)) * 0.92; const ox = (W - u.w * esc) / 2 - u.x * esc, oy = (H - u.h * esc) / 2 - u.y * esc;
    return { caixas: caixas.slice(0, 4000), janela, esc, ox, oy };
  }, [itens, regioes, camera, vp]);
  const { caixas, janela, esc, ox, oy } = dados;
  const aoClicar = (ev: React.MouseEvent<SVGSVGElement>) => { const r = ev.currentTarget.getBoundingClientRect(); const mx = (ev.clientX - r.left - ox) / esc, my = (ev.clientY - r.top - oy) / esc; setCamera({ ...camera, x: vp.w / 2 - mx * camera.zoom, y: vp.h / 2 - my * camera.zoom }); };
  return (
    <svg className="minimapa ui" width={W} height={H} onClick={aoClicar} role="img" aria-label="Minimapa: clique para navegar" data-nao-exportar="1">
      <rect width={W} height={H} fill="var(--lousa-fundo)" />
      {caixas.map((c, i) => <rect key={i} x={c.x * esc + ox} y={c.y * esc + oy} width={Math.max(1.5, c.w * esc)} height={Math.max(1.5, c.h * esc)} fill={c.tipo === 'r' ? c.cor : c.cor === 'transparent' ? '#94a3b8' : c.cor} fillOpacity={c.tipo === 'r' ? 0.25 : 0.9} stroke={c.tipo === 'r' ? c.cor : 'none'} strokeWidth={0.5} />)}
      <rect x={janela.x * esc + ox} y={janela.y * esc + oy} width={janela.w * esc} height={janela.h * esc} fill="rgba(37,99,235,0.1)" stroke="var(--selecao)" strokeWidth={1.5} />
    </svg>
  );
}

export { cantosItem, agora };
