// ============================================================
// BARRA DE FORMATAÇÃO: flutua acima do item em edição. Agrupada em
// blocos (histórico · estilo · cor · parágrafo · inserir · item).
// Tudo via execCommand/insertHTML para manter o desfazer nativo do
// campo; o HTML resultante sempre passa pelo filtro de segurança
// ao concluir a edição.
// ============================================================
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FONTES, PALETA } from '../types';
import { atualizarItem, avisar, setUI, useLousa, useUI } from '../store';
import { bboxItemGirado } from '../utils/geometria';
import { IcCheck, IcLink } from './Icones';

const CORES_TEXTO = ['#1f2937', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#6b7280', '#ffffff'];
const CORES_REALCE = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#c4b5fd', '#99f6e4', 'transparent'];
const SIMBOLOS = ['✓', '✗', '→', '←', '↔', '⇒', '⚠', '★', '•', '§', '¶', 'ª', 'º', '≠', '≤', '≥', '±', '×', '÷', '∞', '½', '¼', '¾', '€', '©', '®', '™', '°', '…', '—'];
const TAMANHOS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40];

const cmd = (c: string, v?: string) => { try { document.execCommand(c, false, v); } catch { /* */ } };
/** Devolve o foco ao editor depois de usar um controle que rouba foco (select, seletor de cor). */
const focarEditor = () => { const el = document.querySelector<HTMLElement>('.conteudo.editando, [contenteditable="true"]'); el?.focus(); };
const selecaoAtual = () => { const s = window.getSelection(); return s && !s.isCollapsed && s.rangeCount ? s : null; };
/** Envolve a seleção em uma tag com estilo (via insertHTML para entrar no desfazer do campo). */
function envolverSelecao(tag: string, estilo: string): boolean {
  const s = selecaoAtual(); if (!s) { avisar('Selecione um trecho do texto primeiro.'); return false; }
  const r = s.getRangeAt(0); const div = document.createElement('div'); div.appendChild(r.cloneContents());
  const html = `<${tag}${estilo ? ` style="${estilo}"` : ''}>${div.innerHTML}</${tag}>`;
  cmd('insertHTML', html); return true;
}
function transformarTexto(fn: (t: string) => string) {
  const s = selecaoAtual(); if (!s) { avisar('Selecione um trecho do texto primeiro.'); return; }
  cmd('insertText', fn(s.toString()));
}
const capitalizar = (t: string) => t.toLowerCase().replace(/(^|[\s(["'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function B({ c, v, children, rotulo, onClick, ativo, classe = '' }: { c?: string; v?: string; children: ReactNode; rotulo: string; onClick?: () => void; ativo?: boolean; classe?: string }) {
  return <button type="button" className={`btn ${classe}`} title={rotulo} aria-label={rotulo} aria-pressed={ativo} onMouseDown={(e) => e.preventDefault()} onClick={() => (onClick ? onClick() : cmd(c!, v))}>{children}</button>;
}
function Grupo({ children, rotulo }: { children: ReactNode; rotulo: string }) { return <div className="grupo" role="group" aria-label={rotulo}>{children}</div>; }
/** Pequeno popover ancorado em um botão da barra. */
function Pop({ rotulo, icone, children, ativo }: { rotulo: string; icone: ReactNode; children: (fechar: () => void) => ReactNode; ativo?: boolean }) {
  const [aberto, setAberto] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!aberto) return; const f = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f); }, [aberto]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn" title={rotulo} aria-label={rotulo} aria-expanded={aberto} aria-haspopup="true" aria-pressed={ativo} onMouseDown={(e) => e.preventDefault()} onClick={() => setAberto((a) => !a)}>{icone}</button>
      {aberto && <div className="pop ui surgir" onMouseDown={(e) => e.preventDefault()}>{children(() => setAberto(false))}</div>}
    </div>
  );
}

