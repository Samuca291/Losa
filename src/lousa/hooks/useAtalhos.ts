// ============================================================
// ATALHOS DE TECLADO E ÁREA DE TRANSFERÊNCIA
// Letras só valem fora de campos de texto; nunca capturamos
// combinações do navegador (Ctrl+W, Ctrl+T, Ctrl+R…).
// ============================================================
import { useEffect, type RefObject } from 'react';
import {
  agrupar, alternarOcultarTudo, aplicarDivisao, atualizarItens, avisar, colarComoLink, colarTextoComoItem, criarItem, criarRegiaoRaiz, desagrupar, desfazer, duplicarItens,
  excluirConector, excluirItens, getEstado, girarPor, limparSelecao, moverPor, novoItem, proximoZ, reatribuirRegioes, refazer, regiaoNoPonto, removerRegiao, selecionar,
  setCamera, setDoc, setUI, setVisualizacao, verTudo, voltarInicio, zoomPara, textoDoItem, type Ferramenta,
} from '../store';
import { telaParaMundo, bboxDePontos } from '../utils/geometria';
import { poligonoLivre } from '../utils/divisoes';
import { imagemPermitida, pareceUrl, temMarcadores, validarItem } from '../utils/seguranca';
import { criarItemImagem } from '../persistencia';
import { ultimoPonteiro } from '../components/Lousa';
import type { Item } from '../types';

const TIPO_INTERNO = 'text/x-lousa-itens';
const emCampo = () => { const el = document.activeElement as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); };

