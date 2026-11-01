// ============================================================
// BARRA SUPERIOR + DOCK DE FERRAMENTAS + ZOOM + STATUS.
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MODELOS_POSTIT, PALETA, PASSOS_ZOOM, type TipoItem } from '../types';
import {
  alternarOcultarTudo, avisar, centroDaTelaNoMundo, criarItem, desfazer, dividirPorRegra, getEstado, refazer, setUI, setVisualizacao,
  useEstado, useLousa, useUI, verTudo, voltarInicio, zoomPara, type Ferramenta, caminhoRegiao, itensParaRevisar, salvarVisao, aplicarVisao, pararPomodoro, setLousa,
} from '../store';
import { criarItemImagem } from '../persistencia';
import { textoParaHtml } from '../utils/seguranca';
import { sincronizarTudo } from '../nuvem';
import {
  IcAjuda, IcBorracha, IcBusca, IcCamadas, IcComando, IcConector, IcConfig, IcDados, IcDesfazer, IcDividir, IcEnquadrar, IcEstudo, IcExportar, IcForma, IcInserir, IcLapis,
  IcLousas, IcLua, IcMais, IcMao, IcMarcador, IcMenos, IcModelos, IcNuvem, IcNuvemOff, IcOlho, IcOlhoFechado, IcPostit, IcProp, IcRefazer, IcRegiao, IcSelecionar, IcSol, IcSync, IcTexto,
} from './Icones';

export function Suspenso({ rotulo, titulo, children, alinhar = 'esquerda', classe = '', pressionado }: { rotulo: ReactNode; titulo: string; children: ReactNode | ((fechar: () => void) => ReactNode); alinhar?: 'esquerda' | 'direita'; classe?: string; pressionado?: boolean }) {
  const [aberto, setAberto] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!aberto) return; const f = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); }; document.addEventListener('pointerdown', f); document.addEventListener('keydown', k); return () => { document.removeEventListener('pointerdown', f); document.removeEventListener('keydown', k); }; }, [aberto]);
  return (
    <div ref={ref} className={`relative ${classe}`}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={aberto} aria-pressed={pressionado} title={titulo} aria-label={titulo} onClick={() => setAberto((a) => !a)}>{rotulo}</button>
      {aberto && <div className={`menu ui !absolute top-full mt-1 ${alinhar === 'direita' ? 'right-0' : 'left-0'}`} role="menu" style={{ position: 'absolute' }} onClick={(e) => { if ((e.target as HTMLElement).closest('[data-fechar]')) setAberto(false); }}>{typeof children === 'function' ? children(() => setAberto(false)) : children}</div>}
    </div>
  );
}
export const MI = ({ onClick, children, atalho, ativo, fechar = true, classe = '' }: { onClick: () => void; children: ReactNode; atalho?: string; ativo?: boolean; fechar?: boolean; classe?: string }) => (
  <button type="button" role="menuitem" data-fechar={fechar ? '1' : undefined} onClick={onClick} aria-pressed={ativo} className={`${ativo ? 'ativo' : ''} ${classe}`}><span className="flex-1">{children}</span>{atalho && <kbd>{atalho}</kbd>}{ativo && <span aria-hidden="true">✓</span>}</button>
);

