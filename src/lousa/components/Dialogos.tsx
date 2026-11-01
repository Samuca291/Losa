// ============================================================
// DIÁLOGOS, MENU DE CONTEXTO E PALETA DE COMANDOS
// ============================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MODELOS_POSTIT, ROTULOS_MOTIVO, ROTULOS_STATUS, type Retangulo, type StatusEstudo } from '../types';
import { CATALOGO, GRUPOS_CATALOGO, type EspecDivisao } from '../utils/divisoes';
import { bboxesDoLayout } from '../utils/divisoes';
import { caminhoSvg, poligonoDoRetangulo } from '../utils/geometria';
import {
  agrupar, alternarOcultarTudo, aplicarDivisao, atualizarItem, atualizarTopicoEdital, avisar, colarComoLink, colarHtmlComoItem, colarTextoComoItem, criarItem, criarItensEmLote,
  criarRegiaoCobrindoTela, criarRegiaoRaiz, desagrupar, desfazer, dividirAoMeio, dividirPorRegra, duplicarItens, duplicarRegiao, enquadrar, esvaziarLixeira, excluirConector, excluirItens,
  filaDeRevisao, getEstado, importarEdital, irParaItem, irParaRegiao, moverPor, ordenarZ, refazer, registrarQuestoes, registrarRevisao, removerRegiao, removerTopicoEdital,
  restaurarDaLixeira, selecionar, selecionarPor, setLousa, setUI, setVisualizacao, tenteLembrar, useLousa, useUI, verTudo, voltarInicio, zoomPara, girarPor, ativarRevisao,
  textoDoItem, caminhoRegiao, centroDaTelaNoMundo, type Dialogo as TDialogo, atualizarRegiao, especNormalizadaParaMundo, agora, DIA_MS, criarConector, gerarId, chaveDia,
} from '../store';
import { arquivarLousa, duplicarLousa, excluirLousa, listarBackups, novaLousa, renomearLousaPorId, restaurarBackup, trocarLousa, baixarPNG, imprimirPDF, exportarJSON, exportarTexto, exportarCSVCartoes } from '../persistencia';
import { baixarEAplicar, sincronizarTudo } from '../nuvem';
import { conectarSelecionados, inverterConector } from '../store';
import { dividirTexto, htmlParaTexto, pareceUrl, temMarcadores, testesDeSeguranca, textoParaTabela, textoParaHtml } from '../utils/seguranca';
import { carregarExemplo, gerarTesteCarga } from '../exemplo';
import type { Backup } from '../utils/db';
import { kanban, colunas } from '../utils/divisoes';

export function Modal({ titulo, children, largura, aoFechar, rodape }: { titulo: string; children: ReactNode; largura?: number; aoFechar?: () => void; rodape?: ReactNode }) {
  const fechar = aoFechar ?? (() => setUI({ dialogo: null })); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } }; document.addEventListener('keydown', k, true); const prim = ref.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]),textarea,select') ?? ref.current; prim?.focus(); return () => document.removeEventListener('keydown', k, true); }, []); // eslint-disable-line
  return (
    <div className="dialogo-fundo" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div ref={ref} tabIndex={-1} className="dialogo ui surgir outline-none" role="dialog" aria-modal="true" aria-label={titulo} style={{ width: largura ? `min(${largura}px, 100%)` : undefined }} onKeyDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{titulo}</h2><button type="button" className="btn" aria-label="Fechar" onClick={fechar}>✕</button></div>
        {children}
        {rodape && <div className="mt-4 flex flex-wrap justify-end gap-2">{rodape}</div>}
      </div>
    </div>
  );
}

export function Dialogos({ mundoRef }: { mundoRef: React.RefObject<HTMLDivElement | null> }) {
  const d = useUI((u) => u.dialogo); if (!d) return null;
  switch (d.tipo) {
    case 'dividir': return <DialogoDividir regiaoId={d.regiaoId} />;
    case 'colar': return <DialogoColar d={d} />;
    case 'ajuda': return <DialogoAjuda />;
    case 'paleta': return <PaletaComandos mundoRef={mundoRef} />;
    case 'sobre': return <DialogoSobre />;
    case 'lousas': return <DialogoLousas />;
    case 'fila-revisao': return <FilaRevisao />;
    case 'edital': return <DialogoEdital />;
    case 'caderno-erros': return <DialogoErros />;
    case 'questoes': return <DialogoQuestoes />;
    case 'estatisticas': return <DialogoEstatisticas />;
    case 'lixeira': return <DialogoLixeira />;
    case 'backups': return <DialogoBackups />;
    case 'modelos': return <DialogoModelos />;
    case 'importar-lista': return <DialogoImportarLista />;
    case 'apresentacao': return <Apresentacao />;
    case 'imagem': return <DialogoImagem id={d.id} />;
    case 'exportar': return <DialogoExportar mundoRef={mundoRef} />;
    default: return null;
  }
}