export function BarraFormatacao({ id }: { id: string }) {
  const it = useLousa((l) => l.doc.itens[id]); const camera = useLousa((l) => l.camera); const vp = useUI((u) => u.viewport);
  const ref = useRef<HTMLDivElement>(null);
  const [est, setEst] = useState({ b: false, i: false, u: false, s: false, ul: false, ol: false, sub: false, sup: false, bloco: '', palavras: 0, chars: 0 });
  const [mais] = useState(false);
  useLayoutEffect(() => {
    if (!it) return; const bb = bboxItemGirado(it); const el = ref.current; const w = el?.offsetWidth ?? 560, h = el?.offsetHeight ?? 44;
    const cx = (bb.x + bb.w / 2) * camera.zoom + camera.x; const topoItem = bb.y * camera.zoom + camera.y; const baseItem = (bb.y + bb.h) * camera.zoom + camera.y;
    let top = topoItem - h - 14; let abaixo = false; if (top < 60) { top = baseItem + 14; abaixo = true; } if (top + h > vp.h - 40) { top = 60; abaixo = false; }
    const left = Math.max(8, Math.min(vp.w - w - 8, cx - w / 2));
    // escreve direto no DOM (medição de layout) para não disparar outro render
    if (el) { el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.transform = 'none'; el.classList.toggle('abaixo', abaixo); }
  }, [it?.x, it?.y, it?.w, it?.h, it?.angulo, camera, vp, id, mais]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = () => {
      try {
        const sel = window.getSelection(); const no = sel?.anchorNode; const el = (no?.nodeType === 1 ? (no as HTMLElement) : no?.parentElement) ?? null;
        const bloco = el?.closest('h1,h2,h3,blockquote,pre,p,li')?.tagName.toLowerCase() ?? '';
        const raiz = el?.closest('[contenteditable="true"]') as HTMLElement | null; const texto = raiz?.innerText ?? '';
        setEst({ b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline'), s: document.queryCommandState('strikeThrough'), ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList'), sub: document.queryCommandState('subscript'), sup: document.queryCommandState('superscript'), bloco, palavras: texto.trim() ? texto.trim().split(/\s+/).length : 0, chars: texto.replace(/\s/g, '').length });
      } catch { /* */ }
    };
    f(); document.addEventListener('selectionchange', f); document.addEventListener('input', f, true); return () => { document.removeEventListener('selectionchange', f); document.removeEventListener('input', f, true); };
  }, [id]);
  if (!it) return null;
  const link = () => { const s = selecaoAtual(); if (!s) { avisar('Selecione o texto que vai virar link.'); return; } const url = window.prompt('Endereço (https://…)'); if (!url) return; if (/^https?:\/\//i.test(url.trim())) cmd('createLink', url.trim()); else avisar('Use um endereço começando com http:// ou https://', undefined, 'erro'); };
  const concluir = () => { (document.activeElement as HTMLElement | null)?.blur(); setUI({ editando: null }); };
  const ehTexto = ['postit', 'caixa', 'texto', 'titulo', 'cloze', 'forma'].includes(it.tipo);
  const bloco = (tag: string) => cmd('formatBlock', `<${tag}>`);
  return (
    <div ref={ref} className="barra-formato ui vidro" role="toolbar" aria-label="Formatação do texto" data-nao-exportar="1" style={{ left: '50%', top: 60, transform: 'translateX(-50%)' }} onPointerDown={(e) => e.stopPropagation()}>
      <Grupo rotulo="Histórico">
        <B c="undo" rotulo="Desfazer no texto (Ctrl+Z)">↶</B><B c="redo" rotulo="Refazer no texto (Ctrl+Y)">↷</B>
      </Grupo>
      <Grupo rotulo="Estilo">
        <B c="bold" rotulo="Negrito (Ctrl+B)" ativo={est.b}><b>B</b></B><B c="italic" rotulo="Itálico (Ctrl+I)" ativo={est.i}><i>I</i></B><B c="underline" rotulo="Sublinhado (Ctrl+U)" ativo={est.u}><u>U</u></B><B c="strikeThrough" rotulo="Tachado (Ctrl+Shift+X)" ativo={est.s}><s>S</s></B>
        <B c="subscript" rotulo="Subscrito" ativo={est.sub}>x<sub>2</sub></B><B c="superscript" rotulo="Sobrescrito" ativo={est.sup}>x<sup>2</sup></B>
        <B rotulo="Código em linha" onClick={() => envolverSelecao('code', '')}><code style={{ fontSize: 11 }}>{'</>'}</code></B>
      </Grupo>
      <Grupo rotulo="Cores">
        <Pop rotulo="Cor do texto (seleção)" icone={<span className="icone-cor" style={{ ['--cor' as string]: it.corTexto ?? '#1f2937' }}>A</span>}>
          {(fechar) => <><div className="titulo-menu">Cor do trecho selecionado</div><div className="cores">{CORES_TEXTO.map((c) => <button key={c} type="button" className="cor" style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => { if (selecaoAtual()) { cmd('styleWithCSS', 'true'); cmd('foreColor', c); cmd('styleWithCSS', 'false'); } else atualizarItem(id, { corTexto: c }, false); fechar(); }} />)}<label className="cor livre" title="Cor livre">🎨<input type="color" onChange={(e) => { focarEditor(); if (selecaoAtual()) { cmd('styleWithCSS', 'true'); cmd('foreColor', e.target.value); cmd('styleWithCSS', 'false'); } else atualizarItem(id, { corTexto: e.target.value }, false); }} /></label></div><p className="dica">Sem seleção, muda a cor de todo o item.</p></>}
        </Pop>
        <Pop rotulo="Marca-texto (Ctrl+Shift+H)" icone={<mark style={{ padding: '0 4px', borderRadius: 3 }}>M</mark>}>
          {(fechar) => <><div className="titulo-menu">Realce do trecho</div><div className="cores">{CORES_REALCE.map((c) => <button key={c} type="button" className={`cor ${c === 'transparent' ? 'nenhuma' : ''}`} style={{ background: c === 'transparent' ? undefined : c }} aria-label={c === 'transparent' ? 'Remover realce' : `Realce ${c}`} onClick={() => { if (!selecaoAtual()) { avisar('Selecione um trecho para marcar.'); return; } cmd('styleWithCSS', 'true'); cmd('hiliteColor', c); cmd('styleWithCSS', 'false'); fechar(); }} />)}</div></>}
        </Pop>
      </Grupo>
      <Grupo rotulo="Parágrafo">
        <Pop rotulo="Estilo do parágrafo" icone={<span className="text-xs font-bold">{est.bloco === 'h1' ? 'H1' : est.bloco === 'h2' ? 'H2' : est.bloco === 'h3' ? 'H3' : est.bloco === 'blockquote' ? '❝' : est.bloco === 'pre' ? '{ }' : '¶'}</span>}>
          {(fechar) => <>{[['p', '¶ Texto normal'], ['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3'], ['blockquote', '❝ Citação'], ['pre', '{ } Bloco de código']].map(([t, r]) => <button key={t} type="button" className={`item-menu ${est.bloco === t ? 'ativo' : ''}`} onClick={() => { bloco(t); fechar(); }}><span style={t === 'h1' ? { fontSize: 18, fontWeight: 800 } : t === 'h2' ? { fontSize: 16, fontWeight: 700 } : t === 'h3' ? { fontSize: 14, fontWeight: 700 } : undefined}>{r}</span></button>)}</>}
        </Pop>
        <B c="insertUnorderedList" rotulo="Lista com marcadores (Ctrl+Shift+8)" ativo={est.ul}>•≡</B><B c="insertOrderedList" rotulo="Lista numerada (Ctrl+Shift+7)" ativo={est.ol}>1≡</B>
        <B c="outdent" rotulo="Diminuir recuo (Ctrl+[)">⇤</B><B c="indent" rotulo="Aumentar recuo (Ctrl+])">⇥</B>
        <Pop rotulo="Alinhamento" icone={<span>≡</span>}>
          {(fechar) => <div className="flex gap-1 p-1">{[['justifyLeft', '⯇', 'Esquerda'], ['justifyCenter', '≡', 'Centro'], ['justifyRight', '⯈', 'Direita'], ['justifyFull', '☰', 'Justificar']].map(([c, ic, r]) => <B key={c} c={c} rotulo={r} onClick={() => { cmd(c); fechar(); }}>{ic}</B>)}</div>}
        </Pop>
      </Grupo>
      <Grupo rotulo="Tamanho">
        <B rotulo="Diminuir fonte do item" onClick={() => atualizarItem(id, { tamanhoFonte: Math.max(8, it.tamanhoFonte - 1) }, false)}>A−</B>
        <Pop rotulo="Tamanho da fonte" icone={<span className="w-6 text-center text-xs tabular-nums">{it.tamanhoFonte}</span>}>
          {(fechar) => <><div className="titulo-menu">{selecaoAtual() ? 'Tamanho do trecho' : 'Tamanho do item'}</div><div className="grid grid-cols-5 gap-1 p-1">{TAMANHOS.map((t) => <button key={t} type="button" className="btn contorno !min-w-9 text-xs" onClick={() => { if (selecaoAtual()) envolverSelecao('span', `font-size: ${t}px`); else atualizarItem(id, { tamanhoFonte: t }, false); fechar(); }}>{t}</button>)}</div></>}
        </Pop>
        <B rotulo="Aumentar fonte do item" onClick={() => atualizarItem(id, { tamanhoFonte: Math.min(120, it.tamanhoFonte + 1) }, false)}>A+</B>
        <select className="campo !w-auto !py-0.5 !px-1 text-xs" value={it.fonte} aria-label="Fonte" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { atualizarItem(id, { fonte: e.target.value }, false); focarEditor(); }} onBlur={(e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.barra-formato, [contenteditable="true"]')) focarEditor(); }}>{FONTES.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}</select>
      </Grupo>
      <Grupo rotulo="Inserir">
        <B rotulo="Inserir link (Ctrl+K)" onClick={link}><IcLink width={15} height={15} /></B>
        <Pop rotulo="Mais ferramentas" icone={<span>⋯</span>} ativo={mais}>
          {(fechar) => (
            <div className="flex flex-col gap-1">
              <div className="titulo-menu">Texto</div>
              <div className="flex gap-1 px-1"><B rotulo="MAIÚSCULAS" onClick={() => { transformarTexto((t) => t.toUpperCase()); fechar(); }}>AA</B><B rotulo="minúsculas" onClick={() => { transformarTexto((t) => t.toLowerCase()); fechar(); }}>aa</B><B rotulo="Capitalizar" onClick={() => { transformarTexto(capitalizar); fechar(); }}>Aa</B><B rotulo="Remover link" onClick={() => { cmd('unlink'); fechar(); }}>⛓️‍💥</B><B rotulo="Limpar formatação" onClick={() => { cmd('removeFormat'); cmd('formatBlock', '<p>'); fechar(); }}>⌫</B></div>
              <div className="titulo-menu">Inserir</div>
              <div className="flex flex-wrap gap-1 px-1">
                <B rotulo="Linha horizontal" onClick={() => { cmd('insertHorizontalRule'); fechar(); }}>―</B>
                <B rotulo="Data de hoje" onClick={() => { cmd('insertText', new Date().toLocaleDateString('pt-BR')); fechar(); }}>📅</B>
                <B rotulo="Caixa de seleção (texto)" onClick={() => { cmd('insertText', '☐ '); fechar(); }}>☐</B>
                <B rotulo="Transformar seleção em lacuna {{…}} (para itens de lacunas e autoteste)" onClick={() => { const s = selecaoAtual(); if (!s) { avisar('Selecione a palavra que será a lacuna.'); return; } cmd('insertText', `{{${s.toString()}}}`); fechar(); }}>⬚</B>
              </div>
              <div className="titulo-menu">Símbolos</div>
              <div className="grid grid-cols-10 gap-0.5 px-1 pb-1">{SIMBOLOS.map((s) => <button key={s} type="button" className="btn !min-w-7 !min-h-7 !p-0 text-sm" aria-label={`Inserir ${s}`} onClick={() => cmd('insertText', s)}>{s}</button>)}</div>
            </div>
          )}
        </Pop>
      </Grupo>
      {ehTexto && it.tipo !== 'texto' && it.tipo !== 'titulo' && (
        <Grupo rotulo="Cor do item">
          <Pop rotulo="Cor do post-it" icone={<span className="inline-block h-4 w-4 rounded-full border" style={{ background: it.cor === 'transparent' ? 'transparent' : it.cor }} />}>
            {(fechar) => <><div className="titulo-menu">Cor do fundo</div><div className="cores">{PALETA.map((c) => <button key={c.cor} type="button" className="cor" style={{ background: c.cor, outline: it.cor === c.cor ? '2px solid var(--selecao)' : undefined, outlineOffset: 1 }} aria-label={`Fundo ${c.nome}`} onClick={() => { atualizarItem(id, { cor: c.cor }, false); fechar(); }} />)}</div></>}
          </Pop>
        </Grupo>
      )}
      <span className="contador" title="Palavras · caracteres">{est.palavras}p · {est.chars}c</span>
      <button type="button" className="btn primario !min-h-7 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={concluir} title="Concluir (Esc ou Ctrl+Enter)"><IcCheck width={14} height={14} /> Concluir</button>
    </div>
  );
}