const FERRAMENTAS: { id: Ferramenta; icone: ReactNode; nome: string; atalho: string; dica: string }[] = [
  { id: 'selecionar', icone: <IcSelecionar />, nome: 'Selecionar', atalho: 'V', dica: 'Clique para selecionar · arraste para mover · duplo clique no vazio cria um post-it' },
  { id: 'mao', icone: <IcMao />, nome: 'Mão (mover a lousa)', atalho: 'M', dica: 'Arraste para navegar · roda do mouse rola · Ctrl+roda dá zoom' },
  { id: 'postit', icone: <IcPostit />, nome: 'Post-it', atalho: 'N', dica: 'Clique ou arraste para criar um post-it · Shift mantém a ferramenta' },
  { id: 'texto', icone: <IcTexto />, nome: 'Texto livre', atalho: 'T', dica: 'Clique para inserir um texto sem fundo' },
  { id: 'forma', icone: <IcForma />, nome: 'Forma', atalho: 'S', dica: 'Arraste para desenhar a forma escolhida em Inserir' },
  { id: 'desenho', icone: <IcLapis />, nome: 'Desenho à mão livre', atalho: 'D', dica: 'Desenhe com o mouse ou a caneta' },
  { id: 'marcador', icone: <IcMarcador />, nome: 'Marca-texto', atalho: 'Shift+D', dica: 'Traço grosso e translúcido' },
  { id: 'borracha', icone: <IcBorracha />, nome: 'Borracha (apaga desenhos)', atalho: 'E', dica: 'Passe sobre os desenhos para apagá-los' },
  { id: 'conector', icone: <IcConector />, nome: 'Conector', atalho: 'C', dica: 'Arraste de um item até outro · solte no vazio para criar um post-it já ligado' },
  { id: 'regiao', icone: <IcRegiao />, nome: 'Região (área nomeada)', atalho: 'R', dica: 'Arraste para desenhar uma região; depois divida-a' },
];