// ---------- Dividir ----------
function PreviaSpec({ spec, r }: { spec: EspecDivisao; r: Retangulo }) {
  const formas: { d: string; cor?: string }[] = [];
  const cores = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'];
  let k = 0;
  const desce = (s: EspecDivisao, caixa: Retangulo) => { const cx = s.layout ? bboxesDoLayout(caixa, s.layout) : null; s.filhos.forEach((f, i) => { const bb = cx ? cx[i] : caixa; const pts = f.pontos ?? poligonoDoRetangulo(bb); formas.push({ d: caminhoSvg(pts), cor: f.cor ?? cores[k++ % cores.length] }); if (f.sub) desce(f.sub, f.pontos ? { x: Math.min(...f.pontos.map((p) => p.x)), y: Math.min(...f.pontos.map((p) => p.y)), w: Math.max(...f.pontos.map((p) => p.x)) - Math.min(...f.pontos.map((p) => p.x)), h: Math.max(...f.pontos.map((p) => p.y)) - Math.min(...f.pontos.map((p) => p.y)) } : bb); }); };
  desce(spec, r);
  return <svg viewBox={`${r.x - 4} ${r.y - 4} ${r.w + 8} ${r.h + 8}`} className="h-44 w-full rounded-lg" style={{ background: 'var(--lousa-fundo)' }} aria-label="Pré-visualização da divisão"><rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="var(--ui-borda)" />{formas.map((f, i) => <path key={i} d={f.d} fill={f.cor} fillOpacity={0.35} stroke="#334155" strokeWidth={r.w / 300} />)}</svg>;
}
function DialogoDividir({ regiaoId }: { regiaoId: string | null }) {
  const regioes = useLousa((l) => l.doc.regioes); const modelos = useLousa((l) => l.modelosDivisao);
  const [grupo, setGrupo] = useState(GRUPOS_CATALOGO[0]); const [sel, setSel] = useState(CATALOGO[0].id); const [params, setParams] = useState<Record<string, string | number>>({}); const [semente, setSemente] = useState(0);
  const entrada = CATALOGO.find((c) => c.id === sel)!; const r = regiaoId && regioes[regiaoId] ? regioes[regiaoId].bbox : { x: 0, y: 0, w: 1600, h: 1000 };
  useEffect(() => { setParams(Object.fromEntries((entrada.params ?? []).map((p) => [p.chave, p.padrao]))); }, [sel]); // eslint-disable-line
  const spec = useMemo(() => { try { return entrada.gerar(r, params); } catch { return null; } }, [entrada, r, params, semente]); // eslint-disable-line
  const alvoNome = regiaoId && regioes[regiaoId] ? regioes[regiaoId].nome : 'a lousa (nova região cobrindo a tela)';
  const aplicar = () => { if (!spec) return; let id = regiaoId && regioes[regiaoId] ? regiaoId : criarRegiaoCobrindoTela('Lousa'); const rr = getEstado().lousa.doc.regioes[id]; const s = regiaoId && regioes[regiaoId] ? spec : entrada.gerar(rr.bbox, params); aplicarDivisao(id, s); setUI({ dialogo: null, regiaoSelecionada: id }); avisar(`Divisão "${entrada.nome}" aplicada`); };
  return (
    <Modal titulo={`Dividir ${alvoNome}`} largura={900} rodape={<><button type="button" className="btn contorno" onClick={() => setSemente((s) => s + 1)}>🎲 Gerar de novo</button><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: null })}>Cancelar</button><button type="button" className="btn primario" onClick={aplicar}>Aplicar divisão</button></>}>
      <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr]">
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col" aria-label="Grupos">{GRUPOS_CATALOGO.map((g) => <button key={g} type="button" className="btn text-left" aria-pressed={grupo === g} onClick={() => { setGrupo(g); const p = CATALOGO.find((c) => c.grupo === g); if (p) setSel(p.id); }}>{g}</button>)}{modelos.length > 0 && <button type="button" className="btn text-left" aria-pressed={grupo === 'Meus modelos'} onClick={() => setGrupo('Meus modelos')}>Meus modelos</button>}</nav>
        <div className="max-h-80 overflow-auto">
          {grupo === 'Meus modelos' ? modelos.map((m) => <button key={m.id} type="button" className="btn w-full justify-start" onClick={() => { const id = regiaoId && regioes[regiaoId] ? regiaoId : criarRegiaoCobrindoTela('Lousa'); const rr = getEstado().lousa.doc.regioes[id]; aplicarDivisao(id, especNormalizadaParaMundo(m.spec as EspecDivisao, rr.bbox)); setUI({ dialogo: null, regiaoSelecionada: id }); }}>💾 {m.nome}</button>)
            : CATALOGO.filter((c) => c.grupo === grupo).map((c) => <button key={c.id} type="button" className="btn w-full justify-start" aria-pressed={sel === c.id} onClick={() => setSel(c.id)} title={c.descricao}><span className="w-6 text-center">{c.icone}</span>{c.nome}</button>)}
        </div>
        <div className="flex flex-col gap-2">
          {spec && <PreviaSpec spec={spec} r={r} />}
          <p className="text-xs opacity-70">{entrada.descricao}</p>
          {(entrada.params ?? []).map((p) => <label key={p.chave} className="flex flex-col gap-1 text-xs"><span>{p.rotulo}</span>
            {p.tipo === 'opcao' ? <select className="campo !py-1" value={String(params[p.chave] ?? p.padrao)} onChange={(e) => setParams({ ...params, [p.chave]: e.target.value })}>{p.opcoes!.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>
              : p.tipo === 'numero' ? <input type="number" className="campo !py-1" min={p.min} max={p.max} value={params[p.chave] ?? p.padrao} onChange={(e) => setParams({ ...params, [p.chave]: Number(e.target.value) })} />
                : p.chave === 'texto' ? <textarea className="campo !py-1" rows={4} value={String(params[p.chave] ?? p.padrao)} onChange={(e) => setParams({ ...params, [p.chave]: e.target.value })} />
                  : <input className="campo !py-1" value={String(params[p.chave] ?? p.padrao)} onChange={(e) => setParams({ ...params, [p.chave]: e.target.value })} />}</label>)}
          <p className="text-xs opacity-60">Depois de aplicar, cada região pode ser dividida de novo por qualquer método, em qualquer profundidade. Também há ferramentas de traçar linha, polígono e laço na barra "Dividir".</p>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Colar como ----------
function DialogoColar({ d }: { d: Extract<TDialogo, { tipo: 'colar' }> }) {
  const linhas = dividirTexto(d.texto, 'linha'); const paras = dividirTexto(d.texto, 'paragrafo'); const topicos = dividirTexto(d.texto, 'topico'); const tabela = textoParaTabela(d.texto);
  const fechar = () => setUI({ dialogo: null });
  const regiao = getEstado().ui.regiaoSelecionada;
  return (
    <Modal titulo="Colar como…" largura={560}>
      <pre className="mb-3 max-h-32 overflow-auto rounded-lg p-2 text-xs" style={{ background: 'var(--ui-fundo-2)', whiteSpace: 'pre-wrap' }}>{d.texto.slice(0, 600)}{d.texto.length > 600 ? '…' : ''}</pre>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn contorno justify-start" onClick={() => { colarTextoComoItem(d.texto, d.pos); fechar(); }}>🗒️ Um post-it (texto limpo)</button>
        <button type="button" className="btn contorno justify-start" onClick={() => { colarTextoComoItem(d.texto, d.pos, 'caixa'); fechar(); }}>▭ Caixa de texto</button>
        {d.html && <button type="button" className="btn contorno justify-start" onClick={() => { colarHtmlComoItem(d.html, d.pos); fechar(); }}>✨ Post-it mantendo formatação básica (filtrada)</button>}
        <button type="button" className="btn contorno justify-start" onClick={() => { criarItensEmLote(linhas, d.pos, 'postit', regiao ?? null); fechar(); }}>📑 Vários post-its: um por linha ({linhas.length})</button>
        <button type="button" className="btn contorno justify-start" onClick={() => { criarItensEmLote(paras, d.pos, 'postit', regiao ?? null); fechar(); }}>📄 Um por parágrafo ({paras.length})</button>
        {temMarcadores(d.texto) && <button type="button" className="btn contorno justify-start" onClick={() => { criarItensEmLote(topicos, d.pos, 'postit', regiao ?? null); fechar(); }}>• Um por tópico/marcador ({topicos.length})</button>}
        {tabela && <button type="button" className="btn contorno justify-start" onClick={() => { criarItem({ tipo: 'tabela', x: d.pos.x, y: d.pos.y, w: Math.min(900, 120 * tabela[0].length), h: Math.min(600, 32 * tabela.length + 20), tabela }); fechar(); }}>▦ Tabela ({tabela.length}×{tabela[0].length})</button>}
        <button type="button" className="btn contorno justify-start" onClick={() => { criarItem({ tipo: 'tarefas', x: d.pos.x, y: d.pos.y, tarefas: linhas.slice(0, 200).map((t) => ({ texto: t, feito: false })), h: Math.min(600, 40 + linhas.length * 26) }); fechar(); }}>☑ Lista de tarefas</button>
        <button type="button" className="btn contorno justify-start" onClick={() => { criarItem({ tipo: 'cloze', x: d.pos.x, y: d.pos.y, html: textoParaHtml(d.texto) }); fechar(); }}>⬚ Frase com lacunas (marque com {'{{ }}'})</button>
      </div>
    </Modal>
  );
}

// ---------- Menu de contexto ----------
export function MenuContexto() {
  const m = useUI((u) => u.menuContexto); const sel = useUI((u) => u.selecao); const itens = useLousa((l) => l.doc.itens); const regioes = useLousa((l) => l.doc.regioes);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!m) return; const f = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setUI({ menuContexto: null }); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setUI({ menuContexto: null }); }; document.addEventListener('pointerdown', f); document.addEventListener('keydown', k); return () => { document.removeEventListener('pointerdown', f); document.removeEventListener('keydown', k); }; }, [m]);
  if (!m) return null;
  const fechar = () => setUI({ menuContexto: null });
  const B = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => <button type="button" role="menuitem" onClick={() => { onClick(); fechar(); }}>{children}</button>;
  const estilo = { left: Math.min(m.x, window.innerWidth - 240), top: Math.min(m.y, window.innerHeight - 320) };
  const it = m.id ? itens[m.id] : null; const ids = sel.length ? sel : m.id ? [m.id] : [];
  return (
    <div ref={ref} className="menu ui surgir" role="menu" style={estilo}>
      {m.alvo === 'item' && it && (<>
        {['postit', 'texto', 'titulo', 'caixa', 'cloze', 'forma', 'tarefas', 'tabela'].includes(it.tipo) && <B onClick={() => setUI({ editando: it.id, selecao: [it.id] })}>✏️ Editar texto <kbd className="ml-auto text-xs opacity-60">Enter</kbd></B>}
        <B onClick={() => duplicarItens(ids)}>⧉ Duplicar <kbd className="ml-auto text-xs opacity-60">Ctrl+D</kbd></B>
        <B onClick={() => ordenarZ(ids, 'frente')}>⬆ Trazer para frente</B><B onClick={() => ordenarZ(ids, 'tras')}>⬇ Enviar para trás</B>
        <B onClick={() => atualizarItem(it.id, { travado: !it.travado })}>{it.travado ? '🔓 Destravar' : '🔒 Travar'}</B>
        <B onClick={() => atualizarItem(it.id, { fixado: !it.fixado })}>{it.fixado ? 'Desafixar' : '📌 Fixar com pino'}</B>
        <B onClick={() => atualizarItem(it.id, { oculto: true })}>🙈 Ocultar item</B>
        <hr />
        <B onClick={() => ativarRevisao(it.id, !it.revisao.ativa)}>{it.revisao.ativa ? 'Sair da revisão espaçada' : '↻ Entrar na revisão espaçada'}</B>
        {it.verso === undefined ? <B onClick={() => atualizarItem(it.id, { verso: '' })}>🔁 Virar em cartão frente/verso</B> : <B onClick={() => atualizarItem(it.id, { virado: !it.virado }, false)}>🔁 Virar cartão</B>}
        <B onClick={() => tenteLembrar(it.id)}>🙈 Tente lembrar (8 s)</B>
        <B onClick={() => setUI({ conexoesDe: it.id })}>🕸️ Ver conexões</B>
        {ids.length > 1 ? <B onClick={() => conectarSelecionados(ids)}>🔗 Conectar os {ids.length} selecionados em sequência <kbd className="ml-auto text-xs opacity-60">L</kbd></B> : <B onClick={() => import('../store').then((st) => st.iniciarConexaoPendente(it.id))}>↗ Conectar a outro item… <kbd className="ml-auto text-xs opacity-60">L</kbd></B>}
        <hr />
        <B onClick={() => setUI({ painel: 'propriedades' })}>⚙️ Propriedades…</B>
        {ids.length > 1 && <B onClick={() => agrupar(ids)}>Agrupar <kbd className="ml-auto text-xs opacity-60">Ctrl+G</kbd></B>}
        {it.grupo && <B onClick={() => desagrupar(ids)}>Desagrupar</B>}
        <B onClick={() => excluirItens(ids)}><span style={{ color: 'var(--ui-perigo)' }}>🗑 Excluir</span> <kbd className="ml-auto text-xs opacity-60">Del</kbd></B>
      </>)}
      {m.alvo === 'regiao' && m.id && regioes[m.id] && (<>
        <div className="px-2 py-1 text-xs opacity-60">{caminhoRegiao(m.id, regioes).join(' › ')}</div>
        <B onClick={() => setUI({ dialogo: { tipo: 'dividir', regiaoId: m.id ?? null } })}>▦ Dividir esta região…</B>
        <B onClick={() => dividirAoMeio(m.id!)}>Dividir ao meio</B>
        <B onClick={() => { const pos = { x: regioes[m.id!].bbox.x + 24, y: regioes[m.id!].bbox.y + 56 }; criarItem({ tipo: 'postit', x: pos.x, y: pos.y, regiao: m.id }, { selecionar: true, editar: true }); }}>🗒️ Novo post-it aqui</B>
        <B onClick={() => { const n = window.prompt('Novo nome', regioes[m.id!].nome); if (n) atualizarRegiao(m.id!, { nome: n.slice(0, 120) }); }}>✏️ Renomear</B>
        <B onClick={() => irParaRegiao(m.id!)}>⛶ Enquadrar</B>
        <B onClick={() => setUI({ regiaoIsolada: getEstado().ui.regiaoIsolada === m.id ? null : m.id })}>◎ Isolar / sair</B>
        <B onClick={() => atualizarRegiao(m.id!, { recolhida: !regioes[m.id!].recolhida })}>{regioes[m.id!].recolhida ? 'Expandir' : 'Recolher'}</B>
        <B onClick={() => atualizarRegiao(m.id!, { travada: !regioes[m.id!].travada })}>{regioes[m.id!].travada ? '🔓 Destravar' : '🔒 Travar'}</B>
        <B onClick={() => duplicarRegiao(m.id!)}>⧉ Duplicar com conteúdo</B>
        <B onClick={() => selecionarPor({ regiao: m.id })}>Selecionar itens da região</B>
        <B onClick={() => dividirPorRegra(m.id!, 'etiqueta')}>🏷️ Organizar por etiqueta</B>
        <B onClick={() => setUI({ painel: 'regioes', regiaoSelecionada: m.id })}>⚙️ Propriedades da região…</B>
        <B onClick={() => removerRegiao(m.id!, true)}><span style={{ color: 'var(--ui-perigo)' }}>🗑 Remover região (manter itens)</span></B>
      </>)}
      {m.alvo === 'conector' && m.id && (<>
        <B onClick={() => setUI({ rotuloEditando: m.id!, conectorSelecionado: m.id! })}>✏️ Editar rótulo <kbd className="ml-auto text-xs opacity-60">F2</kbd></B>
        <B onClick={() => import('../store').then((st) => { const c = getEstado().lousa.doc.conectores[m.id!]; if (c) st.atualizarConector(m.id!, { estilo: c.estilo === 'curvo' ? 'angulo' : c.estilo === 'angulo' ? 'reto' : 'curvo' }); })}>⌒ Alternar estilo (curvo → ângulo → reto)</B>
        <B onClick={() => inverterConector(m.id!)}>⇄ Inverter direção</B><B onClick={() => setUI({ painel: 'propriedades' })}>⚙️ Propriedades do conector</B><B onClick={() => excluirConector(m.id!)}><span style={{ color: 'var(--ui-perigo)' }}>🗑 Excluir conector</span></B></>)}
      {m.alvo === 'fundo' && (<>
        <B onClick={() => { const c = centroDaTelaNoMundo(); criarItem({ tipo: 'postit', x: c.x - 100, y: c.y - 100 }, { selecionar: true, editar: true }); }}>🗒️ Novo post-it <kbd className="ml-auto text-xs opacity-60">N</kbd></B>
        <B onClick={() => navigator.clipboard?.readText().then((t) => { if (t) colarTextoComoItem(t, centroDaTelaNoMundo()); }).catch(() => avisar('Use Ctrl+V para colar.'))}>📋 Colar</B>
        <B onClick={() => setUI({ dialogo: { tipo: 'dividir', regiaoId: null } })}>▦ Dividir a lousa…</B>
        <B onClick={() => setUI({ ferramenta: 'regiao' })}>▭ Desenhar região</B>
        <B onClick={() => selecionar(Object.keys(itens))}>Selecionar tudo <kbd className="ml-auto text-xs opacity-60">Ctrl+A</kbd></B>
        <B onClick={verTudo}>⛶ Ver tudo</B>
        <B onClick={alternarOcultarTudo}>🫣 Ocultar/mostrar tudo <kbd className="ml-auto text-xs opacity-60">H</kbd></B>
      </>)}
    </div>
  );
}