export function useAtalhos(_mundoRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const posColar = () => { const { camera } = getEstado().lousa; const vp = getEstado().ui.viewport; const dentro = ultimoPonteiro.x > 0 && ultimoPonteiro.x < vp.w && ultimoPonteiro.y > 56 && ultimoPonteiro.y < vp.h - 56; return telaParaMundo(dentro ? ultimoPonteiro : { x: vp.w / 2, y: vp.h / 2 }, camera); };
    const concluirPoligono = () => { const pts = getEstado().ui.pontosPoligono; setUI({ pontosPoligono: [] }); if (pts.length < 3) return; const bb = bboxDePontos(pts); const pai = regiaoNoPonto({ x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 }); if (pai) aplicarDivisao(pai.id, poligonoLivre(pts), false); else criarRegiaoRaiz(bb, 'Região livre', pts); setUI({ ferramenta: 'selecionar' }); };

    const onKeyDown = (e: KeyboardEvent) => {
      const u = getEstado().ui; const l = getEstado().lousa; const sel = u.selecao;
      if (e.key === ' ' && !emCampo() && !u.dialogo) { if (!u.espacoPressionado) setUI({ espacoPressionado: true }); e.preventDefault(); return; }
      if (e.key === 'Escape') {
        if (u.dialogo || u.menuContexto) { setUI({ menuContexto: null }); return; }
        if (u.rotuloEditando) { setUI({ rotuloEditando: null }); return; }
        if (u.conectorPendente || u.reconectando) { setUI({ conectorPendente: null, reconectando: null, conectorRascunho: null, alvoConector: null }); return; }
        if (u.editando) { (document.activeElement as HTMLElement | null)?.blur(); setUI({ editando: null }); return; }
        if (u.pontosPoligono.length) { setUI({ pontosPoligono: [] }); return; }
        if (u.ferramenta !== 'selecionar') { setUI({ ferramenta: 'selecionar' }); return; }
        if (u.conexoesDe) { setUI({ conexoesDe: null }); return; }
        if (u.regiaoIsolada) { setUI({ regiaoIsolada: null }); return; }
        if (l.visualizacao.modoFoco) { setVisualizacao({ modoFoco: false }); return; }
        if (u.painel) { setUI({ painel: null }); return; }
        limparSelecao(); return;
      }
      if (emCampo() || u.dialogo) return;
      const ctrl = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if (ctrl) {
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
        if (k === 'y') { e.preventDefault(); refazer(); return; }
        if (k === 'a') { e.preventDefault(); selecionar(Object.values(l.doc.itens).filter((i) => !i.oculto).map((i) => i.id)); return; }
        if (k === 'd') { e.preventDefault(); duplicarItens(sel); return; }
        if (k === 'g') { e.preventDefault(); if (e.shiftKey) desagrupar(sel); else agrupar(sel); return; }
        if (k === 'k') { e.preventDefault(); setUI({ dialogo: { tipo: 'paleta' } }); return; }
        if (k === '0') { e.preventDefault(); zoomPara(1); return; }
        if (k === '=' || k === '+') { e.preventDefault(); zoomPara(l.camera.zoom * 1.2); return; }
        if (k === '-') { e.preventDefault(); zoomPara(l.camera.zoom / 1.2); return; }
        if (k === 'f') { e.preventDefault(); setUI({ painel: 'busca' }); return; }
        return; // demais combinações ficam com o navegador (Ctrl+W, Ctrl+T, Ctrl+R…)
      }
      if (e.altKey && sel.length && e.key.startsWith('Arrow')) { e.preventDefault(); const p = e.shiftKey ? 10 : 2; atualizarItens(sel, (it) => ({ w: Math.max(40, it.w + (e.key === 'ArrowRight' ? p : e.key === 'ArrowLeft' ? -p : 0)), h: Math.max(30, it.h + (e.key === 'ArrowDown' ? p : e.key === 'ArrowUp' ? -p : 0)), autoAjuste: false })); return; }
      if (e.key.startsWith('Arrow')) {
        const p = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowRight' ? p : e.key === 'ArrowLeft' ? -p : 0; const dy = e.key === 'ArrowDown' ? p : e.key === 'ArrowUp' ? -p : 0;
        e.preventDefault();
        if (sel.length) moverPor(sel, dx, dy);
        else if (u.regiaoSelecionada) import('../store').then((s) => { s.moverRegiao(u.regiaoSelecionada!, dx * 5, dy * 5, true); s.reatribuirRegioes(Object.keys(getEstado().lousa.doc.itens)); });
        else setCamera({ ...l.camera, x: l.camera.x - dx * 40, y: l.camera.y - dy * 40 });
        return;
      }
      switch (e.key) {
        case 'Delete': case 'Backspace': e.preventDefault(); if (sel.length) excluirItens(sel); else if (u.conectorSelecionado) excluirConector(u.conectorSelecionado); else if (u.regiaoSelecionada) removerRegiao(u.regiaoSelecionada, true); return;
        case 'Enter': { e.preventDefault(); if (u.pontosPoligono.length) { concluirPoligono(); return; } if (sel.length === 1) { const it = l.doc.itens[sel[0]]; if (it && !it.travado) setUI({ editando: it.id }); } else if (u.regiaoSelecionada) setUI({ painel: 'regioes' }); return; }
        case 'Tab': { if (sel.length === 1) { e.preventDefault(); const it = l.doc.itens[sel[0]]; if (it) criarItem({ tipo: it.tipo === 'postit' || it.tipo === 'caixa' || it.tipo === 'texto' ? it.tipo : 'postit', x: it.x + it.w + 24, y: it.y, w: it.w, h: it.h, cor: it.cor, etiquetas: it.etiquetas, fonte: it.fonte, tamanhoFonte: it.tamanhoFonte }, { selecionar: true, editar: true }); } return; }
        case '[': girarPor(sel, -15); return; case ']': girarPor(sel, 15); return;
        case '+': case '=': zoomPara(l.camera.zoom * 1.2); return; case '-': zoomPara(l.camera.zoom / 1.2); return;
        case '?': setUI({ dialogo: { tipo: 'ajuda' } }); return;
        case '/': e.preventDefault(); setUI({ painel: 'busca' }); return;
      }
      if (e.shiftKey && e.code === 'Digit1') { verTudo(); return; }
      if (e.shiftKey && e.code === 'Digit0') { voltarInicio(); return; }
      if (e.shiftKey && k === 'f') { setVisualizacao({ modoFoco: !l.visualizacao.modoFoco }); return; }
      if (e.shiftKey && k === 'p') { setVisualizacao({ modoProva: !l.visualizacao.modoProva }); avisar(l.visualizacao.modoProva ? 'Modo prova desligado' : 'Modo prova: respostas e versos ficam cobertos'); return; }
      if (e.shiftKey && k === 'd') { setUI({ ferramenta: 'marcador' }); return; }
      if (k === 'l' && !e.shiftKey && sel.length > 1) { import('../store').then((s) => s.conectarSelecionados(sel)); return; }
      if (k === 'l' && !e.shiftKey && sel.length === 1) { import('../store').then((s) => s.iniciarConexaoPendente(sel[0])); return; }
      if (e.key === 'F2' && u.conectorSelecionado) { e.preventDefault(); setUI({ rotuloEditando: u.conectorSelecionado }); return; }
      const ferramentas: Record<string, Ferramenta> = { v: 'selecionar', m: 'mao', n: 'postit', t: 'texto', d: 'desenho', e: 'borracha', c: 'conector', s: 'forma', r: 'regiao' };
      if (!e.shiftKey && ferramentas[k]) { setUI({ ferramenta: ferramentas[k], pontosPoligono: [] }); return; }
      if (k === 'h' && !e.shiftKey) { alternarOcultarTudo(); return; }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') setUI({ espacoPressionado: false }); };

    const onCopy = (e: ClipboardEvent, cortar = false) => {
      if (emCampo()) return; const { selecao } = getEstado().ui; if (!selecao.length) return;
      const itens = selecao.map((id) => getEstado().lousa.doc.itens[id]).filter(Boolean); if (!itens.length) return;
      e.preventDefault();
      e.clipboardData?.setData(TIPO_INTERNO, JSON.stringify(itens));
      e.clipboardData?.setData('text/plain', itens.map((i) => `${i.titulo ? i.titulo + ': ' : ''}${textoDoItem(i)}`).join('\n\n'));
      if (cortar) excluirItens(selecao, true); else avisar(`${itens.length} item(ns) copiado(s)`);
    };
    const onPaste = async (e: ClipboardEvent) => {
      if (emCampo() || getEstado().ui.dialogo) return; const cd = e.clipboardData; if (!cd) return;
      e.preventDefault(); const pos = posColar();
      const interno = cd.getData(TIPO_INTERNO);
      if (interno) {
        try {
          const brutos = JSON.parse(interno); if (!Array.isArray(brutos)) throw new Error();
          const validos = brutos.map(validarItem).filter(Boolean) as Item[]; if (!validos.length) return;
          const bb = bboxDePontos(validos.flatMap((i) => [{ x: i.x, y: i.y }, { x: i.x + i.w, y: i.y + i.h }]));
          const novos = validos.map((i) => novoItem({ ...i, id: undefined, x: pos.x + (i.x - bb.x), y: pos.y + (i.y - bb.y), regiao: null, travado: false }));
          setDoc((d) => { const itens = { ...d.itens }; let z = proximoZ(itens); for (const n of novos) { n.z = z++; itens[n.id] = n; } return { ...d, itens }; });
          reatribuirRegioes(novos.map((n) => n.id)); setUI({ selecao: novos.map((n) => n.id) }); avisar(`${novos.length} item(ns) colado(s)`);
        } catch { avisar('Não foi possível colar os itens.', undefined, 'erro'); }
        return;
      }
      for (const f of [...cd.files]) { if (imagemPermitida(f)) { await criarItemImagem(f, pos); return; } }
      const txt = cd.getData('text/plain'); const html = cd.getData('text/html');
      if (!txt.trim() && !html) return;
      if (pareceUrl(txt)) { colarComoLink(txt.trim(), pos); return; }
      const linhas = txt.split(/\r?\n/).filter((x) => x.trim());
      if (linhas.length > 1 || temMarcadores(txt) || (html && /<(ul|ol|table|h[1-4])/i.test(html))) { setUI({ dialogo: { tipo: 'colar', texto: txt.slice(0, 200000), html: html.slice(0, 500000), pos } }); return; }
      colarTextoComoItem(txt, pos);
    };
    const onCut = (e: ClipboardEvent) => onCopy(e, true);
    const onCopyPlain = (e: ClipboardEvent) => onCopy(e, false);
    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
    document.addEventListener('copy', onCopyPlain); document.addEventListener('cut', onCut); document.addEventListener('paste', onPaste);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('copy', onCopyPlain); document.removeEventListener('cut', onCut); document.removeEventListener('paste', onPaste); };
  }, []);
}