export function Toolbar({ aoExportar }: { aoExportar: () => void }) {
  const ferramenta = useUI((u) => u.ferramenta); const corAtual = useUI((u) => u.corAtual); const painel = useUI((u) => u.painel); const hist = useUI((u) => u.historico);
  const vis = useLousa((l) => l.visualizacao); const camera = useLousa((l) => l.camera); const nome = useLousa((l) => l.nome); const visoes = useLousa((l) => l.visoesSalvas); const tema = useLousa((l) => l.config.tema);
  const mostrarInterface = useUI((u) => u.mostrarInterface); const barraRapida = useUI((u) => u.barraRapida); const nuvem = useUI((u) => u.nuvem);
  const inputImagem = useRef<HTMLInputElement>(null);
  const pendentes = useEstado((e) => itensParaRevisar(e.lousa).length);
  const [editandoNome, setEditandoNome] = useState(false);
  const setFerramenta = (f: Ferramenta) => setUI({ ferramenta: f, pontosPoligono: [] });
  const inserir = (tipo: TipoItem, extra: Record<string, unknown> = {}) => { const c = centroDaTelaNoMundo(); criarItem({ tipo, x: c.x - 100, y: c.y - 80, ...extra } as never, { selecionar: true, editar: ['postit', 'texto', 'titulo', 'caixa', 'cloze'].includes(tipo) }); };
  const modeloPostit = (id: string) => { const m = MODELOS_POSTIT.find((x) => x.id === id)!; const c = centroDaTelaNoMundo(); criarItem({ tipo: m.tipo ?? 'postit', x: c.x - 100, y: c.y - 100, cor: m.cor, titulo: m.titulo, html: m.html, verso: m.verso, etiquetas: m.etiquetas, modelo: m.id, camada: m.id === 'erro' ? 'erros' : m.id === 'duvida' ? 'duvidas' : 'principal', erro: m.id === 'erro' ? { disciplina: '', assunto: '', banca: '', ano: '', oQueErrei: '', motivo: 'nao-sabia', respostaCerta: '', fonte: '' } : undefined }, { selecionar: true, editar: true }); };
  const togglePainel = (p: NonNullable<typeof painel>) => setUI({ painel: painel === p ? null : p });
  const alternarTema = () => setLousa((l) => ({ config: { ...l.config, tema: l.config.tema === 'escuro' ? 'claro' : 'escuro', temaAuto: false } }));
  if (!mostrarInterface || vis.modoFoco) return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex justify-center p-2"><button type="button" className="btn ui vidro pointer-events-auto rounded-full !px-4 text-xs" onClick={() => { setVisualizacao({ modoFoco: false }); setUI({ mostrarInterface: true }); }}>Sair do modo foco <kbd>Shift+F</kbd></button></div>
  );
  const dicaAtual = FERRAMENTAS.find((f) => f.id === ferramenta)?.dica;
  const Nuvem = nuvem.status === 'conectada' || nuvem.status === 'sincronizando' ? IcNuvem : IcNuvemOff;
  return (
    <>
      <header className="barra-topo ui vidro" role="toolbar" aria-label="Barra de ferramentas" style={{ boxShadow: 'none' }}>
        <button type="button" className="btn marca !px-2" title="Minhas lousas" onClick={() => setUI({ dialogo: { tipo: 'lousas' } })}><span className="logo" aria-hidden="true">🗒️</span><span className="hidden sm:inline">Lousa</span></button>
        <div className="separador" />
        {editandoNome ? (
          <input autoFocus className="campo !w-48 !py-1 text-sm font-semibold" defaultValue={nome} maxLength={80} aria-label="Nome da lousa" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== nome) setLousa(() => ({ nome: v })); setEditandoNome(false); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditandoNome(false); }} />
        ) : (
          <button type="button" className="btn hidden max-w-56 truncate text-sm font-semibold md:inline-flex" title="Clique para renomear a lousa" onClick={() => setEditandoNome(true)}>{nome}</button>
        )}
        <div className="separador hidden md:block" />
        <button type="button" className="btn icone" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" onClick={desfazer} disabled={!hist.passado}><IcDesfazer /></button>
        <button type="button" className="btn icone" title="Refazer (Ctrl+Y)" aria-label="Refazer" onClick={refazer} disabled={!hist.futuro}><IcRefazer /></button>
        <div className="separador" />
        <Suspenso rotulo={<span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-full border shadow-sm" style={{ background: corAtual }} /><span className="hidden text-xs lg:inline">Cor</span></span>} titulo="Cor dos novos post-its">
          <div className="titulo-menu">Cor dos novos post-its</div>
          <div className="grid grid-cols-5 gap-1.5 p-2">{PALETA.map((c) => <button key={c.cor} type="button" data-fechar="1" className="h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-110" style={{ background: c.cor, outline: corAtual === c.cor ? '2px solid var(--selecao)' : undefined, outlineOffset: 2 }} title={c.nome} aria-label={c.nome} onClick={() => { setUI({ corAtual: c.cor }); const sel = getEstado().ui.selecao; if (sel.length) import('../store').then((s) => s.atualizarItens(sel, () => ({ cor: c.cor }))); }} />)}</div>
          <p className="px-3 pb-2 text-xs opacity-60">Com itens selecionados, a cor é aplicada a eles também.</p>
        </Suspenso>
        <Suspenso rotulo={<span className="flex items-center gap-1"><IcInserir /><span className="hidden lg:inline">Inserir</span></span>} titulo="Inserir item">
          <MI onClick={() => inserir('postit')} atalho="N">🗒️ Post-it</MI>
          <MI onClick={() => inserir('texto')} atalho="T">🔤 Texto livre</MI>
          <MI onClick={() => inserir('titulo')}>𝐓 Título grande</MI>
          <MI onClick={() => inserir('caixa')}>▭ Caixa com borda</MI>
          <MI onClick={() => inserir('tarefas')}>☑ Lista de tarefas</MI>
          <MI onClick={() => inserir('tabela')}>▦ Tabela</MI>
          <MI onClick={() => inputImagem.current?.click()}>🖼️ Imagem…</MI>
          <MI onClick={() => { const url = window.prompt('Endereço do site (https://…)'); if (url) import('../store').then((s) => s.colarComoLink(url.trim(), centroDaTelaNoMundo())); }}>🔗 Cartão de link…</MI>
          <MI onClick={() => inserir('cloze', { html: 'A {{lacuna}} aparece ao clicar.' })}>⬚ Frase com lacunas</MI>
          <hr />
          <div className="titulo-menu">Formas</div>
          <div className="grid grid-cols-4 gap-1 px-2 pb-1">{[['retangulo', '▭'], ['elipse', '⬭'], ['losango', '◇'], ['triangulo', '△'], ['estrela', '☆'], ['chave', '{'], ['seta', '➜'], ['hexagono', '⬡']].map(([f, ic]) => <button key={f} type="button" data-fechar="1" className="btn contorno" title={f} aria-label={`Forma ${f}`} onClick={() => { setUI({ formaAtual: f }); inserir('forma', { forma: f, cor: corAtual }); }}>{ic}</button>)}</div>
          <hr />
          <MI onClick={() => inserir('contador', { titulo: 'Questões hoje' })}>🔢 Contador</MI>
          <MI onClick={() => inserir('fita')}>🩹 Fita adesiva</MI>
          <MI onClick={() => inserir('pino')}>📍 Pino</MI>
          <div className="titulo-menu">Carimbos</div>
          <div className="flex flex-wrap gap-1 px-2 pb-1">{['importante', 'revisar', 'cai-muito', 'decorar', 'ok', 'erro', 'urgente', 'duvida'].map((c) => <button key={c} type="button" data-fechar="1" className="chip" onClick={() => inserir('carimbo', { carimbo: c, cor: ['ok'].includes(c) ? '#16a34a' : ['revisar', 'duvida'].includes(c) ? '#2563eb' : '#dc2626' })}>{c.replace('-', ' ')}</button>)}</div>
          <hr />
          <MI onClick={() => setUI({ dialogo: { tipo: 'modelos' } })}>📋 Modelos de post-it…</MI>
          <MI onClick={() => setUI({ dialogo: { tipo: 'importar-lista' } })}>📥 Importar lista (texto, CSV, JSON)…</MI>
          <MI onClick={() => setUI({ barraRapida: !barraRapida })} ativo={barraRapida}>⚡ Barra de criação rápida</MI>
        </Suspenso>
        <Suspenso rotulo={<span className="flex items-center gap-1"><IcModelos /><span className="hidden lg:inline">Modelos</span></span>} titulo="Modelos de post-it para concurso">
          <div className="titulo-menu">Modelos prontos</div>
          {MODELOS_POSTIT.map((m) => <MI key={m.id} onClick={() => modeloPostit(m.id)}><span className="inline-block h-3 w-3 rounded-sm" style={{ background: m.cor }} /> {m.icone} {m.nome}</MI>)}
        </Suspenso>
        <Suspenso rotulo={<span className="flex items-center gap-1"><IcDividir /><span className="hidden lg:inline">Dividir</span></span>} titulo="Subdividir a lousa">
          <MI onClick={() => setUI({ dialogo: { tipo: 'dividir', regiaoId: getEstado().ui.regiaoSelecionada } })}>▦ Catálogo de divisões…</MI>
          <MI onClick={() => setFerramenta('regiao')} atalho="R">▭ Desenhar uma região (arrastar)</MI>
          <MI onClick={() => setFerramenta('linha-divisao')}>╱ Traçar linha de divisão (arrastar)</MI>
          <MI onClick={() => setFerramenta('poligono')}>⬠ Polígono livre (clicar pontos)</MI>
          <MI onClick={() => setFerramenta('laco')}>➰ Laço à mão livre</MI>
          <hr />
          <div className="titulo-menu">Por regra (automática)</div>
          <MI onClick={() => dividirPorRegra(getEstado().ui.regiaoSelecionada, 'etiqueta')}>🏷️ Uma coluna por etiqueta</MI>
          <MI onClick={() => dividirPorRegra(getEstado().ui.regiaoSelecionada, 'status')}>◐ Por status</MI>
          <MI onClick={() => dividirPorRegra(getEstado().ui.regiaoSelecionada, 'data')}>📅 Por data de revisão</MI>
          <hr />
          <MI onClick={() => togglePainel('regioes')}>🗺️ Painel de regiões</MI>
        </Suspenso>
        <div className="flex-1" />
        <button type="button" className="btn icone" title="Buscar (/)" aria-label="Buscar" onClick={() => togglePainel('busca')} aria-pressed={painel === 'busca'}><IcBusca /></button>
        <Suspenso rotulo={<span className="flex items-center gap-1"><IcOlho /><span className="hidden xl:inline">Visualizar</span></span>} titulo="Modos de visualização" alinhar="direita">
          <div className="titulo-menu">Modos</div>
          <MI onClick={() => setVisualizacao({ modo: 'so-lousa', ocultarTudo: false })} ativo={vis.modo === 'so-lousa'}>1. Só a lousa</MI>
          <MI onClick={() => setVisualizacao({ modo: 'lousa-anotacoes', ocultarTudo: false })} ativo={vis.modo === 'lousa-anotacoes'}>2. Lousa e anotações</MI>
          <MI onClick={() => setVisualizacao({ modo: 'lousa-postits', ocultarTudo: false })} ativo={vis.modo === 'lousa-postits'}>3. Lousa e post-its</MI>
          <MI onClick={() => setVisualizacao({ modo: 'tudo', ocultarTudo: false, destacarTipo: null, tiposOcultos: [] })} ativo={vis.modo === 'tudo' && !vis.ocultarTudo}>4. Tudo</MI>
          <MI onClick={() => togglePainel('camadas')}>5. Filtrar por cor, etiqueta, região ou status…</MI>
          <MI onClick={() => { setVisualizacao({ modoFoco: true }); avisar('Modo foco: Shift+F para sair'); }}>6. Modo foco</MI>
          <MI onClick={() => { setVisualizacao({ modoProva: !vis.modoProva }); setUI({ placarProva: { acertos: 0, erros: 0 } }); }} ativo={vis.modoProva}>7. Modo prova (autoteste)</MI>
          <hr />
          <MI onClick={() => setVisualizacao({ mostrarRegioes: !vis.mostrarRegioes })} ativo={vis.mostrarRegioes} fechar={false}>Divisões</MI>
          <MI onClick={() => setVisualizacao({ mostrarRotulos: !vis.mostrarRotulos })} ativo={vis.mostrarRotulos} fechar={false}>Rótulos das regiões</MI>
          <MI onClick={() => setVisualizacao({ mostrarConectores: !vis.mostrarConectores })} ativo={vis.mostrarConectores} fechar={false}>Conectores</MI>
          <MI onClick={() => setVisualizacao({ minimapa: !vis.minimapa })} ativo={vis.minimapa} fechar={false}>Minimapa</MI>
          <MI onClick={() => setVisualizacao({ legenda: !vis.legenda })} ativo={vis.legenda} fechar={false}>Legenda de cores</MI>
          <MI onClick={() => setVisualizacao({ reguas: !vis.reguas })} ativo={vis.reguas} fechar={false}>Réguas</MI>
          <hr />
          <div className="titulo-menu">Visões salvas</div>
          {visoes.map((v) => <MI key={v.id} onClick={() => aplicarVisao(v.id)}>⭐ {v.nome}</MI>)}
          <MI onClick={() => { const n = window.prompt('Nome da visão (ex.: Estudo, Revisão)'); if (n) salvarVisao(n.slice(0, 40)); }}>＋ Salvar visão atual…</MI>
        </Suspenso>
        <button type="button" className="btn icone" aria-pressed={vis.ocultarTudo} title="Ocultar tudo o que está sobre a lousa (H)" aria-label="Ocultar tudo" onClick={alternarOcultarTudo}>{vis.ocultarTudo ? <IcOlhoFechado /> : <IcOlho />}</button>
        <div className="separador" />
        <button type="button" className="btn icone relative" title="Estudo: revisar hoje, caderno de erros, edital" aria-label="Painel de estudo" aria-pressed={painel === 'estudo'} onClick={() => togglePainel('estudo')}><IcEstudo />{pendentes > 0 && <span className="absolute -right-1 -top-1 rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: 'var(--ui-perigo)' }}>{pendentes}</span>}</button>
        <button type="button" className="btn icone" title="Propriedades do item selecionado" aria-label="Propriedades" aria-pressed={painel === 'propriedades'} onClick={() => togglePainel('propriedades')}><IcProp /></button>
        <button type="button" className="btn icone hidden sm:inline-flex" title="Camadas e filtros" aria-label="Camadas" aria-pressed={painel === 'camadas'} onClick={() => togglePainel('camadas')}><IcCamadas /></button>
        <button type="button" className="btn icone" title={`Dados, backup e nuvem (${nuvem.status === 'conectada' ? 'nuvem conectada' : nuvem.status === 'sincronizando' ? 'sincronizando' : nuvem.status === 'desativada' ? 'nuvem desativada' : 'só local'})`} aria-label="Dados" aria-pressed={painel === 'dados'} onClick={() => togglePainel('dados')}><IcDados /></button>
        <button type="button" className="btn icone" title="Configurações e aparência" aria-label="Configurações" aria-pressed={painel === 'config'} onClick={() => togglePainel('config')}><IcConfig /></button>
        <button type="button" className="btn icone hidden sm:inline-flex" title="Exportar imagem/PDF" aria-label="Exportar" onClick={aoExportar}><IcExportar /></button>
        <button type="button" className="btn icone hidden md:inline-flex" title={tema === 'escuro' ? 'Tema claro' : 'Tema escuro'} aria-label="Alternar tema" onClick={alternarTema}>{tema === 'escuro' ? <IcSol /> : <IcLua />}</button>
        <button type="button" className="btn icone hidden md:inline-flex" title="Paleta de comandos (Ctrl+K)" aria-label="Paleta de comandos" onClick={() => setUI({ dialogo: { tipo: 'paleta' } })}><IcComando /></button>
        <button type="button" className="btn icone" title="Ajuda e atalhos (?)" aria-label="Ajuda" onClick={() => setUI({ dialogo: { tipo: 'ajuda' } })}><IcAjuda /></button>
        <input ref={inputImagem} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const c = centroDaTelaNoMundo(); await criarItemImagem(f, { x: c.x - 150, y: c.y - 100 }); } e.target.value = ''; }} />
      </header>

      {/* Dock de ferramentas */}
      <nav className="dock ui vidro" aria-label="Ferramentas">
        {FERRAMENTAS.map((f, i) => (
          <span key={f.id} className="contents">
            {(i === 2 || i === 5 || i === 8) && <span className="sep" />}
            <button type="button" className="btn" aria-pressed={ferramenta === f.id} title={`${f.nome} (${f.atalho})`} aria-label={f.nome} onClick={() => setFerramenta(f.id)}>{f.icone}<span className="tecla">{f.atalho.replace('Shift+', '⇧')}</span></button>
          </span>
        ))}
      </nav>
      {ferramenta !== 'selecionar' && dicaAtual && <div className="dica-ferramenta ui vidro hidden md:block">{dicaAtual} · <kbd>Esc</kbd> volta a selecionar</div>}

      {/* Zoom */}
      <div className="zoom-ctl ui vidro hidden md:flex" aria-label="Zoom">
        <button type="button" className="btn" title="Aumentar zoom (+)" aria-label="Aumentar zoom" onClick={() => zoomPara(camera.zoom * 1.2)}><IcMais /></button>
        <Suspenso alinhar="direita" rotulo={<span className="tabular-nums text-xs font-semibold">{Math.round(camera.zoom * 100)}%</span>} titulo="Nível de zoom">
          {PASSOS_ZOOM.map((z) => <MI key={z} onClick={() => zoomPara(z)} ativo={Math.abs(camera.zoom - z) < 0.01}>{z * 100}%</MI>)}
          <hr /><MI onClick={verTudo} atalho="Shift+1">Ver tudo</MI><MI onClick={voltarInicio} atalho="Shift+0">Voltar ao início</MI>
        </Suspenso>
        <button type="button" className="btn" title="Diminuir zoom (−)" aria-label="Diminuir zoom" onClick={() => zoomPara(camera.zoom / 1.2)}><IcMenos /></button>
        <button type="button" className="btn" title="Ver tudo (Shift+1)" aria-label="Ver tudo" onClick={verTudo}><IcEnquadrar /></button>
      </div>

      {barraRapida && <BarraRapida />}
      <BarraInferior />
      <BarraStatus Nuvem={Nuvem} />
    </>
  );
}

