// ============================================================
// ITEM: renderização de cada tipo. Posicionado com transform.
// O editor NÃO é re-renderizado enquanto tem foco (cursor não pula).
// ============================================================
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { FONTES, ROTULOS_STATUS, type Item as TItem } from '../types';
import { atualizarItem, criarItem, finalizarGesto, iniciarGesto, setUI, getEstado, avisar } from '../store';
import { sanitizarHtml, textoParaHtml } from '../utils/seguranca';
import { corTextoPara, formaPronta, caminhoSvg } from '../utils/geometria';
import { urlDaImagem } from '../utils/db';

const ICONE_STATUS: Record<string, string> = { 'nao-visto': '○', estudando: '◐', revisar: '↻', dominado: '●' };
const fonteCss = (nome: string) => FONTES.find((f) => f.nome === nome)?.css ?? FONTES[0].css;
const ehTransparente = (c: string) => c === 'transparent' || c === '';

export interface PropsItem {
  item: TItem; selecionado: boolean; editando: boolean; esmaecido: boolean; zoomBaixo: boolean; modoProva: boolean;
  tenteLembrar: boolean; destaque: boolean; opacidadeCamada: number; conexaoDestacada: boolean; corretor: boolean;
  recemCriado?: boolean; alvoConector?: boolean;
}

let shiftPressionado = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftPressionado = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftPressionado = false; });
}

