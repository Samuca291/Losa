// ============================================================
// APP: monta a lousa, a interface fixa (fora da câmera) e os
// serviços (persistência, atalhos, tema, nuvem).
// ============================================================
import { useEffect, useRef } from 'react';
import { Lousa } from './components/Lousa';
import { Toolbar } from './components/Toolbar';
import { PainelLateral } from './components/Paineis';
import { Dialogos, MenuContexto } from './components/Dialogos';
import { useAtalhos } from './hooks/useAtalhos';
import { inicializar } from './persistencia';
import { fecharToast, setUI, useEstado, useLousa, useUI, criarItem, centroDaTelaNoMundo, getEstado, setLousa } from './store';
import { carregarExemplo } from './exemplo';
import { IcFechar } from './components/Icones';
import { BarraFormatacao } from './components/BarraFormatacao';

export default function App() {
  const mundoRef = useRef<HTMLDivElement>(null);
  const config = useLousa((l) => l.config); const toasts = useUI((u) => u.toasts); const anuncio = useUI((u) => u.anuncio); const carregado = useUI((u) => u.carregado);
  const vazio = useEstado((e) => Object.keys(e.lousa.doc.itens).length === 0 && Object.keys(e.lousa.doc.regioes).length === 0);
  const editando = useUI((u) => u.editando); const painel = useUI((u) => u.painel); const vis = useLousa((l) => l.visualizacao); const legenda = useLousa((l) => l.legenda); const modoFoco = vis.modoFoco; const boasVindasFechada = useUI((u) => u.boasVindasFechada);
  useAtalhos(mundoRef);
  useEffect(() => { inicializar(); (window as unknown as { __lousaEstado: typeof getEstado }).__lousaEstado = getEstado; }, []);
  // Tema (com opção de seguir o sistema)
  useEffect(() => {
    const root = document.documentElement; const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const aplicar = () => { root.dataset.tema = config.temaAuto && mq ? (mq.matches ? 'escuro' : 'claro') : config.tema; };
    aplicar(); root.dataset.animacoes = config.animacoes ? '1' : '0'; root.dataset.sombra = config.sombraPostit === false ? '0' : '1'; root.style.setProperty('--escala', String(config.escalaInterface)); root.lang = 'pt-BR';
    mq?.addEventListener?.('change', aplicar); return () => mq?.removeEventListener?.('change', aplicar);
  }, [config.tema, config.temaAuto, config.animacoes, config.escalaInterface, config.sombraPostit]);
  useEffect(() => { document.documentElement.dataset.painel = painel ? '1' : '0'; }, [painel]);
  useEffect(() => { document.title = 'Lousa Digital de Estudos'; }, []);
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ fontSize: `calc(14px * ${config.escalaInterface})` }}>
      <Lousa mundoRef={mundoRef} />
      <Toolbar aoExportar={() => setUI({ dialogo: { tipo: 'exportar' } })} />
      <PainelLateral aoExportar={() => setUI({ dialogo: { tipo: 'exportar' } })} />
      {editando && <BarraFormatacao id={editando} />}
      {vis.legenda && legenda.length > 0 && !modoFoco && (
        <div className="ui vidro absolute left-3 bottom-10 z-30 rounded-xl px-3 py-2 text-xs md:bottom-10" aria-label="Legenda de cores" data-nao-exportar="1">
          <div className="rotulo mb-1">Legenda</div>
          {legenda.map((l, i) => <div key={i} className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm border" style={{ background: l.cor }} />{l.significado}</div>)}
        </div>
      )}
      {vis.ocultarTudo && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm shadow surgir" style={{ background: 'rgba(17,24,39,0.85)', color: '#fff' }} role="status">Itens ocultos · pressione <kbd className="!bg-white/20 !text-white !border-white/30">H</kbd> para mostrar</div>
      )}
      {carregado && vazio && !boasVindasFechada && <TelaInicial />}
      <Dialogos mundoRef={mundoRef} />
      <MenuContexto />
      {/* Avisos */}
      <div className="pointer-events-none fixed bottom-20 left-1/2 z-[400] flex w-[min(520px,92vw)] -translate-x-1/2 flex-col gap-2 md:bottom-24" aria-label="Avisos">
        {toasts.map((t) => <div key={t.id} className={`toast ui vidro surgir ${t.tipo ?? ''}`} role={t.tipo === 'erro' ? 'alert' : 'status'}><span aria-hidden="true">{t.tipo === 'erro' ? '⚠️' : t.tipo === 'ok' ? '✅' : 'ℹ️'}</span><span className="flex-1 text-sm">{t.texto}</span>{t.acao && <button type="button" className="btn primario !min-h-7 text-xs" onClick={() => { t.acao!.fn(); fecharToast(t.id); }}>{t.acao.rotulo}</button>}<button type="button" className="btn !min-h-7 !min-w-7 text-xs" aria-label="Fechar aviso" onClick={() => fecharToast(t.id)}><IcFechar width={14} height={14} /></button></div>)}
      </div>
      <div className="visualmente-oculto" aria-live="polite" aria-atomic="true">{anuncio}</div>
    </div>
  );
}