function BarraRapida() {
  const ref = useRef<HTMLInputElement>(null); const [n, setN] = useState(0);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="ui vidro absolute left-1/2 top-16 z-40 flex w-[min(560px,92vw)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1.5 surgir">
      <span aria-hidden="true">⚡</span>
      <input ref={ref} className="flex-1 bg-transparent outline-none" placeholder="Digite e aperte Enter para criar post-its em sequência (Esc fecha)" aria-label="Criação rápida de post-its" onKeyDown={(e) => {
        if (e.key === 'Escape') setUI({ barraRapida: false });
        if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (!v) return; const c = centroDaTelaNoMundo(); const cols = 4; const r = getEstado().ui.regiaoSelecionada ? getEstado().lousa.doc.regioes[getEstado().ui.regiaoSelecionada!] : null; const base = r ? { x: r.bbox.x + 16, y: r.bbox.y + 48 } : { x: c.x - 2 * 216, y: c.y - 100 }; criarItem({ tipo: 'postit', x: base.x + (n % cols) * 216, y: base.y + Math.floor(n / cols) * 216, w: 200, h: 200, html: textoParaHtml(v), regiao: r?.id }, { selecionar: false }); setN(n + 1); (e.target as HTMLInputElement).value = ''; }
      }} />
      <span className="text-xs opacity-60">{n} criados</span>
      <button type="button" className="btn !min-h-7 text-xs" aria-label="Fechar barra rápida" onClick={() => setUI({ barraRapida: false })}>✕</button>
    </div>
  );
}