// ---------- Paleta de comandos ----------
export interface Comando { id: string; titulo: string; atalho?: string; grupo: string; executar: () => void }
export function listaComandos(mundoRef: React.RefObject<HTMLDivElement | null>): Comando[] {
  const sel = () => getEstado().ui.selecao; const c = () => centroDaTelaNoMundo();
  return [
    { id: 'novo-postit', titulo: 'Novo post-it', atalho: 'N', grupo: 'Criar', executar: () => criarItem({ tipo: 'postit', x: c().x - 100, y: c().y - 100 }, { selecionar: true, editar: true }) },
    { id: 'novo-texto', titulo: 'Novo texto livre', atalho: 'T', grupo: 'Criar', executar: () => criarItem({ tipo: 'texto', x: c().x - 100, y: c().y - 30 }, { selecionar: true, editar: true }) },
    { id: 'nova-tarefa', titulo: 'Nova lista de tarefas', grupo: 'Criar', executar: () => criarItem({ tipo: 'tarefas', x: c().x - 100, y: c().y - 90 }) },
    { id: 'nova-tabela', titulo: 'Nova tabela', grupo: 'Criar', executar: () => criarItem({ tipo: 'tabela', x: c().x - 160, y: c().y - 80 }) },
    { id: 'cloze', titulo: 'Nova frase com lacunas', grupo: 'Criar', executar: () => criarItem({ tipo: 'cloze', x: c().x - 140, y: c().y - 70, html: 'A {{lacuna}} aparece ao clicar.' }, { selecionar: true, editar: true }) },
    ...MODELOS_POSTIT.map((m): Comando => ({ id: `modelo-${m.id}`, titulo: `Modelo: ${m.nome}`, grupo: 'Modelos', executar: () => criarItem({ tipo: 'postit', x: c().x - 100, y: c().y - 100, cor: m.cor, titulo: m.titulo, html: m.html, verso: m.verso, etiquetas: m.etiquetas, modelo: m.id, erro: m.id === 'erro' ? { disciplina: '', assunto: '', banca: '', ano: '', oQueErrei: '', motivo: 'nao-sabia', respostaCerta: '', fonte: '' } : undefined }, { selecionar: true, editar: true }) })),
    { id: 'dividir', titulo: 'Dividir a lousa / região…', grupo: 'Regiões', executar: () => setUI({ dialogo: { tipo: 'dividir', regiaoId: getEstado().ui.regiaoSelecionada } }) },
    { id: 'kanban', titulo: 'Criar quadro de colunas (A estudar / Estudando / Revisar / Dominado)', grupo: 'Regiões', executar: () => { const id = criarRegiaoCobrindoTela('Quadro'); aplicarDivisao(id, kanban()); } },
    { id: 'semana', titulo: 'Criar 7 colunas (dias da semana)', grupo: 'Regiões', executar: () => { const id = criarRegiaoCobrindoTela('Semana'); aplicarDivisao(id, colunas(Array(7).fill(1), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'])); } },
    { id: 'poligono', titulo: 'Ferramenta: polígono livre', grupo: 'Regiões', executar: () => setUI({ ferramenta: 'poligono' }) },
    { id: 'laco', titulo: 'Ferramenta: laço', grupo: 'Regiões', executar: () => setUI({ ferramenta: 'laco' }) },
    { id: 'linha', titulo: 'Ferramenta: traçar linha de divisão', grupo: 'Regiões', executar: () => setUI({ ferramenta: 'linha-divisao' }) },
    { id: 'por-etiqueta', titulo: 'Dividir por etiqueta (uma coluna por disciplina)', grupo: 'Regiões', executar: () => dividirPorRegra(getEstado().ui.regiaoSelecionada, 'etiqueta') },
    { id: 'por-status', titulo: 'Dividir por status', grupo: 'Regiões', executar: () => dividirPorRegra(getEstado().ui.regiaoSelecionada, 'status') },
    { id: 'por-data', titulo: 'Dividir por data de revisão (hoje, semana, depois)', grupo: 'Regiões', executar: () => dividirPorRegra(getEstado().ui.regiaoSelecionada, 'data') },
    { id: 'ocultar', titulo: 'Ocultar / mostrar tudo sobre a lousa', atalho: 'H', grupo: 'Visualizar', executar: alternarOcultarTudo },
    { id: 'so-lousa', titulo: 'Ver só a lousa', grupo: 'Visualizar', executar: () => setVisualizacao({ modo: 'so-lousa' }) },
    { id: 'lousa-anot', titulo: 'Ver lousa e anotações', grupo: 'Visualizar', executar: () => setVisualizacao({ modo: 'lousa-anotacoes' }) },
    { id: 'lousa-post', titulo: 'Ver lousa e post-its', grupo: 'Visualizar', executar: () => setVisualizacao({ modo: 'lousa-postits' }) },
    { id: 'tudo', titulo: 'Ver tudo (itens)', grupo: 'Visualizar', executar: () => setVisualizacao({ modo: 'tudo', ocultarTudo: false, destacarTipo: null, tiposOcultos: [] }) },
    { id: 'foco', titulo: 'Modo foco', atalho: 'Shift+F', grupo: 'Visualizar', executar: () => setVisualizacao({ modoFoco: !getEstado().lousa.visualizacao.modoFoco }) },
    { id: 'prova', titulo: 'Modo prova (autoteste)', atalho: 'Shift+P', grupo: 'Visualizar', executar: () => setVisualizacao({ modoProva: !getEstado().lousa.visualizacao.modoProva }) },
    { id: 'ver-tudo', titulo: 'Zoom: ver tudo', atalho: 'Shift+1', grupo: 'Navegar', executar: verTudo },
    { id: 'inicio', titulo: 'Voltar ao início', atalho: 'Shift+0', grupo: 'Navegar', executar: voltarInicio },
    { id: 'zoom100', titulo: 'Zoom 100%', atalho: 'Ctrl+0', grupo: 'Navegar', executar: () => zoomPara(1) },
    { id: 'minimapa', titulo: 'Mostrar / ocultar minimapa', grupo: 'Navegar', executar: () => setVisualizacao({ minimapa: !getEstado().lousa.visualizacao.minimapa }) },
    { id: 'tema', titulo: 'Alternar tema claro / escuro', grupo: 'Aparência', executar: () => setLousa((l) => ({ config: { ...l.config, tema: l.config.tema === 'claro' ? 'escuro' : 'claro' } })) },
    { id: 'grade', titulo: 'Ligar / desligar grade magnética', grupo: 'Aparência', executar: () => setLousa((l) => ({ config: { ...l.config, grade: !l.config.grade } })) },
    { id: 'revisar', titulo: 'Revisar hoje (fila em tela cheia)', grupo: 'Estudo', executar: () => setUI({ dialogo: { tipo: 'fila-revisao' } }) },
    { id: 'edital', titulo: 'Mapa do edital', grupo: 'Estudo', executar: () => setUI({ dialogo: { tipo: 'edital' } }) },
    { id: 'erros', titulo: 'Caderno de erros', grupo: 'Estudo', executar: () => setUI({ dialogo: { tipo: 'caderno-erros' } }) },
    { id: 'questoes', titulo: 'Questões e simulado', grupo: 'Estudo', executar: () => setUI({ dialogo: { tipo: 'questoes' } }) },
    { id: 'stats', titulo: 'Estatísticas', grupo: 'Estudo', executar: () => setUI({ dialogo: { tipo: 'estatisticas' } }) },
    { id: 'pomodoro', titulo: 'Iniciar Pomodoro (foco)', grupo: 'Estudo', executar: () => import('../store').then((s) => s.iniciarPomodoro('foco')) },
    { id: 'apresentacao', titulo: 'Modo apresentação (regiões como slides)', grupo: 'Estudo', executar: () => setUI({ apresentacao: { indice: 0 }, dialogo: { tipo: 'apresentacao' } }) },
    { id: 'tente', titulo: 'Tente lembrar (esconde o texto dos selecionados por 8 s)', grupo: 'Estudo', executar: () => sel().forEach((id) => tenteLembrar(id)) },
    { id: 'rev-ativar', titulo: 'Colocar selecionados na revisão espaçada', grupo: 'Estudo', executar: () => sel().forEach((id) => ativarRevisao(id, true)) },
    { id: 'selecionar-tudo', titulo: 'Selecionar tudo', atalho: 'Ctrl+A', grupo: 'Selecionar', executar: () => selecionar(Object.keys(getEstado().lousa.doc.itens)) },
    { id: 'sel-cor', titulo: 'Selecionar itens da mesma cor do selecionado', grupo: 'Selecionar', executar: () => { const it = getEstado().lousa.doc.itens[sel()[0]]; if (it) selecionarPor({ cor: it.cor }); } },
    { id: 'duplicar', titulo: 'Duplicar seleção', atalho: 'Ctrl+D', grupo: 'Editar', executar: () => duplicarItens(sel()) },
    { id: 'excluir', titulo: 'Excluir seleção', atalho: 'Delete', grupo: 'Editar', executar: () => excluirItens(sel()) },
    { id: 'girar+', titulo: 'Girar 15° à direita', atalho: ']', grupo: 'Editar', executar: () => girarPor(sel(), 15) },
    { id: 'girar-', titulo: 'Girar 15° à esquerda', atalho: '[', grupo: 'Editar', executar: () => girarPor(sel(), -15) },
    { id: 'desfazer', titulo: 'Desfazer', atalho: 'Ctrl+Z', grupo: 'Editar', executar: desfazer }, { id: 'refazer', titulo: 'Refazer', atalho: 'Ctrl+Y', grupo: 'Editar', executar: refazer },
    { id: 'exportar-json', titulo: 'Exportar .json (backup completo)', grupo: 'Dados', executar: () => exportarJSON() },
    { id: 'exportar-png', titulo: 'Exportar PNG da lousa', grupo: 'Dados', executar: () => { if (mundoRef.current) baixarPNG(mundoRef.current, 1); } },
    { id: 'exportar-pdf', titulo: 'Exportar PDF (imprimir)', grupo: 'Dados', executar: () => { if (mundoRef.current) imprimirPDF(mundoRef.current); } },
    { id: 'exportar-md', titulo: 'Exportar texto (.md)', grupo: 'Dados', executar: () => exportarTexto('md') },
    { id: 'exportar-csv', titulo: 'Exportar CSV dos cartões', grupo: 'Dados', executar: exportarCSVCartoes },
    { id: 'lousas', titulo: 'Minhas lousas…', grupo: 'Dados', executar: () => setUI({ dialogo: { tipo: 'lousas' } }) },
    { id: 'lixeira', titulo: 'Lixeira (itens excluídos, 30 dias)', grupo: 'Dados', executar: () => setUI({ dialogo: { tipo: 'lixeira' } }) },
    { id: 'exemplo', titulo: 'Carregar lousa de exemplo', grupo: 'Dados', executar: carregarExemplo },
    { id: 'carga', titulo: 'Teste de carga: criar 3.000 itens', grupo: 'Dados', executar: () => gerarTesteCarga(3000) },
    { id: 'ajuda', titulo: 'Ajuda e atalhos', atalho: '?', grupo: 'Ajuda', executar: () => setUI({ dialogo: { tipo: 'ajuda' } }) },
    { id: 'sobre', titulo: 'Sobre, privacidade e testes de segurança', grupo: 'Ajuda', executar: () => setUI({ dialogo: { tipo: 'sobre' } }) },
  ];
}
function PaletaComandos({ mundoRef }: { mundoRef: React.RefObject<HTMLDivElement | null> }) {
  const [q, setQ] = useState(''); const [idx, setIdx] = useState(0);
  const todos = useMemo(() => listaComandos(mundoRef), [mundoRef]);
  const res = useMemo(() => { const t = q.toLowerCase().trim(); return (t ? todos.filter((c) => (c.titulo + ' ' + c.grupo).toLowerCase().includes(t)) : todos).slice(0, 40); }, [q, todos]);
  const exec = (c: Comando) => { setUI({ dialogo: null }); c.executar(); };
  return (
    <Modal titulo="Paleta de comandos" largura={600}>
      <input className="campo mb-2" placeholder="Digite um comando… (↑↓ navega, Enter executa)" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(res.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } if (e.key === 'Enter' && res[idx]) exec(res[idx]); }} aria-label="Buscar comando" />
      <ul className="max-h-96 overflow-auto" role="listbox">{res.map((c, i) => <li key={c.id} role="option" aria-selected={i === idx}><button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm" style={{ background: i === idx ? 'var(--ui-fundo-2)' : undefined }} onMouseEnter={() => setIdx(i)} onClick={() => exec(c)}><span className="w-24 shrink-0 text-xs opacity-60">{c.grupo}</span><span className="flex-1">{c.titulo}</span>{c.atalho && <kbd className="text-xs opacity-60">{c.atalho}</kbd>}</button></li>)}</ul>
    </Modal>
  );
}

// ---------- Ajuda ----------
function DialogoAjuda() {
  const atalhos: [string, string][] = [['V / M', 'Selecionar / Mão'], ['N / T / D / Shift+D / E / C', 'Post-it / Texto / Desenho / Marca-texto / Borracha / Conector'], ['Duplo clique no fundo', 'Cria um post-it ali mesmo (também dentro de regiões)'], ['Duplo clique em um post-it', 'Abre para editar (Esc ou Ctrl+Enter conclui)'], ['Arrastar a bolinha + da borda', 'Cria um conector até outro item; soltar no vazio cria um post-it já ligado'], ['Clicar na bolinha +', 'Modo clique-a-clique: depois clique no item de destino (Esc cancela)'], ['Alt + arrastar sobre um item', 'Também inicia um conector'], ['L', 'Com 1 item: conectar a outro (clique-a-clique) · com vários: conecta em sequência'], ['Arrastar a ponta de um conector selecionado', 'Religa a origem/destino a outro item'], ['Duplo clique na linha · F2', 'Edita o rótulo do conector'], ['Ctrl+Shift+X · 7 · 8 · H · L', 'No texto: tachado · lista numerada · lista · realce · lacuna'], ['"- " · "1. " · "# " · "> " + espaço', 'No texto: atalhos Markdown viram lista, título e citação'], ['S / R', 'Forma / Região'], ['Arrastar no fundo', 'Seleção por retângulo (ou criação, conforme a ferramenta)'], ['Espaço + arrastar · botão do meio · 2 dedos', 'Mover a lousa'], ['Ctrl + roda · pinça', 'Zoom centrado no cursor'], ['+ / − · Ctrl+0 · Shift+1 · Shift+0', 'Zoom / 100% / Ver tudo / Início'], ['Enter / Esc', 'Editar texto / concluir'], ['Tab (editando)', 'Conclui e cria um post-it ao lado'], ['Tab (item selecionado)', 'Cria um post-it ao lado'], ['Setas · Shift+setas', 'Mover 1 px · 10 px'], ['Alt+setas', 'Redimensionar'], ['[ e ]', 'Girar 15°'], ['Shift ao girar', 'Prende em passos de 15°'], ['Delete / Backspace', 'Excluir (vai para a lixeira)'], ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer (fora da edição de texto)'], ['Ctrl+C / X / V', 'Copiar / recortar / colar (itens ou conteúdo externo)'], ['Ctrl+D', 'Duplicar'], ['Ctrl+A', 'Selecionar tudo'], ['Ctrl+G / Ctrl+Shift+G', 'Agrupar / desagrupar'], ['H', 'Ocultar/mostrar tudo sobre a lousa'], ['Shift+F / Shift+P', 'Modo foco / modo prova'], ['/', 'Buscar'], ['Ctrl+K', 'Paleta de comandos'], ['?', 'Esta ajuda'], ['Ctrl+B / I / U (editando)', 'Negrito / itálico / sublinhado'], ['Shift+Ctrl+V (editando)', 'Colar mantendo formatação básica']];
  return (
    <Modal titulo="Ajuda e atalhos" largura={720}>
      <p className="mb-3 text-sm">Tudo o que se faz arrastando também se faz por clique e teclado (painel Propriedades: campos de x, y, ângulo, botões de mover e "Mover para região"). No celular, toque longo abre o menu; dois dedos movem e dão zoom.</p>
      <table className="w-full text-sm"><tbody>{atalhos.map(([k, v]) => <tr key={k} className="border-b" style={{ borderColor: 'var(--ui-borda)' }}><td className="py-1 pr-3"><kbd className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--ui-fundo-2)' }}>{k}</kbd></td><td className="py-1">{v}</td></tr>)}</tbody></table>
      <h3 className="mt-4 font-bold">Três dicas de estudo</h3>
      <ol className="list-decimal pl-5 text-sm"><li><b>Recuperação ativa:</b> transforme post-its em cartões frente/verso ou frases com lacunas e use o modo prova.</li><li><b>Revisão espaçada:</b> ative a revisão em cada item importante; o painel Estudo mostra o que vence hoje (padrão 1, 7 e 30 dias, ajustável).</li><li><b>Caderno de erros:</b> registre cada questão errada com o motivo; o relatório mostra onde você mais erra.</li></ol>
    </Modal>
  );
}

// ---------- Sobre ----------
function DialogoSobre() {
  const [res, setRes] = useState<ReturnType<typeof testesDeSeguranca> | null>(null);
  return (
    <Modal titulo="Sobre a Lousa Digital de Estudos" largura={640}>
      <div className="flex flex-col gap-2 text-sm">
        <p><b>Privacidade:</b> nenhum dado sai do seu computador. Não há rastreadores, contas nem requisições de rede. Tudo fica no armazenamento do navegador (IndexedDB) e nos arquivos que você exportar.</p>
        <p><b>Segurança:</b> todo conteúdo colado, importado ou restaurado passa pelo mesmo filtro central (DOMPurify com lista explícita de tags). Links aceitam só http, https e mailto e abrem com <code>rel="noopener noreferrer"</code>. Imagens SVG externas são recusadas.</p>
        <p><b>Limitações conhecidas:</b> o navegador pode apagar dados locais (pouco espaço, limpeza manual, janela privativa). Exporte um .json com frequência. Em arquivos abertos direto do disco (file://), alguns navegadores restringem o armazenamento: o programa avisa e funciona em modo "só exportar".</p>
        <button type="button" className="btn primario self-start" onClick={() => setRes(testesDeSeguranca())}>Rodar testes de segurança</button>
        {res && <table className="text-xs"><tbody>{res.map((r) => <tr key={r.nome}><td className="pr-2">{r.passou ? '✅' : '❌'}</td><td className="pr-2 font-semibold">{r.nome}</td><td className="opacity-70"><code>{r.resultado || '(vazio)'}</code></td></tr>)}</tbody></table>}
      </div>
    </Modal>
  );
}

// ---------- Lousas ----------
function DialogoLousas() {
  const lousas = useUI((u) => u.lousas); const atual = useLousa((l) => l.id); const [mostrarArq, setMostrarArq] = useState(false); const nuvem = useUI((u) => u.nuvem);
  const lista = lousas.filter((l) => mostrarArq || !l.arquivada);
  return (
    <Modal titulo="Minhas lousas" largura={640} rodape={<><button type="button" className="btn primario" onClick={() => { const n = window.prompt('Nome da nova lousa (ex.: um por concurso ou disciplina)'); if (n !== null) novaLousa(n).then(() => setUI({ dialogo: null })); }}>＋ Nova lousa</button><button type="button" className="btn contorno" onClick={() => { carregarExemplo(); setUI({ dialogo: null }); }}>Carregar exemplo nesta</button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={mostrarArq} onChange={(e) => setMostrarArq(e.target.checked)} /> Mostrar arquivadas</label>
        <span className="flex-1" />
        <span className={`chip ${nuvem.status === 'conectada' ? 'ok' : nuvem.status === 'sincronizando' ? 'acento' : ''}`}>{nuvem.status === 'conectada' ? '☁️ Nuvem conectada' : nuvem.status === 'sincronizando' ? '☁️ Sincronizando…' : nuvem.status === 'desativada' ? 'Nuvem desativada' : '💾 Só local'}</span>
        {nuvem.status !== 'desativada' && <button type="button" className="btn contorno !min-h-7 text-xs" onClick={() => sincronizarTudo(true)}>Sincronizar</button>}
      </div>
      <ul className="flex flex-col gap-1">{lista.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm" style={{ borderColor: l.id === atual ? 'var(--ui-acento)' : 'var(--ui-borda)', background: l.id === atual ? 'var(--ui-acento-suave)' : undefined }}>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => trocarLousa(l.id).then(() => setUI({ dialogo: null }))}><b>{l.nome}</b>{l.arquivada && ' (arquivada)'}{l.id === atual && <span className="chip acento ml-2">atual</span>}<span className="block text-xs opacity-60">{l.qtdItens} itens · {new Date(l.alteradoEm).toLocaleString('pt-BR')} · {l.origem === 'ambos' ? '💾 local + ☁️ nuvem' : l.origem === 'nuvem' ? '☁️ só na nuvem' : '💾 só neste navegador'}</span></button>
        {l.origem === 'nuvem' && <button type="button" className="btn contorno text-xs" onClick={() => baixarEAplicar(l.id)}>⬇ Baixar</button>}
        <button type="button" className="btn contorno text-xs" onClick={() => { const n = window.prompt('Novo nome', l.nome); if (n) renomearLousaPorId(l.id, n.slice(0, 80)); }}>Renomear</button>
        <button type="button" className="btn contorno text-xs" onClick={() => duplicarLousa(l.id)}>Duplicar</button>
        <button type="button" className="btn contorno text-xs" onClick={() => arquivarLousa(l.id, !l.arquivada)}>{l.arquivada ? 'Desarquivar' : 'Arquivar'}</button>
        <button type="button" className="btn perigo text-xs" onClick={() => { if (window.confirm(`Excluir a lousa "${l.nome}"? Esta ação não pode ser desfeita.`)) excluirLousa(l.id); }}>Excluir</button>
      </li>)}</ul>
      {lista.length === 0 && <p className="text-sm opacity-70">Nenhuma lousa salva ainda. A lousa atual é salva automaticamente ao receber o primeiro item.</p>}
    </Modal>
  );
}

// ---------- Fila de revisão ----------
function FilaRevisao() {
  const [fila] = useState(() => filaDeRevisao()); const [i, setI] = useState(0); const [virado, setVirado] = useState(false); const [placar, setPlacar] = useState({ ok: 0, erro: 0 });
  const itens = useLousa((l) => l.doc.itens); const it = fila[i] ? itens[fila[i].id] : null;
  useEffect(() => { setVirado(false); }, [i]);
  const responder = (ok: boolean) => { if (!it) return; registrarRevisao(it.id, ok); setPlacar((p) => ({ ok: p.ok + (ok ? 1 : 0), erro: p.erro + (ok ? 0 : 1) })); setI(i + 1); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); setVirado((v) => !v); } if (e.key === '1') responder(false); if (e.key === '2') responder(true); }; document.addEventListener('keydown', k, true); return () => document.removeEventListener('keydown', k, true); }); // eslint-disable-line
  if (!it) return <Modal titulo="Revisão concluída" largura={480}><p className="text-lg">✅ {placar.ok} acertos · ❌ {placar.erro} erros</p><p className="mt-2 text-sm opacity-70">{fila.length === 0 ? 'Não havia itens para revisar hoje.' : 'Os itens errados voltam para o primeiro intervalo; os acertados avançam na sequência.'}</p></Modal>;
  const texto = virado && it.verso !== undefined ? it.verso : it.html;
  return (
    <Modal titulo={`Revisar hoje · ${i + 1} de ${fila.length}`} largura={720}>
      <div className="text-xs opacity-60">{caminhoRegiao(it.regiao, getEstado().lousa.doc.regioes).join(' › ')} · {it.etiquetas.map((e) => `#${e}`).join(' ')}</div>
      <div className="my-3 min-h-48 rounded-2xl p-6 text-lg shadow-inner" style={{ background: it.cor === 'transparent' ? 'var(--ui-fundo-2)' : it.cor, color: '#1f2937' }}>
        {it.titulo && <div className="mb-2 font-bold">{it.titulo}</div>}
        {it.tipo === 'cloze' ? <div>{htmlParaTexto(it.html).replace(/\{\{([^}]*)\}\}/g, (_, g) => (virado ? `【${g}】` : '______'))}</div> : <div className="conteudo !p-0" dangerouslySetInnerHTML={{ __html: texto }} />}
        {it.tarefas && <ul className="list-disc pl-5 text-sm">{it.tarefas.map((t, k) => <li key={k}>{t.texto}</li>)}</ul>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">{(it.verso !== undefined || it.tipo === 'cloze') && <button type="button" className="btn contorno" onClick={() => setVirado((v) => !v)}>{virado ? 'Esconder resposta' : 'Mostrar resposta'} <kbd className="text-xs opacity-60">espaço</kbd></button>}<button type="button" className="btn contorno" onClick={() => { setUI({ dialogo: null }); irParaItem(it.id); }}>Ir ao item</button></div>
        <div className="flex gap-2"><button type="button" className="btn contorno perigo" onClick={() => responder(false)}>✗ Errei <kbd className="text-xs opacity-60">1</kbd></button><button type="button" className="btn primario" onClick={() => responder(true)}>✓ Acertei <kbd className="text-xs opacity-60">2</kbd></button></div>
      </div>
    </Modal>
  );
}

// ---------- Edital ----------
function DialogoEdital() {
  const edital = useLousa((l) => l.edital); const est = useLousa((l) => l.estudo); const [txt, setTxt] = useState('');
  const discs = [...new Set(edital.map((t) => t.disciplina))];
  const geral = edital.length ? Math.round(edital.reduce((s, t) => s + t.dominio, 0) / edital.length) : 0;
  const dias = est.dataProva ? Math.ceil((new Date(est.dataProva + 'T23:59:59').getTime() - Date.now()) / DIA_MS) : null;
  const criarRegioes = () => { if (!discs.length) return; const id = criarRegiaoCobrindoTela('Mural do edital'); const r = getEstado().lousa.doc.regioes[id]; aplicarDivisao(id, { metodo: 'edital', layout: { direcao: 'h', proporcoes: discs.map(() => 1 / discs.length) }, filhos: discs.map((d) => { const tops = edital.filter((t) => t.disciplina === d); return { nome: d, sub: tops.length ? { metodo: 'linhas', layout: { direcao: 'v', proporcoes: tops.map(() => 1 / tops.length) }, filhos: tops.map((t) => ({ nome: t.topico })) } : undefined }; }) }); enquadrar(r.bbox, 40, 2); setUI({ dialogo: null }); };
  const checklist = () => { const c = centroDaTelaNoMundo(); discs.forEach((d, i) => criarItem({ tipo: 'tarefas', x: c.x - 300 + i * 240, y: c.y, w: 220, h: 60 + edital.filter((t) => t.disciplina === d).length * 26, titulo: d, tarefas: edital.filter((t) => t.disciplina === d).map((t) => ({ texto: t.topico, feito: t.status === 'dominado' })) }, { selecionar: false })); setUI({ dialogo: null }); };
  return (
    <Modal titulo="Mapa do edital" largura={820}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><span>Domínio geral: <b>{geral}%</b></span><div className="barra-progresso w-40"><div style={{ width: `${geral}%` }} /></div>{dias !== null && <span className="chip">📅 {est.nomeProva || 'Prova'}: {dias > 0 ? `${dias} dias` : 'hoje!'}</span>}<span className="opacity-60">{edital.length} tópicos</span></div>
      <details className="mb-3"><summary className="cursor-pointer text-sm font-semibold">Colar ou digitar os tópicos do edital</summary>
        <textarea className="campo mt-2" rows={5} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'Formatos aceitos:\nPortuguês: crase, concordância, regência\nDIREITO CONSTITUCIONAL\n1. Direitos fundamentais\n2. Organização do Estado'} />
        <button type="button" className="btn primario mt-2" onClick={() => { if (txt.trim()) { importarEdital(txt); setTxt(''); } }}>Adicionar tópicos</button></details>
      <div className="max-h-80 overflow-auto">{discs.map((d) => { const tops = edital.filter((t) => t.disciplina === d); const pd = Math.round(tops.reduce((s, t) => s + t.dominio, 0) / tops.length); return (
        <div key={d} className="mb-2"><div className="flex items-center justify-between text-sm font-bold"><span>{d}</span><span>{pd}%</span></div><div className="barra-progresso mb-1" style={{ height: 5 }}><div style={{ width: `${pd}%` }} /></div>
          {tops.map((t) => <div key={t.id} className="flex items-center gap-2 py-0.5 text-sm"><span className="flex-1 truncate">{t.topico}</span><select className="campo !w-32 !py-0.5 text-xs" value={t.status} onChange={(e) => atualizarTopicoEdital(t.id, { status: e.target.value as StatusEstudo, dominio: e.target.value === 'dominado' ? 100 : t.dominio })}>{Object.entries(ROTULOS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><input type="range" min={0} max={100} value={t.dominio} className="w-24" onChange={(e) => atualizarTopicoEdital(t.id, { dominio: Number(e.target.value) })} aria-label={`Domínio de ${t.topico}`} /><span className="w-10 text-right text-xs tabular-nums">{t.dominio}%</span><button type="button" className="btn !min-h-6 !min-w-6 perigo text-xs" aria-label="Remover tópico" onClick={() => removerTopicoEdital(t.id)}>✕</button></div>)}
        </div>); })}</div>
      {edital.length > 0 && <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn primario" onClick={criarRegioes}>▦ Criar regiões na lousa (uma por disciplina e tópico)</button><button type="button" className="btn contorno" onClick={checklist}>☑ Criar checklists por disciplina</button><button type="button" className="btn contorno perigo" onClick={() => { if (window.confirm('Limpar todo o edital?')) setLousa(() => ({ edital: [] })); }}>Limpar</button></div>}
    </Modal>
  );
}

// ---------- Caderno de erros ----------
function DialogoErros() {
  const itens = useLousa((l) => l.doc.itens); const [disc, setDisc] = useState(''); const [motivo, setMotivo] = useState('');
  const erros = Object.values(itens).filter((i) => i.modelo === 'erro' || i.erro).map((i) => ({ i, e: i.erro ?? { disciplina: i.etiquetas[0] ?? '', assunto: '', banca: '', ano: '', oQueErrei: '', motivo: 'nao-sabia' as const, respostaCerta: '', fonte: '' } }));
  const lista = erros.filter(({ e }) => (!disc || e.disciplina === disc) && (!motivo || e.motivo === motivo));
  const contar = (f: (e: typeof erros[number]['e']) => string) => { const m = new Map<string, number>(); for (const x of erros) { const k = f(x.e) || '(sem)'; m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  return (
    <Modal titulo={`Caderno de erros (${erros.length})`} largura={820} rodape={<button type="button" className="btn primario" onClick={() => { const m = MODELOS_POSTIT.find((x) => x.id === 'erro')!; const c = centroDaTelaNoMundo(); criarItem({ tipo: 'postit', x: c.x - 110, y: c.y - 110, w: 220, h: 220, cor: m.cor, titulo: m.titulo, html: m.html, etiquetas: m.etiquetas, modelo: 'erro', camada: 'erros', erro: { disciplina: '', assunto: '', banca: '', ano: '', oQueErrei: '', motivo: 'nao-sabia', respostaCerta: '', fonte: '' } }, { selecionar: true, editar: true }); setUI({ dialogo: null, painel: 'propriedades' }); }}>＋ Registrar erro</button>}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 text-sm">
        <div><div className="rotulo mb-1">Por motivo</div>{contar((e) => ROTULOS_MOTIVO[e.motivo]).map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="w-36 truncate">{k}</span><div className="barra-progresso flex-1"><div style={{ width: `${(v / erros.length) * 100}%`, background: '#ef4444' }} /></div><span className="w-6 text-right">{v}</span></div>)}</div>
        <div><div className="rotulo mb-1">Por disciplina</div>{contar((e) => e.disciplina).map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="w-36 truncate">{k}</span><div className="barra-progresso flex-1"><div style={{ width: `${(v / erros.length) * 100}%` }} /></div><span className="w-6 text-right">{v}</span></div>)}</div>
      </div>
      <div className="mb-2 flex gap-2"><select className="campo !w-auto !py-1" value={disc} onChange={(e) => setDisc(e.target.value)}><option value="">Todas as disciplinas</option>{contar((e) => e.disciplina).map(([k]) => <option key={k} value={k}>{k}</option>)}</select><select className="campo !w-auto !py-1" value={motivo} onChange={(e) => setMotivo(e.target.value)}><option value="">Todos os motivos</option>{Object.entries(ROTULOS_MOTIVO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <ul className="max-h-72 overflow-auto text-sm">{lista.map(({ i, e }) => <li key={i.id} className="flex items-start gap-2 border-b py-1.5" style={{ borderColor: 'var(--ui-borda)' }}><span className="chip shrink-0">{ROTULOS_MOTIVO[e.motivo]}</span><button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setUI({ dialogo: null }); irParaItem(i.id); }}><b>{e.disciplina || '—'}</b> · {e.assunto || i.titulo} {e.banca && <span className="opacity-60">({e.banca} {e.ano})</span>}<span className="block truncate text-xs opacity-70">{e.oQueErrei || textoDoItem(i).slice(0, 80)}</span></button></li>)}</ul>
      {!erros.length && <p className="text-sm opacity-70">Nenhum erro registrado. Use o modelo "Erro de questão" ao errar uma questão: a dupla questões + caderno de erros é a mais forte para concurso.</p>}
    </Modal>
  );
}

// ---------- Questões e simulado ----------
function DialogoQuestoes() {
  const q = useLousa((l) => l.questoes); const [f, setF] = useState({ disciplina: '', assunto: '', acertos: 0, total: 10 }); const [simulado, setSimulado] = useState<{ inicio: number; duracao: number } | null>(null); const [, tick] = useState(0);
  useEffect(() => { if (!simulado) return; const t = window.setInterval(() => tick((x) => x + 1), 1000); return () => window.clearInterval(t); }, [simulado]);
  const porAssunto = useMemo(() => { const m = new Map<string, { a: number; t: number }>(); for (const x of q) { const k = `${x.disciplina} · ${x.assunto}`; const v = m.get(k) ?? { a: 0, t: 0 }; v.a += x.acertos; v.t += x.total; m.set(k, v); } return [...m.entries()].sort((a, b) => a[1].a / a[1].t - b[1].a / b[1].t); }, [q]);
  const restante = simulado ? Math.max(0, simulado.inicio + simulado.duracao - Date.now()) : 0;
  return (
    <Modal titulo="Questões e simulado" largura={720}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--ui-borda)' }}><div className="rotulo mb-2">Registrar bateria de questões</div>
          <div className="flex flex-col gap-2 text-sm"><input className="campo" placeholder="Disciplina" value={f.disciplina} onChange={(e) => setF({ ...f, disciplina: e.target.value })} /><input className="campo" placeholder="Assunto" value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} /><div className="flex gap-2"><label className="flex-1">Acertos <input type="number" className="campo" min={0} value={f.acertos} onChange={(e) => setF({ ...f, acertos: Number(e.target.value) })} /></label><label className="flex-1">Total <input type="number" className="campo" min={1} value={f.total} onChange={(e) => setF({ ...f, total: Number(e.target.value) })} /></label></div>
            <button type="button" className="btn primario" onClick={() => { if (!f.disciplina || f.total < 1) { avisar('Informe a disciplina e o total.'); return; } registrarQuestoes({ ...f, acertos: Math.min(f.acertos, f.total) }); if (f.acertos < f.total) avisar(`${f.total - f.acertos} erro(s): registre no caderno de erros!`, { rotulo: 'Abrir caderno', fn: () => setUI({ dialogo: { tipo: 'caderno-erros' } }) }); setF({ ...f, acertos: 0 }); }}>Registrar</button></div></div>
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--ui-borda)' }}><div className="rotulo mb-2">Cronômetro de simulado</div>
          {simulado ? <div className="text-center"><div className="text-4xl font-bold tabular-nums">{Math.floor(restante / 3600000)}:{String(Math.floor((restante % 3600000) / 60000)).padStart(2, '0')}:{String(Math.floor((restante % 60000) / 1000)).padStart(2, '0')}</div>{restante === 0 && <p className="text-sm" style={{ color: 'var(--ui-perigo)' }}>Tempo esgotado!</p>}<button type="button" className="btn contorno mt-2" onClick={() => setSimulado(null)}>Encerrar</button></div>
            : <div className="flex flex-wrap gap-2">{[60, 120, 180, 240, 300].map((m) => <button key={m} type="button" className="btn contorno" onClick={() => setSimulado({ inicio: Date.now(), duracao: m * 60000 })}>{m / 60}h</button>)}<button type="button" className="btn contorno" onClick={() => { const m = Number(window.prompt('Minutos', '90')); if (m > 0) setSimulado({ inicio: Date.now(), duracao: m * 60000 }); }}>Outro…</button></div>}</div>
      </div>
      <div className="mt-3"><div className="rotulo mb-1">Desempenho por assunto (piores primeiro)</div><ul className="max-h-48 overflow-auto text-sm">{porAssunto.map(([k, v]) => <li key={k} className="flex items-center gap-2 py-0.5"><span className="w-56 truncate">{k}</span><div className="barra-progresso flex-1"><div style={{ width: `${(v.a / v.t) * 100}%`, background: v.a / v.t < 0.6 ? '#ef4444' : v.a / v.t < 0.8 ? '#f59e0b' : '#16a34a' }} /></div><span className="w-20 text-right tabular-nums">{v.a}/{v.t} ({Math.round((v.a / v.t) * 100)}%)</span></li>)}</ul>{!q.length && <p className="text-sm opacity-70">Nenhuma bateria registrada.</p>}</div>
    </Modal>
  );
}

// ---------- Estatísticas ----------
function DialogoEstatisticas() {
  const itens = useLousa((l) => l.doc.itens); const lista = Object.values(itens);
  const porStatus = (Object.keys(ROTULOS_STATUS) as StatusEstudo[]).map((s) => [ROTULOS_STATUS[s], lista.filter((i) => i.status === s).length] as const);
  const porDisc = useMemo(() => { const m = new Map<string, number>(); for (const i of lista) m.set(i.etiquetas[0] ?? '(sem etiqueta)', (m.get(i.etiquetas[0] ?? '(sem etiqueta)') ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12); }, [lista]);
  const semana = agora() - 7 * DIA_MS; const revSemana = lista.reduce((s, i) => s + i.revisao.historico.filter((h) => h.data >= semana).length, 0); const acertosSemana = lista.reduce((s, i) => s + i.revisao.historico.filter((h) => h.data >= semana && h.acertou).length, 0);
  const maisErram = lista.map((i) => ({ i, e: i.revisao.historico.filter((h) => !h.acertou).length })).filter((x) => x.e > 0).sort((a, b) => b.e - a.e).slice(0, 8);
  const porDia = useMemo(() => { const dias: [string, number][] = []; for (let k = 6; k >= 0; k--) { const d = chaveDia(agora() - k * DIA_MS); dias.push([d.slice(5), lista.reduce((s, i) => s + i.revisao.historico.filter((h) => chaveDia(h.data) === d).length, 0)]); } return dias; }, [lista]);
  const max = Math.max(1, ...porDia.map((d) => d[1]));
  return (
    <Modal titulo="Estatísticas" largura={760}>
      <div className="grid gap-4 sm:grid-cols-2 text-sm">
        <div><div className="rotulo mb-1">Itens por status</div>{porStatus.map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="w-24">{k}</span><div className="barra-progresso flex-1"><div style={{ width: `${(v / (lista.length || 1)) * 100}%` }} /></div><span className="w-8 text-right">{v}</span></div>)}</div>
        <div><div className="rotulo mb-1">Itens por disciplina (1ª etiqueta)</div>{porDisc.map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="w-28 truncate">{k}</span><div className="barra-progresso flex-1"><div style={{ width: `${(v / (lista.length || 1)) * 100}%`, background: '#8b5cf6' }} /></div><span className="w-8 text-right">{v}</span></div>)}</div>
        <div><div className="rotulo mb-1">Revisões nos últimos 7 dias: {revSemana} ({revSemana ? Math.round((acertosSemana / revSemana) * 100) : 0}% de acerto)</div><div className="flex h-24 items-end gap-1">{porDia.map(([d, v]) => <div key={d} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t" style={{ height: `${(v / max) * 80}px`, background: 'var(--ui-acento)', minHeight: 2 }} /><span className="text-[10px]">{d}</span></div>)}</div></div>
        <div><div className="rotulo mb-1">Itens que você mais erra</div>{maisErram.length ? maisErram.map(({ i, e }) => <button key={i.id} type="button" className="flex w-full items-center gap-2 py-0.5 text-left" onClick={() => { setUI({ dialogo: null }); irParaItem(i.id); }}><span className="chip" style={{ borderColor: '#ef4444' }}>{e}✗</span><span className="truncate">{i.titulo || textoDoItem(i).slice(0, 50)}</span></button>) : <p className="opacity-70">Sem erros registrados em revisões.</p>}</div>
      </div>
    </Modal>
  );
}

// ---------- Lixeira / Backups ----------
function DialogoLixeira() {
  const lixeira = useLousa((l) => l.lixeira);
  return (
    <Modal titulo={`Lixeira (${lixeira.length}) · itens guardados por 30 dias`} largura={600} rodape={<button type="button" className="btn contorno perigo" onClick={() => { if (window.confirm('Esvaziar a lixeira definitivamente?')) esvaziarLixeira(); }}>Esvaziar</button>}>
      <ul className="max-h-80 overflow-auto text-sm">{lixeira.map((e) => <li key={e.item.id} className="flex items-center gap-2 border-b py-1.5" style={{ borderColor: 'var(--ui-borda)' }}><span className="inline-block h-3 w-3 rounded-sm" style={{ background: e.item.cor }} /><span className="min-w-0 flex-1 truncate">{e.item.titulo || textoDoItem(e.item).slice(0, 60) || e.item.tipo}</span><span className="text-xs opacity-60">{new Date(e.excluidoEm).toLocaleDateString('pt-BR')}</span><button type="button" className="btn contorno text-xs" onClick={() => restaurarDaLixeira(e.item.id)}>Restaurar</button></li>)}</ul>
      {!lixeira.length && <p className="opacity-70">A lixeira está vazia.</p>}
    </Modal>
  );
}
function DialogoBackups() {
  const [bs, setBs] = useState<Backup[] | null>(null); useEffect(() => { listarBackups().then(setBs); }, []);
  return (
    <Modal titulo="Backups internos" largura={600}>
      {!bs && <p>Carregando…</p>}
      <ul className="max-h-80 overflow-auto text-sm">{bs?.map((b) => <li key={b.id} className="flex items-center gap-2 border-b py-1.5" style={{ borderColor: 'var(--ui-borda)' }}><span className="min-w-0 flex-1 truncate">{b.nome}</span><span className="text-xs opacity-60">{Object.keys(b.lousa.doc.itens).length} itens</span><button type="button" className="btn contorno text-xs" onClick={() => { if (window.confirm('Restaurar este backup? A lousa atual será substituída (você pode desfazer exportando antes).')) { restaurarBackup(b.id); setUI({ dialogo: null }); } }}>Restaurar</button></li>)}</ul>
      {bs && !bs.length && <p className="opacity-70">Nenhum backup interno ainda. Eles são criados automaticamente a cada 10 minutos de uso.</p>}
    </Modal>
  );
}

// ---------- Modelos ----------
function DialogoModelos() {
  return (
    <Modal titulo="Modelos de post-it para concurso" largura={720}>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">{MODELOS_POSTIT.map((m) => <button key={m.id} type="button" className="rounded-xl p-3 text-left shadow" style={{ background: m.cor, color: '#1f2937' }} onClick={() => { const c = centroDaTelaNoMundo(); criarItem({ tipo: 'postit', x: c.x - 100, y: c.y - 100, cor: m.cor, titulo: m.titulo, html: m.html, verso: m.verso, etiquetas: m.etiquetas, modelo: m.id, camada: m.id === 'erro' ? 'erros' : m.id === 'duvida' ? 'duvidas' : 'principal', erro: m.id === 'erro' ? { disciplina: '', assunto: '', banca: '', ano: '', oQueErrei: '', motivo: 'nao-sabia', respostaCerta: '', fonte: '' } : undefined }, { selecionar: true, editar: true }); setUI({ dialogo: null }); }}><div className="text-lg">{m.icone} <b>{m.nome}</b></div><div className="mt-1 text-xs opacity-80" dangerouslySetInnerHTML={{ __html: m.html }} /></button>)}</div>
    </Modal>
  );
}

// ---------- Importar lista ----------
function DialogoImportarLista() {
  const [txt, setTxt] = useState(''); const [modo, setModo] = useState<'linha' | 'paragrafo' | 'topico'>('linha'); const regioes = useLousa((l) => l.doc.regioes); const [reg, setReg] = useState('');
  const itens = useMemo(() => { const t = txt.trim(); if (!t) return []; if (t.startsWith('[')) { try { const arr = JSON.parse(t); if (Array.isArray(arr)) return arr.slice(0, 500).map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x ? String(x.texto ?? x.text ?? x.frente ?? JSON.stringify(x)) : String(x))).map((s) => s.slice(0, 2000)); } catch { /* */ } } const tab = textoParaTabela(t); if (tab && tab[0].length >= 2 && /\.?csv|;|\t/.test(t)) return tab.map((l) => l.filter(Boolean).join(' — ')); return dividirTexto(t, modo); }, [txt, modo]);
  return (
    <Modal titulo="Importar lista (vários itens de uma vez)" largura={640} rodape={<button type="button" className="btn primario" disabled={!itens.length} onClick={() => { const r = reg ? regioes[reg] : null; const origem = r ? { x: r.bbox.x + 16, y: r.bbox.y + 48 } : centroDaTelaNoMundo(); criarItensEmLote(itens, origem, 'postit', r?.id ?? null); setUI({ dialogo: null }); }}>Criar {itens.length} post-its</button>}>
      <textarea className="campo" rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'Cole aqui: uma linha por item, CSV (separado por ; ou tab) ou JSON ["texto 1", "texto 2"]'} />
      <input type="file" accept=".txt,.md,.csv,.json,text/plain,text/csv,application/json" className="mt-2 text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setTxt((await f.text()).slice(0, 500000)); }} aria-label="Ou escolha um arquivo" />
      <div className="mt-2 flex flex-wrap gap-2 text-sm"><label>Separar por <select className="campo !inline !w-auto !py-1" value={modo} onChange={(e) => setModo(e.target.value as never)}><option value="linha">linha</option><option value="paragrafo">parágrafo</option><option value="topico">tópico/marcador</option></select></label><label>Região de destino <select className="campo !inline !w-auto !py-1" value={reg} onChange={(e) => setReg(e.target.value)}><option value="">(centro da tela)</option>{Object.values(regioes).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></label></div>
      <p className="mt-2 text-xs opacity-70">Pré-visualização: {itens.slice(0, 5).map((i) => `“${i.slice(0, 30)}”`).join(', ')}{itens.length > 5 ? ` e mais ${itens.length - 5}` : ''}</p>
    </Modal>
  );
}

// ---------- Apresentação ----------
function Apresentacao() {
  const regioes = useLousa((l) => l.doc.regioes); const ap = useUI((u) => u.apresentacao);
  const lista = useMemo(() => Object.values(regioes).filter((r) => !r.filhos.length || !r.pai).sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x), [regioes]);
  const i = ap?.indice ?? 0;
  useEffect(() => { const r = lista[i]; if (r) { enquadrar(r.bbox, 30, 3); setUI({ regiaoIsolada: r.id }); } }, [i, lista]);
  useEffect(() => { setVisualizacao({ modoFoco: true }); return () => { setVisualizacao({ modoFoco: false }); setUI({ regiaoIsolada: null, apresentacao: null }); }; }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) setUI({ apresentacao: { indice: Math.min(lista.length - 1, i + 1) } }); if (['ArrowLeft', 'PageUp'].includes(e.key)) setUI({ apresentacao: { indice: Math.max(0, i - 1) } }); if (e.key === 'Escape') setUI({ dialogo: null }); }; document.addEventListener('keydown', k, true); return () => document.removeEventListener('keydown', k, true); }, [i, lista.length]);
  if (!lista.length) return <Modal titulo="Apresentação"><p>Crie regiões primeiro: cada região vira um slide.</p></Modal>;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[300] flex justify-center">
      <div className="ui pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm">
        <button type="button" className="btn" onClick={() => setUI({ apresentacao: { indice: Math.max(0, i - 1) } })} aria-label="Anterior">◀</button>
        <span><b>{lista[i]?.nome}</b> · {i + 1}/{lista.length}</span>
        <button type="button" className="btn" onClick={() => setUI({ apresentacao: { indice: Math.min(lista.length - 1, i + 1) } })} aria-label="Próximo">▶</button>
        <button type="button" className="btn" onClick={() => setUI({ dialogo: null })} aria-label="Sair da apresentação">✕ Sair</button>
      </div>
    </div>
  );
}