const exec = (c: string, v?: string) => { try { document.execCommand(c, false, v); } catch { /* */ } };
/** "- ", "1. ", "# ", "## ", "> " no início de um bloco viram lista/título/citação (como no Notion). */
function atalhoMarkdown(raiz: HTMLElement): boolean {
  if (!getEstado().lousa.config.atalhosMarkdown) return false;
  const s = window.getSelection(); if (!s || !s.isCollapsed || !s.anchorNode || !raiz.contains(s.anchorNode)) return false;
  const r = s.getRangeAt(0); let bloco: Node = s.anchorNode; while (bloco.parentNode && bloco.parentNode !== raiz) bloco = bloco.parentNode;
  const pre = document.createRange(); pre.setStart(bloco === raiz ? raiz : bloco, 0); pre.setEnd(r.startContainer, r.startOffset);
  const texto = pre.toString().replace(/\u00a0/g, ' ');
  const m = /^(?:(-|\*|•)|(1\.|1\))|(#{1,3})|(>)|(\[\]))$/.exec(texto); if (!m) return false;
  const el = bloco.nodeType === 1 ? (bloco as HTMLElement) : null; if (el && /^(LI|UL|OL)$/.test(el.tagName)) return false;
  pre.deleteContents();
  if (m[1]) exec('insertUnorderedList'); else if (m[2]) exec('insertOrderedList'); else if (m[3]) exec('formatBlock', `<h${m[3].length}>`); else if (m[4]) exec('formatBlock', '<blockquote>'); else if (m[5]) exec('insertText', '☐ ');
  return true;
}
const marcarVazio = (el: HTMLElement) => { const vazio = !el.textContent?.trim() && !el.querySelector('hr,ul,ol,img'); el.classList.toggle('vazio', vazio); };

function colocarCursorNoFim(el: HTMLElement) {
  const sel = window.getSelection(); if (!sel) return; const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
}

/** Editor de texto rico com contenteditable, uncontrolled enquanto focado. */
export function EditavelRico({ html, editando, aoConcluir, aoMudar, placeholder, className, style, corretor, aoTab }: { html: string; editando: boolean; aoConcluir: (html: string) => void; aoMudar?: (html: string) => void; placeholder?: string; className?: string; style?: CSSProperties; corretor?: boolean; aoTab?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const temporizador = useRef<number | null>(null);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; if (document.activeElement !== el && el.innerHTML !== html) el.innerHTML = html; marcarVazio(el); });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (editando && document.activeElement !== el) { el.focus(); colocarCursorNoFim(el); iniciarGesto(); }
  }, [editando]);
  const concluir = () => { const el = ref.current; if (!el) return; if (temporizador.current) window.clearTimeout(temporizador.current); aoConcluir(sanitizarHtml(el.innerHTML)); finalizarGesto(); };
  // Se a edição terminar por fora (Esc, clique na lousa, outra seleção), garante que o último texto seja salvo.
  const editandoAntes = useRef(editando);
  useEffect(() => { if (editandoAntes.current && !editando) { const el = ref.current; if (el) { if (temporizador.current) window.clearTimeout(temporizador.current); const limpo = sanitizarHtml(el.innerHTML); if (limpo !== html) aoConcluir(limpo); finalizarGesto(); } } editandoAntes.current = editando; }, [editando]); // eslint-disable-line react-hooks/exhaustive-deps
  const [transborda, setTransborda] = useState(false);
  useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return; const medir = () => setTransborda(!editando && el.scrollHeight > el.clientHeight + 2); medir(); const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect(); }, [html, editando]);
  return (
    <div
      ref={ref}
      className={`conteudo ${editando ? 'editando' : ''} ${transborda ? 'transborda' : ''} ${className ?? ''}`}
      style={style}
      contentEditable={editando}
      suppressContentEditableWarning
      spellCheck={corretor !== false}
      data-placeholder={placeholder ?? 'Escreva aqui…'}
      role={editando ? 'textbox' : undefined}
      aria-multiline={editando ? true : undefined}
      onInput={() => { const el = ref.current; if (el) marcarVazio(el); if (temporizador.current) window.clearTimeout(temporizador.current); temporizador.current = window.setTimeout(() => { const el2 = ref.current; if (el2 && aoMudar) aoMudar(sanitizarHtml(el2.innerHTML)); }, 700); }}
      onBlur={(e) => { const rt = e.relatedTarget as HTMLElement | null; if (rt?.closest?.('.barra-formato')) return; concluir(); setUI((u) => (u.editando ? { editando: null } : {})); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const url = window.prompt('Endereço do link (https://…)'); if (url && /^https?:\/\//i.test(url.trim())) document.execCommand('createLink', false, url.trim()); }
        if (e.key === 'Tab' && aoTab) { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); aoTab(); }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { e.preventDefault(); document.execCommand('underline'); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); exec('strikeThrough'); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '8' || e.key === '*')) { e.preventDefault(); exec('insertUnorderedList'); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '7' || e.key === '&')) { e.preventDefault(); exec('insertOrderedList'); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); exec('styleWithCSS', 'true'); exec('hiliteColor', '#fde047'); exec('styleWithCSS', 'false'); }
        if ((e.ctrlKey || e.metaKey) && e.key === ']') { e.preventDefault(); exec('indent'); }
        if ((e.ctrlKey || e.metaKey) && e.key === '[') { e.preventDefault(); exec('outdent'); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); const s = window.getSelection(); if (s && !s.isCollapsed) exec('insertText', `{{${s.toString()}}}`); else avisar('Selecione a palavra que vira lacuna.'); }
        if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) { const el = e.currentTarget as HTMLElement; if (atalhoMarkdown(el)) { e.preventDefault(); marcarVazio(el); } }
      }}
      onPaste={(e) => {
        // Colar DENTRO do texto: texto puro por padrão; com Shift mantém formatação básica depois do filtro.
        e.preventDefault(); e.stopPropagation();
        const htmlColado = e.clipboardData.getData('text/html'); const txt = e.clipboardData.getData('text/plain');
        if (htmlColado && (shiftPressionado || getEstado().ui.espacoPressionado)) document.execCommand('insertHTML', false, sanitizarHtml(htmlColado));
        else document.execCommand('insertText', false, txt.slice(0, 20000));
      }}
      onPointerDown={(e) => { if (editando) e.stopPropagation(); }}
      onDoubleClick={(e) => { if (editando) e.stopPropagation(); }}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}