function BarraInferior() {
  const ferramenta = useUI((u) => u.ferramenta); const vis = useLousa((l) => l.visualizacao);
  const itens: { id: Ferramenta | 'dividir'; icone: ReactNode; nome: string }[] = [{ id: 'selecionar', icone: <IcSelecionar />, nome: 'Selec.' }, { id: 'mao', icone: <IcMao />, nome: 'Mão' }, { id: 'postit', icone: <IcPostit />, nome: 'Post-it' }, { id: 'texto', icone: <IcTexto />, nome: 'Texto' }, { id: 'desenho', icone: <IcLapis />, nome: 'Desenho' }, { id: 'conector', icone: <IcConector />, nome: 'Conectar' }, { id: 'dividir', icone: <IcDividir />, nome: 'Dividir' }];
  if (vis.modoFoco) return null;
  return (
    <nav className="ui absolute bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around md:hidden" aria-label="Ferramentas (celular)" style={{ borderWidth: '1px 0 0 0' }}>
      {itens.map((f) => <button key={f.id} type="button" className="btn flex-1 flex-col !gap-0.5 !min-w-0 !min-h-11 !px-0 overflow-hidden text-[9px]" aria-pressed={ferramenta === f.id} aria-label={f.nome} onClick={() => (f.id === 'dividir' ? setUI({ dialogo: { tipo: 'dividir', regiaoId: getEstado().ui.regiaoSelecionada } }) : setUI({ ferramenta: f.id as Ferramenta }))}>{f.icone}{f.nome}</button>)}
      <button type="button" className="btn flex-1 flex-col !gap-0.5 !min-w-0 !min-h-11 !px-0 overflow-hidden text-[9px]" aria-label="Zoom para ver tudo" onClick={verTudo}><IcEnquadrar />Ver tudo</button>
    </nav>
  );
}