// ---------- Imagem ----------
function DialogoImagem({ id }: { id: string }) {
  const it = useLousa((l) => l.doc.itens[id]); if (!it) return null;
  const r = it.recorte ?? { x: 0, y: 0, w: 1, h: 1 }; const set = (p: Partial<Retangulo>) => atualizarItem(id, { recorte: { ...r, ...p } }, false);
  return (
    <Modal titulo="Imagem: recorte, giro e opacidade" largura={480} rodape={<button type="button" className="btn primario" onClick={() => setUI({ dialogo: null })}>Concluir</button>}>
      <div className="flex flex-col gap-2 text-sm">
        {(['x', 'y', 'w', 'h'] as const).map((k) => <label key={k} className="flex items-center gap-2"><span className="w-28">{{ x: 'Recorte esquerda', y: 'Recorte topo', w: 'Largura visível', h: 'Altura visível' }[k]}</span><input type="range" min={k === 'w' || k === 'h' ? 0.05 : 0} max={1} step={0.01} value={r[k]} className="flex-1" onChange={(e) => set({ [k]: Number(e.target.value) })} /><span className="w-10 text-right">{Math.round(r[k] * 100)}%</span></label>)}
        <label className="flex items-center gap-2"><span className="w-28">Opacidade</span><input type="range" min={0} max={1} step={0.05} value={it.opacidade ?? 1} className="flex-1" onChange={(e) => atualizarItem(id, { opacidade: Number(e.target.value) }, false)} /></label>
        <label className="flex items-center gap-2"><span className="w-28">Giro</span><input type="range" min={-180} max={180} value={Math.round(it.angulo > 180 ? it.angulo - 360 : it.angulo)} className="flex-1" onChange={(e) => atualizarItem(id, { angulo: Number(e.target.value) }, false)} /></label>
        <button type="button" className="btn contorno self-start" onClick={() => atualizarItem(id, { recorte: undefined, opacidade: 1, angulo: 0 })}>Restaurar original</button>
      </div>
    </Modal>
  );
}