function Lacunas({ html, modoProva }: { html: string; modoProva: boolean }) {
  const [abertas, setAbertas] = useState<Record<number, boolean>>({});
  useEffect(() => { if (modoProva) setAbertas({}); }, [modoProva]);
  const div = document.createElement('div'); div.innerHTML = sanitizarHtml(html); const texto = div.textContent ?? '';
  const partes = texto.split(/(\{\{[^}]*\}\})/g);
  let idx = 0;
  return (
    <div className="conteudo" style={{ userSelect: 'none' }}>
      {partes.map((p, i) => {
        if (/^\{\{.*\}\}$/.test(p)) { const k = idx++; const aberta = !!abertas[k]; const t = p.slice(2, -2); return <span key={i} role="button" tabIndex={0} aria-label={aberta ? `Lacuna: ${t}` : 'Lacuna oculta, clique para revelar'} className={`lacuna ${aberta ? 'aberta' : ''}`} data-interativo="1" onClick={(e) => { e.stopPropagation(); setAbertas((a) => ({ ...a, [k]: !a[k] })); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbertas((a) => ({ ...a, [k]: !a[k] })); } }}>{t}</span>; }
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

function Imagem({ item }: { item: TItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let vivo = true; if (item.imagemId) urlDaImagem(item.imagemId).then((u) => { if (vivo) setUrl(u); }); return () => { vivo = false; }; }, [item.imagemId]);
  const r = item.recorte;
  const clip = r ? `inset(${r.y * 100}% ${(1 - r.x - r.w) * 100}% ${(1 - r.y - r.h) * 100}% ${r.x * 100}%)` : undefined;
  return url ? <img src={url} alt={item.titulo || 'Imagem'} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', opacity: item.opacidade ?? 1, clipPath: clip, pointerEvents: 'none', borderRadius: 6 }} />
    : <div className="flex h-full w-full items-center justify-center text-xs opacity-60" style={{ background: 'rgba(0,0,0,0.06)' }}>Imagem indisponível</div>;
}

function Desenho({ item }: { item: TItem }) {
  return (
    <svg width={item.w} height={item.h} viewBox={`0 0 ${item.w} ${item.h}`} style={{ overflow: 'visible', pointerEvents: 'none' }} aria-label="Desenho à mão livre">
      {(item.tracos ?? []).map((t, i) => (
        <polyline key={i} points={t.pontos.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={t.cor} strokeWidth={t.espessura} strokeLinecap="round" strokeLinejoin="round" opacity={t.marcaTexto ? 0.4 : 1} />
      ))}
    </svg>
  );
}

const CARIMBOS: Record<string, string> = { importante: 'IMPORTANTE', revisar: 'REVISAR', aprovado: 'APROVADO', urgente: 'URGENTE', ok: 'OK ✓', erro: 'ERREI ✗', decorar: 'DECORAR', 'cai-muito': 'CAI MUITO', duvida: 'DÚVIDA ?' };

export const Item = memo(function Item(p: PropsItem) {
  const { item, selecionado, editando, esmaecido, zoomBaixo, modoProva, tenteLembrar, destaque, opacidadeCamada, conexaoDestacada, corretor, recemCriado, alvoConector } = p;
  const raizRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = raizRef.current; if (!el || !item.autoAjuste || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { const h = Math.round(el.offsetHeight); const atual = getEstado().lousa.doc.itens[item.id]; if (atual && atual.autoAjuste && Math.abs(atual.h - h) > 1) atualizarItem(item.id, { h }, false); });
    ro.observe(el); return () => ro.disconnect();
  }, [item.autoAjuste, item.id]);
  const transparente = ehTransparente(item.cor);
  const corTexto = item.corTexto ?? (transparente ? 'var(--ui-texto)' : corTextoPara(item.cor));
  const estilo: CSSProperties = {
    transform: `translate(${item.x}px, ${item.y}px) rotate(${item.angulo}deg)`, width: item.w, height: item.autoAjuste ? 'auto' : item.h, minHeight: item.autoAjuste ? item.h : undefined,
    zIndex: item.z, background: transparente ? 'transparent' : item.cor, color: corTexto, fontFamily: fonteCss(item.fonte), fontSize: item.tamanhoFonte, opacity: opacidadeCamada,
    boxShadow: conexaoDestacada ? '0 0 0 3px #f59e0b, 0 8px 20px -6px rgba(0,0,0,0.4)' : undefined,
  };
  const classes = ['item', selecionado ? 'selecionado' : '', editando ? 'em-edicao' : '', esmaecido ? 'esmaecido' : '', destaque ? 'destaque-busca' : '', item.travado ? 'travado' : '', recemCriado ? 'recem-criado' : '', alvoConector ? 'alvo-conector' : ''].join(' ');
  const aoConcluir = (html: string) => { if (html !== item.html) atualizarItem(item.id, { html }, false); };
  const aoMudar = (html: string) => { if (html !== item.html) atualizarItem(item.id, { html }, false); };
  const criarProximo = () => { criarItem({ tipo: item.tipo, x: item.x + item.w + 24, y: item.y, w: item.w, h: item.h, cor: item.cor, etiquetas: item.etiquetas, fonte: item.fonte, tamanhoFonte: item.tamanhoFonte }, { selecionar: true, editar: true }); };
  const meta = (item.etiquetas.length || item.status !== 'nao-visto' || item.revisao.ativa || item.fixado) && !zoomBaixo && (
    <div className="meta-item" aria-hidden="true">
      {item.fixado && <span title="Fixado">📌</span>}
      {item.status !== 'nao-visto' && <span className="chip" title={ROTULOS_STATUS[item.status]} style={{ background: 'rgba(255,255,255,0.5)', color: '#1f2937' }}>{ICONE_STATUS[item.status]} {ROTULOS_STATUS[item.status]}</span>}
      {item.revisao.ativa && item.revisao.proxima && <span className="chip" title="Próxima revisão" style={{ background: 'rgba(255,255,255,0.5)', color: '#1f2937' }}>↻ {new Date(item.revisao.proxima).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>}
      {item.etiquetas.slice(0, 3).map((e) => <span key={e} className="chip" style={{ background: 'rgba(0,0,0,0.08)', color: 'inherit' }}>#{e}</span>)}
    </div>
  );

  // Zoom semântico: só título/cor
  if (zoomBaixo && !editando && ['postit', 'caixa', 'texto', 'titulo', 'cloze', 'tarefas', 'tabela', 'link'].includes(item.tipo)) {
    const div = document.createElement('div'); div.innerHTML = item.html; const resumo = item.titulo || (div.textContent ?? '').slice(0, 60) || (item.tipo === 'link' ? item.url : '') || '…';
    return <div className={classes} data-item-id={item.id} data-tipo={item.tipo} style={estilo} aria-label={resumo}><div className="resumo">{resumo}</div></div>;
  }

  let corpo: React.ReactNode = null;
  const placeholder = { postit: 'Escreva a anotação…', texto: 'Texto livre…', titulo: 'Título…', caixa: 'Conteúdo da caixa…', forma: '', cloze: 'Use {{ }} para as lacunas…' }[item.tipo as string] ?? '';
  const mostrarVerso = item.verso !== undefined && item.virado;
  const ocultarResposta = modoProva && item.verso !== undefined;
  switch (item.tipo) {
    case 'postit': case 'texto': case 'titulo': case 'caixa': {
      const conteudoHtml = mostrarVerso ? item.verso ?? '' : item.html;
      corpo = (
        <>
          {(item.titulo || item.verso !== undefined) && !editando && (
            <div className="titulo-item">
              {item.titulo && <span className="truncate">{item.titulo}</span>}
              {item.verso !== undefined && <button type="button" data-interativo="1" className="ml-auto rounded px-1.5 text-xs" style={{ background: 'rgba(0,0,0,0.12)' }} aria-label={item.virado ? 'Mostrar frente' : 'Mostrar verso'} title="Virar cartão" onClick={(e) => { e.stopPropagation(); atualizarItem(item.id, { virado: !item.virado }, false); }}>{item.virado ? '↩ frente' : '↪ verso'}</button>}
            </div>
          )}
          <div className={`flex-1 min-h-0 flex flex-col ${(ocultarResposta && item.virado && !editando) || tenteLembrar ? 'borrado' : ''}`}>
            <EditavelRico html={conteudoHtml} editando={editando} aoConcluir={(h) => (mostrarVerso ? atualizarItem(item.id, { verso: h }, false) : aoConcluir(h))} aoMudar={(h) => (mostrarVerso ? atualizarItem(item.id, { verso: h }, false) : aoMudar(h))} placeholder={mostrarVerso ? 'Resposta (verso)…' : placeholder} corretor={corretor} aoTab={criarProximo} style={item.tipo === 'titulo' ? { fontWeight: 800, lineHeight: 1.1 } : undefined} />
          </div>
          {meta}
        </>
      );
      break;
    }
    case 'cloze':
      corpo = editando ? <EditavelRico html={item.html} editando aoConcluir={aoConcluir} aoMudar={aoMudar} placeholder={placeholder} corretor={corretor} /> : (<>{item.titulo && <div className="titulo-item">{item.titulo}</div>}<Lacunas html={item.html} modoProva={modoProva} />{meta}</>);
      break;
    case 'tarefas': {
      const tarefas = item.tarefas ?? [];
      const feitas = tarefas.filter((t) => t.feito).length;
      corpo = (
        <div className="flex h-full flex-col p-2 text-sm">
          <div className="titulo-item !p-1 justify-between"><span className="truncate">{item.titulo || 'Tarefas'}</span><span className="text-xs opacity-70">{feitas}/{tarefas.length}</span></div>
          <div className="barra-progresso mx-1 mb-1" style={{ height: 4 }}><div style={{ width: `${tarefas.length ? (feitas / tarefas.length) * 100 : 0}%`, background: '#16a34a' }} /></div>
          <ul className="flex-1 overflow-auto">
            {tarefas.map((t, i) => (
              <li key={i} className="flex items-start gap-2 py-0.5">
                <input type="checkbox" data-interativo="1" checked={t.feito} aria-label={`Concluir: ${t.texto}`} onChange={() => atualizarItem(item.id, { tarefas: tarefas.map((x, j) => (j === i ? { ...x, feito: !x.feito } : x)) })} onPointerDown={(e) => e.stopPropagation()} className="mt-1 h-4 w-4 shrink-0 cursor-pointer" />
                {editando ? <input data-interativo="1" className="campo !py-0 !px-1 text-sm" defaultValue={t.texto} aria-label={`Tarefa ${i + 1}`} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); atualizarItem(item.id, { tarefas: [...tarefas.slice(0, i + 1), { texto: '', feito: false }, ...tarefas.slice(i + 1)] }); } if (e.key === 'Escape') setUI({ editando: null }); if (e.key === 'Backspace' && !(e.target as HTMLInputElement).value && tarefas.length > 1) atualizarItem(item.id, { tarefas: tarefas.filter((_, j) => j !== i) }); }} onBlur={(e) => { const v = e.target.value.slice(0, 500); if (v !== t.texto) atualizarItem(item.id, { tarefas: tarefas.map((x, j) => (j === i ? { ...x, texto: v } : x)) }); }} autoFocus={i === tarefas.length - 1} />
                  : <span className={t.feito ? 'line-through opacity-60' : ''}>{t.texto || <em className="opacity-50">vazio</em>}</span>}
              </li>
            ))}
          </ul>
          {editando && <button type="button" data-interativo="1" className="btn contorno mt-1 text-xs" onPointerDown={(e) => e.stopPropagation()} onClick={() => atualizarItem(item.id, { tarefas: [...tarefas, { texto: '', feito: false }] })}>+ tarefa</button>}
          {meta}
        </div>
      );
      break;
    }
    case 'tabela': {
      const tab = item.tabela ?? [[]];
      corpo = (
        <div className="h-full w-full overflow-auto p-1">
          {item.titulo && <div className="titulo-item !p-1">{item.titulo}</div>}
          <table className="tabela-item"><tbody>
            {tab.map((linha, i) => <tr key={i}>{linha.map((c, j) => <td key={j} contentEditable={editando} suppressContentEditableWarning spellCheck={corretor} data-interativo={editando ? '1' : undefined} onPointerDown={(e) => { if (editando) e.stopPropagation(); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setUI({ editando: null }); }} onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').slice(0, 2000)); }} onBlur={(e) => { const v = (e.currentTarget.textContent ?? '').slice(0, 1000); if (v !== c) atualizarItem(item.id, { tabela: tab.map((l, a) => (a === i ? l.map((x, b) => (b === j ? v : x)) : l)) }); }}>{c}</td>)}</tr>)}
          </tbody></table>
        </div>
      );
      break;
    }
    case 'imagem': corpo = <><Imagem item={item} />{item.titulo && <div className="meta-item justify-center">{item.titulo}</div>}</>; break;
    case 'link':
      corpo = (
        <div className="flex h-full items-center gap-3 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl" style={{ background: 'rgba(37,99,235,0.12)' }} aria-hidden="true">🔗</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{item.titulo || 'Link'}</div>
            <div className="truncate text-xs opacity-70">{item.url}</div>
          </div>
          {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" data-interativo="1" className="btn contorno text-xs" onPointerDown={(e) => e.stopPropagation()} aria-label={`Abrir ${item.titulo || item.url} em nova aba`}>Abrir ↗</a>}
        </div>
      );
      break;
    case 'desenho': corpo = <Desenho item={item} />; break;
    case 'forma': {
      const pts = formaPronta(item.forma ?? 'retangulo', { x: 0, y: 0, w: item.w, h: item.h });
      corpo = (
        <div className="relative h-full w-full">
          <svg width={item.w} height={item.h} viewBox={`0 0 ${item.w} ${item.h}`} className="absolute inset-0" aria-hidden="true">
            {item.forma === 'retangulo' ? <rect x={1} y={1} width={item.w - 2} height={item.h - 2} rx={6} fill={item.cor} stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} /> : <path d={caminhoSvg(pts)} fill={item.cor} stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} />}
          </svg>
          <div className="relative flex h-full w-full items-center justify-center text-center" style={{ color: corTextoPara(item.cor) }}>
            <EditavelRico html={item.html} editando={editando} aoConcluir={aoConcluir} aoMudar={aoMudar} placeholder="" corretor={corretor} style={{ textAlign: 'center', padding: '4px 14%', flex: 'none', width: '100%' }} />
          </div>
        </div>
      );
      break;
    }
    case 'contador':
      corpo = (
        <div className="flex h-full flex-col items-center justify-center rounded-xl" style={{ background: transparente ? '#fff' : undefined }}>
          <div className="text-xs font-semibold opacity-70">{item.titulo || 'Contador'}</div>
          <div className="flex items-center gap-2">
            <button type="button" data-interativo="1" className="btn contorno !min-w-7 !min-h-7 !p-0" aria-label="Diminuir" onPointerDown={(e) => e.stopPropagation()} onClick={() => atualizarItem(item.id, { valor: (item.valor ?? 0) - 1 })}>−</button>
            <span className="text-2xl font-bold tabular-nums" aria-live="polite">{item.valor ?? 0}</span>
            <button type="button" data-interativo="1" className="btn contorno !min-w-7 !min-h-7 !p-0" aria-label="Aumentar" onPointerDown={(e) => e.stopPropagation()} onClick={() => atualizarItem(item.id, { valor: (item.valor ?? 0) + 1 })}>+</button>
          </div>
        </div>
      );
      break;
    case 'fita': corpo = <div className="h-full w-full" style={{ background: item.cor, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', opacity: 0.85, backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.25) 0 2px, transparent 2px 6px)' }} aria-label="Fita adesiva" />; break;
    case 'pino': corpo = <div className="h-full w-full rounded-full" style={{ background: `radial-gradient(circle at 35% 35%, #fff8, ${item.cor} 45%, ${item.cor})`, boxShadow: '0 3px 6px rgba(0,0,0,0.4)' }} aria-label="Pino" />; break;
    case 'carimbo': corpo = <div className="flex h-full w-full items-center justify-center rounded-md border-4 px-2 text-center font-black uppercase tracking-wider" style={{ borderColor: item.cor, color: item.cor, background: 'transparent', fontSize: Math.max(12, Math.min(item.h * 0.45, item.w / 7)), opacity: 0.85, maskImage: 'radial-gradient(circle, #000 70%, rgba(0,0,0,0.6))' }}>{CARIMBOS[item.carimbo ?? 'importante'] ?? item.carimbo}</div>; break;
  }
  const estiloFinal = ['fita', 'pino', 'carimbo', 'desenho', 'forma', 'imagem'].includes(item.tipo) ? { ...estilo, background: 'transparent', boxShadow: undefined } : estilo;
  return (
    <div ref={raizRef} className={classes} data-item-id={item.id} data-tipo={item.tipo} style={estiloFinal} role="group" aria-label={`${item.titulo || item.tipo}${item.travado ? ' (travado)' : ''}`} aria-selected={selecionado} tabIndex={-1}>
      {item.fixado && <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-base" aria-hidden="true">📌</span>}
      {corpo}
    </div>
  );
});

export { textoParaHtml };