function BarraStatus({ Nuvem }: { Nuvem: typeof IcNuvem }) {
  const salvando = useUI((u) => u.salvando); const outraAba = useUI((u) => u.outraAba); const sel = useUI((u) => u.selecao); const regSel = useUI((u) => u.regiaoSelecionada); const pomodoro = useUI((u) => u.pomodoro); const placar = useUI((u) => u.placarProva); const nuvem = useUI((u) => u.nuvem);
  const camera = useLousa((l) => l.camera); const qtd = useLousa((l) => Object.keys(l.doc.itens).length); const vis = useLousa((l) => l.visualizacao); const regioes = useLousa((l) => l.doc.regioes); const itens = useLousa((l) => l.doc.itens); const estudo = useLousa((l) => l.estudo);
  const [, tick] = useState(0); useEffect(() => { if (pomodoro.fase === 'parado') return; const t = window.setInterval(() => tick((x) => x + 1), 1000); return () => window.clearInterval(t); }, [pomodoro.fase]);
  const restante = pomodoro.fim ? Math.max(0, pomodoro.fim - Date.now()) : 0;
  useEffect(() => { if (pomodoro.fase !== 'parado' && pomodoro.fim && Date.now() >= pomodoro.fim) { avisar(pomodoro.fase === 'foco' ? 'Fim do bloco de foco. Faça uma pausa!' : 'Pausa encerrada. Bons estudos!'); pararPomodoro(); } });
  const caminho = caminhoRegiao(regSel ?? (sel.length === 1 ? itens[sel[0]]?.regiao ?? null : null), regioes).join(' › ');
  const diasProva = estudo.dataProva ? Math.ceil((new Date(estudo.dataProva + 'T23:59:59').getTime() - Date.now()) / 86_400_000) : null;
  if (vis.modoFoco) return null;
  const rotuloNuvem = nuvem.status === 'conectada' ? (nuvem.modo === 'local' ? 'Sincronizado com o banco local do servidor' : 'Nuvem sincronizada') : nuvem.status === 'sincronizando' ? 'Sincronizando…' : nuvem.status === 'desativada' ? 'Nuvem desativada · só local' : nuvem.status === 'verificando' ? 'Verificando nuvem…' : nuvem.status === 'erro' ? 'Erro na nuvem · dados locais seguros' : 'Sem nuvem · salvando localmente';
  const classeNuvem = nuvem.status === 'conectada' ? 'ok' : nuvem.status === 'sincronizando' ? 'sync' : nuvem.status === 'erro' ? 'erro' : 'off';
  return (
    <footer className="barra-status ui vidro" style={{ boxShadow: 'none' }} aria-label="Barra de status">
      <span className="tabular-nums font-semibold">{Math.round(camera.zoom * 100)}%</span>
      <span>{qtd} itens{sel.length ? ` · ${sel.length} selecionados` : ''}</span>
      <span className="hidden truncate opacity-70 md:inline" title="Caminho da região">{caminho}</span>
      {vis.ocultarTudo && <span className="chip perigo">Itens ocultos · H para mostrar</span>}
      {vis.modoProva && <span className="chip acento">Modo prova · ✓ {placar.acertos} ✗ {placar.erros}</span>}
      {pomodoro.fase !== 'parado' && <span className="chip acento">{pomodoro.fase === 'foco' ? '🍅 Foco' : '☕ Pausa'} {Math.floor(restante / 60000)}:{String(Math.floor((restante % 60000) / 1000)).padStart(2, '0')}</span>}
      {diasProva !== null && <span className="chip hidden sm:inline-flex">📅 {diasProva > 0 ? `${diasProva} dias para a prova` : 'Dia da prova!'}</span>}
      <span className="flex-1" />
      {outraAba && <span className="chip aviso" title="Outra aba desta lousa está aberta. Para não sobrescrever dados, use só uma aba.">⚠ Outra aba aberta</span>}
      <button type="button" className="btn !min-h-6 !px-2 text-xs" title={`${rotuloNuvem}${nuvem.ultimaSync ? ` · última: ${new Date(nuvem.ultimaSync).toLocaleTimeString('pt-BR')}` : ''} · clique para sincronizar agora`} onClick={() => sincronizarTudo(true)} aria-label={rotuloNuvem}>
        <span className={`ponto-status ${classeNuvem}`} /><Nuvem width={14} height={14} /><span className="hidden lg:inline">{nuvem.status === 'conectada' ? (nuvem.modo === 'local' ? 'Servidor local' : 'Nuvem') : nuvem.status === 'sincronizando' ? 'Sincronizando' : 'Local'}</span>{nuvem.status === 'sincronizando' && <IcSync width={12} height={12} className="animate-spin" />}
      </button>
      <span aria-live="polite" className="tabular-nums">{salvando === 'ok' ? '✓ Salvo' : salvando === 'salvando' ? 'Salvando…' : salvando === 'erro' ? '⚠ Erro ao salvar' : salvando === 'indisponivel' ? '⚠ Sem armazenamento local' : ''}</span>
    </footer>
  );
}