// ---------- Exportar ----------
function DialogoExportar({ mundoRef }: { mundoRef: React.RefObject<HTMLDivElement | null> }) {
  const regioes = useLousa((l) => l.doc.regioes); const [reg, setReg] = useState(''); const [ocupado, setOcupado] = useState(false);
  const run = async (fn: () => Promise<void>) => { setOcupado(true); try { await fn(); } finally { setOcupado(false); } };
  return (
    <Modal titulo="Exportar" largura={520}>
      <label className="mb-3 block text-sm">Área <select className="campo mt-1" value={reg} onChange={(e) => setReg(e.target.value)}><option value="">Lousa inteira</option>{Object.values(regioes).map((r) => <option key={r.id} value={r.id}>Região: {r.nome}</option>)}</select></label>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn contorno" disabled={ocupado} onClick={() => run(() => baixarPNG(mundoRef.current!, 1, reg || null))}>🖼️ PNG 1×</button>
        <button type="button" className="btn contorno" disabled={ocupado} onClick={() => run(() => baixarPNG(mundoRef.current!, 2, reg || null))}>🖼️ PNG 2× (nítido)</button>
        <button type="button" className="btn contorno" disabled={ocupado} onClick={() => run(() => imprimirPDF(mundoRef.current!, reg || null))}>📄 PDF (imprimir)</button>
        <button type="button" className="btn contorno" onClick={() => exportarJSON()}>💾 .json (backup completo)</button>
        <button type="button" className="btn contorno" onClick={() => exportarTexto('md')}>📝 Markdown por região</button>
        <button type="button" className="btn contorno" onClick={() => exportarTexto('txt')}>📄 Texto simples</button>
        <button type="button" className="btn contorno" onClick={exportarCSVCartoes}>🗃️ CSV dos cartões de revisão</button>
      </div>
      {ocupado && <p className="mt-2 text-sm">Gerando imagem… (com muitos itens pode levar alguns segundos)</p>}
      <p className="mt-3 text-xs opacity-70">A imagem inclui itens girados e as divisões. Fontes do sistema são usadas, por isso não há dependência de internet.</p>
    </Modal>
  );
}

export { pareceUrl, colarComoLink, moverPor, criarConector, gerarId, criarRegiaoRaiz };