function TelaInicial() {
  const nuvem = useUI((u) => u.nuvem); const lousas = useUI((u) => u.lousas);
  const outras = lousas.filter((l) => l.id !== getEstado().lousa.id && l.qtdItens > 0).slice(0, 3);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="ui boas-vindas relative overflow-hidden">
        <button type="button" className="btn icone absolute right-2 top-2 z-10" aria-label="Fechar boas-vindas" title="Fechar (você pode começar com duplo clique na lousa)" onClick={() => setUI({ boasVindasFechada: true })}><IcFechar /></button>
        <span className="postit-demo" style={{ background: '#fff176', left: -14, top: 26, ['--rot' as string]: '-8deg', animation: 'flutuar 5s ease-in-out infinite' }} aria-hidden="true" />
        <span className="postit-demo" style={{ background: '#90caf9', right: -10, top: 60, ['--rot' as string]: '7deg', animation: 'flutuar 6s ease-in-out infinite 0.6s' }} aria-hidden="true" />
        <span className="postit-demo" style={{ background: '#f8bbd0', right: 40, bottom: -18, ['--rot' as string]: '-4deg', animation: 'flutuar 7s ease-in-out infinite 1.2s', width: 48, height: 48 }} aria-hidden="true" />
        <h1 className="text-2xl font-extrabold tracking-tight">Lousa Digital de Estudos</h1>
        <p className="mx-auto mt-1 max-w-md text-sm opacity-70">Um mural infinito de post-its para organizar a matéria do concurso. Salvo no seu navegador{nuvem.status === 'conectada' ? ' e espelhado na nuvem' : ''}.</p>
        <div className="mt-5 flex flex-col gap-2">
          <div className="passo"><span className="num">1</span><span className="text-sm"><b>Duplo clique em qualquer lugar vazio</b> cria um post-it. <b>Duplo clique em um post-it</b> abre para editar. Colar texto (Ctrl+V) também cria.</span></div>
          <div className="passo"><span className="num">2</span><span className="text-sm"><b>Conecte ideias</b> arrastando (ou clicando) a bolinha <span className="inline-grid h-4 w-4 place-items-center rounded-full border-2 align-middle text-[10px] font-black" style={{ borderColor: 'var(--selecao)', color: 'var(--selecao)' }}>+</span> na borda de um post-it até outro — a linha desvia dos demais e salta onde cruza outra. Solte no vazio para criar um já ligado.</span></div>
          <div className="passo"><span className="num">3</span><span className="text-sm"><b>Divida a lousa</b> (grade, Cornell, mapa mental…) e <b>estude de verdade</b>: cartões frente/verso, lacunas, revisão espaçada e caderno de erros. <kbd>?</kbd> mostra os atalhos.</span></div>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn primario" onClick={() => { const c = centroDaTelaNoMundo(); criarItem({ tipo: 'postit', x: c.x - 100, y: c.y - 100 }, { selecionar: true, editar: true }); }}>🗒️ Criar o primeiro post-it</button>
          <button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'dividir', regiaoId: null } })}>▦ Dividir a lousa</button>
          <button type="button" className="btn contorno" onClick={carregarExemplo}>Ver um exemplo</button>
        </div>
        {outras.length > 0 && <div className="mt-4 border-t pt-3 text-left text-xs" style={{ borderColor: 'var(--ui-borda)' }}><div className="rotulo mb-1">Continuar de onde parou</div>{outras.map((l) => <button key={l.id} type="button" className="btn w-full justify-between !px-2 text-sm" onClick={() => import('./persistencia').then((p) => p.trocarLousa(l.id))}><span className="truncate">{l.origem === 'nuvem' ? '☁️ ' : ''}{l.nome}</span><span className="opacity-60">{l.qtdItens} itens</span></button>)}</div>}
      </div>
    </div>
  );
}

export { setLousa };
