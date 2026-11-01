// ============================================================
// PAINÉIS LATERAIS: propriedades, camadas, regiões, estudo,
// dados, configurações e busca. Tudo também por clique/teclado.
// ============================================================
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FONTES, PALETA, ROTULOS_MOTIVO, ROTULOS_STATUS, TAMANHOS_POSTIT, type Item, type Regiao, type StatusEstudo, type TipoItem } from '../types';
import {
  agrupar, alinhar, ativarRevisao, atualizarCamada, atualizarConector, atualizarItem, atualizarItens, atualizarRegiao, avisar, bagunçar, criarCamada, desagrupar,
  distribuir, dividirAoMeio, dividirPorRegra, duplicarItens, duplicarRegiao, empilhar, excluirCamada, excluirConector, excluirItens, excluirVisao, getEstado, girarPor, irParaItem,
  irParaRegiao, itensParaRevisar, mesclarRegioes, moverParaCamada, moverPor, nomeTipo, ordenarZ, organizarPor, registrarRevisao, removerRegiao, reordenarCamada, salvarModeloDivisao,
  especDaRegiao, selecionarPor, setLousa, setUI, setVisualizacao, tenteLembrar, trocarRegioes, useLousa, useUI, caminhoRegiao, profundidadeRegiao, iniciarPomodoro, pararPomodoro,
  reatribuirRegioes, enquadrar, descendentes, textoDoItem, DIA_MS, agora, chaveDia,
} from '../store';
import { exportarCSVCartoes, exportarJSON, exportarTexto, importarJSON, criarBackup, atualizarEspaco, salvarAgora } from '../persistencia';
import { formatarBytes, pedirPersistencia } from '../utils/db';
import { gerarTesteCarga } from '../exemplo';
import { definirSincronizacao, sincronizarTudo, verificarNuvem } from '../nuvem';
import { IcBusca, IcCamadas, IcConfig, IcDados, IcEstudo, IcFechar, IcNuvem, IcNuvemOff, IcProp, IcRegioes, IcSync } from './Icones';
import { PainelConfig } from './PainelConfig';

const Secao = ({ titulo, children, aberta = true }: { titulo: string; children: ReactNode; aberta?: boolean }) => (
  <details open={aberta} className="secao"><summary className="rotulo">{titulo}</summary><div className="flex flex-col gap-2 pt-1">{children}</div></details>
);
const Linha = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;
const Campo = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => <label className="flex flex-1 flex-col gap-1 text-xs"><span className="opacity-70">{rotulo}</span>{children}</label>;
const Num = ({ valor, aoMudar, passo = 1, min, max, rotulo }: { valor: number; aoMudar: (v: number) => void; passo?: number; min?: number; max?: number; rotulo: string }) => (
  <Campo rotulo={rotulo}><input type="number" className="campo !py-1" value={Math.round(valor * 100) / 100} step={passo} min={min} max={max} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) aoMudar(v); }} aria-label={rotulo} /></Campo>
);
const Chk = ({ marcado, aoMudar, children }: { marcado: boolean; aoMudar: (v: boolean) => void; children: ReactNode }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} /> {children}</label>;

export function PainelLateral({ aoExportar }: { aoExportar: () => void }) {
  const painel = useUI((u) => u.painel);
  if (!painel) return null;
  const titulos = { propriedades: 'Propriedades', camadas: 'Camadas e filtros', regioes: 'Regiões', estudo: 'Estudo para concurso', dados: 'Dados e backup', busca: 'Buscar', config: 'Configurações' };
  const abas: { id: NonNullable<typeof painel>; icone: ReactNode }[] = [{ id: 'propriedades', icone: <IcProp /> }, { id: 'regioes', icone: <IcRegioes /> }, { id: 'camadas', icone: <IcCamadas /> }, { id: 'estudo', icone: <IcEstudo /> }, { id: 'busca', icone: <IcBusca /> }, { id: 'dados', icone: <IcDados /> }, { id: 'config', icone: <IcConfig /> }];
  return (
    <aside className="painel-lateral" aria-label={titulos[painel]}>
      <div className="abas" role="tablist" aria-label="Painéis">
        {abas.map((a) => <button key={a.id} type="button" role="tab" className="btn" aria-selected={painel === a.id} aria-pressed={painel === a.id} title={titulos[a.id]} aria-label={titulos[a.id]} onClick={() => setUI({ painel: a.id })}>{a.icone}</button>)}
        <button type="button" className="btn !flex-none" aria-label="Fechar painel" title="Fechar (Esc)" onClick={() => setUI({ painel: null })}><IcFechar /></button>
      </div>
      <div className="cabecalho"><strong>{titulos[painel]}</strong></div>
      {painel === 'propriedades' && <Propriedades />}
      {painel === 'camadas' && <Camadas />}
      {painel === 'regioes' && <PainelRegioes />}
      {painel === 'estudo' && <PainelEstudo />}
      {painel === 'dados' && <PainelDados aoExportar={aoExportar} />}
      {painel === 'busca' && <PainelBusca />}
      {painel === 'config' && <PainelConfig />}
    </aside>
  );
}

// ---------------- PROPRIEDADES ----------------
function Propriedades() {
  const sel = useUI((u) => u.selecao); const conId = useUI((u) => u.conectorSelecionado); const regId = useUI((u) => u.regiaoSelecionada);
  const itens = useLousa((l) => l.doc.itens);
  const selecionados = sel.map((id) => itens[id]).filter(Boolean);
  if (conId) return <PropConector id={conId} />;
  if (selecionados.length) return <PropItens itens={selecionados} />;
  if (regId) return <PropRegiao id={regId} />;
  return <div className="p-4 text-sm opacity-70">Selecione um item, um conector ou uma região para ver as propriedades. Dica: clique no rótulo de uma região para selecioná-la.</div>;
}

function PropItens({ itens }: { itens: Item[] }) {
  const it = itens[0]; const ids = itens.map((i) => i.id); const multi = itens.length > 1;
  const camadas = useLousa((l) => l.doc.camadas); const regioes = useLousa((l) => l.doc.regioes); const favoritas = useLousa((l) => l.config.coresFavoritas);
  const itensTodos = useLousa((l) => l.doc.itens); const todasEtiquetas = useMemo(() => [...new Set(Object.values(itensTodos).flatMap((i) => i.etiquetas))].sort(), [itensTodos]);
  const patch = (p: Partial<Item>) => atualizarItens(ids, () => p);
  return (
    <div>
      <Secao titulo={multi ? `${itens.length} itens selecionados` : nomeTipo(it.tipo)}>
        {!multi && <Campo rotulo="Título curto"><input className="campo" value={it.titulo} maxLength={120} onChange={(e) => atualizarItem(it.id, { titulo: e.target.value }, false)} onBlur={() => atualizarItem(it.id, {}, true)} /></Campo>}
        <div className="grid grid-cols-8 gap-1">{[...PALETA.map((p) => p.cor), ...favoritas].map((c) => <button key={c} type="button" className="h-7 w-7 rounded-md border" style={{ background: c, outline: it.cor === c ? '2px solid var(--selecao)' : undefined }} aria-label={`Cor ${c}`} onClick={() => patch({ cor: c })} />)}
          <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border text-xs" title="Cor livre">🎨<input type="color" className="sr-only" value={it.cor.startsWith('#') ? it.cor : '#ffffff'} onChange={(e) => patch({ cor: e.target.value })} aria-label="Cor livre" /></label>
          <button type="button" className="h-7 w-7 rounded-md border text-xs" title="Guardar cor como favorita" aria-label="Guardar cor como favorita" onClick={() => setLousa((l) => ({ config: { ...l.config, coresFavoritas: [...new Set([...l.config.coresFavoritas, it.cor])].slice(0, 16) } }))}>★</button>
          <button type="button" className="h-7 w-7 rounded-md border text-xs" title="Sem fundo" aria-label="Sem fundo" onClick={() => patch({ cor: 'transparent' })}>∅</button></div>
        <Linha>
          <Campo rotulo="Fonte"><select className="campo !py-1" value={it.fonte} onChange={(e) => patch({ fonte: e.target.value })}>{FONTES.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}</select></Campo>
          <Num rotulo="Tamanho" valor={it.tamanhoFonte} min={8} max={120} aoMudar={(v) => patch({ tamanhoFonte: v })} />
          <Campo rotulo="Cor do texto"><input type="color" className="campo !h-8 !p-0.5" value={it.corTexto ?? '#1f2937'} onChange={(e) => patch({ corTexto: e.target.value })} /></Campo>
        </Linha>
        <Linha><Chk marcado={it.autoAjuste} aoMudar={(v) => patch({ autoAjuste: v })}>Ajustar altura ao texto</Chk></Linha>
      </Secao>
      <Secao titulo="Posição, tamanho e ângulo">
        <Linha><Num rotulo="X" valor={it.x} aoMudar={(v) => patch({ x: v })} /><Num rotulo="Y" valor={it.y} aoMudar={(v) => patch({ y: v })} /><Num rotulo="Largura" valor={it.w} min={20} aoMudar={(v) => patch({ w: v })} /><Num rotulo="Altura" valor={it.h} min={20} aoMudar={(v) => patch({ h: v, autoAjuste: false })} /></Linha>
        <Linha><Num rotulo="Ângulo (graus)" valor={it.angulo} aoMudar={(v) => patch({ angulo: ((v % 360) + 360) % 360 })} />
          <button type="button" className="btn contorno" onClick={() => girarPor(ids, -15)} aria-label="Girar 15 graus à esquerda">↺ 15°</button>
          <button type="button" className="btn contorno" onClick={() => girarPor(ids, 15)} aria-label="Girar 15 graus à direita">↻ 15°</button>
          <button type="button" className="btn contorno" onClick={() => patch({ angulo: 0 })}>Zerar</button></Linha>
        <Linha><span className="text-xs opacity-70">Mover:</span>
          {[['←', -10, 0], ['→', 10, 0], ['↑', 0, -10], ['↓', 0, 10]].map(([r, dx, dy]) => <button key={r as string} type="button" className="btn contorno" aria-label={`Mover ${r}`} onClick={() => moverPor(ids, dx as number, dy as number)}>{r}</button>)}
          <span className="text-xs opacity-70">Tamanho:</span>{Object.entries(TAMANHOS_POSTIT).map(([k, t]) => <button key={k} type="button" className="btn contorno text-xs" onClick={() => patch({ w: t.w, h: t.h })}>{k[0].toUpperCase()}</button>)}</Linha>
        <Linha>
          <Campo rotulo="Camada"><select className="campo !py-1" value={it.camada} onChange={(e) => moverParaCamada(ids, e.target.value)}>{camadas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <Campo rotulo="Mover para região"><select className="campo !py-1" value={it.regiao ?? ''} onChange={(e) => { const r = regioes[e.target.value]; if (!r) { patch({ regiao: null }); return; } atualizarItens(ids, (x) => ({ regiao: r.id, x: r.bbox.x + 20 + Math.random() * Math.max(0, r.bbox.w - x.w - 40), y: r.bbox.y + 44 + Math.random() * Math.max(0, r.bbox.h - x.h - 60) })); }}><option value="">(nenhuma)</option>{Object.values(regioes).map((r) => <option key={r.id} value={r.id}>{'· '.repeat(profundidadeRegiao(r.id, regioes))}{r.nome}</option>)}</select></Campo>
        </Linha>
        <Linha><Chk marcado={it.travado} aoMudar={(v) => patch({ travado: v })}>🔒 Travado</Chk><Chk marcado={it.fixado} aoMudar={(v) => patch({ fixado: v })}>📌 Fixado</Chk><Chk marcado={it.oculto} aoMudar={(v) => patch({ oculto: v })}>Oculto</Chk></Linha>
        <Linha>
          <button type="button" className="btn contorno" onClick={() => ordenarZ(ids, 'frente')}>Trazer para frente</button><button type="button" className="btn contorno" onClick={() => ordenarZ(ids, 'tras')}>Enviar para trás</button>
          <button type="button" className="btn contorno" onClick={() => duplicarItens(ids)}>Duplicar</button><button type="button" className="btn contorno perigo" onClick={() => excluirItens(ids)}>Excluir</button>
        </Linha>
      </Secao>
      <Secao titulo="Estudo">
        <Linha>
          <Campo rotulo="Status"><select className="campo !py-1" value={it.status} onChange={(e) => patch({ status: e.target.value as StatusEstudo })}>{Object.entries(ROTULOS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo rotulo="Etiquetas (vírgula)"><input className="campo !py-1" list="lista-etiquetas" defaultValue={it.etiquetas.join(', ')} key={it.id + it.etiquetas.join()} onBlur={(e) => patch({ etiquetas: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} placeholder="Disciplina, assunto, banca…" /><datalist id="lista-etiquetas">{todasEtiquetas.map((e) => <option key={e} value={e} />)}</datalist></Campo>
        </Linha>
        <Linha>
          <Chk marcado={it.revisao.ativa} aoMudar={(v) => ids.forEach((id) => ativarRevisao(id, v))}>↻ Revisão espaçada</Chk>
          {it.revisao.ativa && <span className="text-xs">próxima: <input type="date" className="campo !inline !w-auto !py-0.5" value={it.revisao.proxima ? new Date(it.revisao.proxima).toISOString().slice(0, 10) : ''} onChange={(e) => atualizarItem(it.id, { revisao: { ...it.revisao, proxima: new Date(e.target.value + 'T09:00:00').getTime() } })} aria-label="Data da próxima revisão" /></span>}
        </Linha>
        {it.revisao.ativa && <Linha><button type="button" className="btn contorno" style={{ color: '#16a34a' }} onClick={() => ids.forEach((id) => registrarRevisao(id, true))}>✓ Acertei</button><button type="button" className="btn contorno perigo" onClick={() => ids.forEach((id) => registrarRevisao(id, false))}>✗ Errei</button><span className="text-xs opacity-70">{it.revisao.historico.length} revisões</span></Linha>}
        <Linha>
          {it.verso === undefined ? <button type="button" className="btn contorno" onClick={() => patch({ verso: '' })}>🔁 Virar em cartão (frente e verso)</button> : <><button type="button" className="btn contorno" onClick={() => patch({ virado: !it.virado })}>{it.virado ? 'Ver frente' : 'Ver verso'}</button><button type="button" className="btn contorno" onClick={() => patch({ verso: undefined, virado: false })}>Remover verso</button></>}
          <button type="button" className="btn contorno" onClick={() => ids.forEach((id) => tenteLembrar(id))}>🙈 Tente lembrar (8 s)</button>
          <button type="button" className="btn contorno" onClick={() => setUI({ conexoesDe: getEstado().ui.conexoesDe === it.id ? null : it.id })}>🕸️ Conexões</button>
        </Linha>
        {it.modelo === 'erro' && <PropErro it={it} />}
      </Secao>
      {!multi && it.tipo === 'imagem' && <Secao titulo="Imagem"><Num rotulo="Opacidade (0 a 1)" valor={it.opacidade ?? 1} passo={0.05} min={0} max={1} aoMudar={(v) => patch({ opacidade: v })} /><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'imagem', id: it.id } })}>✂️ Recortar / ampliar</button></Secao>}
      {!multi && it.tipo === 'link' && <Secao titulo="Link"><Campo rotulo="Título"><input className="campo" value={it.titulo} onChange={(e) => atualizarItem(it.id, { titulo: e.target.value }, false)} /></Campo><Campo rotulo="Endereço (http/https)"><input className="campo" defaultValue={it.url} key={it.id} onBlur={(e) => { const v = e.target.value.trim(); if (/^https?:\/\//i.test(v)) patch({ url: v }); else avisar('Use um endereço que comece com http:// ou https://'); }} /></Campo></Secao>}
      {!multi && it.tipo === 'tabela' && <Secao titulo="Tabela"><Linha>
        <button type="button" className="btn contorno" onClick={() => patch({ tabela: [...(it.tabela ?? []), Array((it.tabela?.[0] ?? ['']).length).fill('')] })}>+ linha</button>
        <button type="button" className="btn contorno" onClick={() => patch({ tabela: (it.tabela ?? []).map((l) => [...l, '']) })}>+ coluna</button>
        <button type="button" className="btn contorno" onClick={() => patch({ tabela: (it.tabela ?? []).slice(0, -1) })}>− linha</button>
        <button type="button" className="btn contorno" onClick={() => patch({ tabela: (it.tabela ?? []).map((l) => l.slice(0, -1)) })}>− coluna</button></Linha></Secao>}
      {!multi && it.tipo === 'forma' && <Secao titulo="Forma"><select className="campo" value={it.forma} onChange={(e) => patch({ forma: e.target.value })}>{['retangulo', 'elipse', 'losango', 'triangulo', 'estrela', 'chave', 'seta', 'hexagono', 'pentagono', 'nuvem', 'balao', 'coracao', 'cruz'].map((f) => <option key={f} value={f}>{f}</option>)}</select></Secao>}
      {!multi && it.tipo === 'carimbo' && <Secao titulo="Carimbo"><select className="campo" value={it.carimbo} onChange={(e) => patch({ carimbo: e.target.value })}>{['importante', 'revisar', 'cai-muito', 'decorar', 'ok', 'erro', 'urgente', 'duvida', 'aprovado'].map((f) => <option key={f} value={f}>{f}</option>)}</select></Secao>}
      {multi && <Secao titulo="Organizar vários">
        <Linha><span className="text-xs opacity-70">Alinhar:</span>{(['esquerda', 'centro', 'direita', 'topo', 'meio', 'base'] as const).map((a) => <button key={a} type="button" className="btn contorno text-xs" onClick={() => alinhar(ids, a)}>{a}</button>)}</Linha>
        <Linha><span className="text-xs opacity-70">Distribuir:</span><button type="button" className="btn contorno text-xs" onClick={() => distribuir(ids, 'h')}>horizontal</button><button type="button" className="btn contorno text-xs" onClick={() => distribuir(ids, 'v')}>vertical</button></Linha>
        <Linha><span className="text-xs opacity-70">Empilhar:</span>{(['coluna', 'linha', 'grade', 'cascata'] as const).map((m) => <button key={m} type="button" className="btn contorno text-xs" onClick={() => empilhar(ids, m)}>{m}</button>)}</Linha>
        <Linha><span className="text-xs opacity-70">Organizar por:</span>{(['cor', 'etiqueta', 'data', 'alfabetica', 'status'] as const).map((m) => <button key={m} type="button" className="btn contorno text-xs" onClick={() => organizarPor(ids, m)}>{m}</button>)}</Linha>
        <Linha><button type="button" className="btn contorno" onClick={() => agrupar(ids)}>Agrupar (Ctrl+G)</button><button type="button" className="btn contorno" onClick={() => desagrupar(ids)}>Desagrupar</button><button type="button" className="btn contorno" onClick={() => bagunçar(ids)}>🎲 Bagunçar ângulos</button><button type="button" className="btn contorno" onClick={() => patch({ angulo: 0 })}>Endireitar</button></Linha>
      </Secao>}
    </div>
  );
}

function PropErro({ it }: { it: Item }) {
  const e = it.erro!; const set = (p: Partial<NonNullable<Item['erro']>>) => atualizarItem(it.id, { erro: { ...e, ...p } }, false);
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-2 text-xs" style={{ borderColor: 'var(--ui-borda)' }}>
      <strong>Caderno de erros</strong>
      <Linha><Campo rotulo="Disciplina"><input className="campo !py-1" value={e.disciplina} onChange={(x) => set({ disciplina: x.target.value })} /></Campo><Campo rotulo="Assunto"><input className="campo !py-1" value={e.assunto} onChange={(x) => set({ assunto: x.target.value })} /></Campo></Linha>
      <Linha><Campo rotulo="Banca"><input className="campo !py-1" value={e.banca} onChange={(x) => set({ banca: x.target.value })} /></Campo><Campo rotulo="Ano"><input className="campo !py-1" value={e.ano} onChange={(x) => set({ ano: x.target.value })} /></Campo>
        <Campo rotulo="Por que errei"><select className="campo !py-1" value={e.motivo} onChange={(x) => set({ motivo: x.target.value as never })}>{Object.entries(ROTULOS_MOTIVO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo></Linha>
      <Campo rotulo="O que errei"><input className="campo !py-1" value={e.oQueErrei} onChange={(x) => set({ oQueErrei: x.target.value })} /></Campo>
      <Campo rotulo="Resposta certa"><input className="campo !py-1" value={e.respostaCerta} onChange={(x) => set({ respostaCerta: x.target.value })} /></Campo>
      <Campo rotulo="Base legal / fonte"><input className="campo !py-1" value={e.fonte} onChange={(x) => set({ fonte: x.target.value })} /></Campo>
    </div>
  );
}

function PropConector({ id }: { id: string }) {
  const c = useLousa((l) => l.doc.conectores[id]); const itens = useLousa((l) => l.doc.itens); if (!c) return null;
  const nome = (iid: string) => { const it = itens[iid]; if (!it) return '—'; return it.titulo || textoDoItem(it).slice(0, 28) || nomeTipo(it.tipo); };
  return (
    <div>
      <Secao titulo="Conector">
        <div className="rota-conector">
          <button type="button" className="ponta" title="Ir para a origem" onClick={() => irParaItem(c.de)}><span className="rotulo">De</span><span className="truncate">{nome(c.de)}</span></button>
          <button type="button" className="btn icone" title="Inverter direção" aria-label="Inverter direção" onClick={() => import('../store').then((s) => s.inverterConector(id))}>⇄</button>
          <button type="button" className="ponta" title="Ir para o destino" onClick={() => irParaItem(c.para)}><span className="rotulo">Para</span><span className="truncate">{nome(c.para)}</span></button>
        </div>
        <p className="text-xs opacity-60">Para religar uma ponta, arraste a bolinha na extremidade da linha até outro item.</p>
        <Campo rotulo="Rótulo (ex.: exceção de, depende de, prazo para)"><input className="campo" value={c.rotulo} maxLength={60} placeholder="Sem rótulo" onChange={(e) => atualizarConector(id, { rotulo: e.target.value })} list="rotulos-conector" /><datalist id="rotulos-conector">{['exceção de', 'depende de', 'prazo para', 'regra geral', 'cai junto com', 'contrasta com', 'causa', 'consequência', 'exemplo', 'ver também'].map((r) => <option key={r} value={r} />)}</datalist></Campo>
        <Linha><Campo rotulo="Estilo"><div className="segmentado">{([['curvo', '⌒ Curvo'], ['reto', '╱ Reto'], ['angulo', '⌐ Ângulo']] as const).map(([v, r]) => <button key={v} type="button" aria-pressed={c.estilo === v} onClick={() => atualizarConector(id, { estilo: v })}>{r}</button>)}</div></Campo></Linha>
        <Linha>
          <Campo rotulo="Cor"><div className="flex items-center gap-1">{['#475569', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777'].map((cor) => <button key={cor} type="button" className="h-6 w-6 rounded-full border" style={{ background: cor, outline: c.cor === cor ? '2px solid var(--selecao)' : undefined, outlineOffset: 2 }} aria-label={`Cor ${cor}`} onClick={() => atualizarConector(id, { cor })} />)}<input type="color" className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" value={c.cor} aria-label="Cor livre" onChange={(e) => atualizarConector(id, { cor: e.target.value })} /></div></Campo>
          <Num rotulo="Espessura" valor={c.espessura} min={1} max={12} aoMudar={(v) => atualizarConector(id, { espessura: v })} />
        </Linha>
        <Linha><Chk marcado={c.tracejado} aoMudar={(v) => atualizarConector(id, { tracejado: v })}>Tracejado</Chk><Chk marcado={c.setaFim} aoMudar={(v) => atualizarConector(id, { setaFim: v })}>Seta no fim</Chk><Chk marcado={c.setaInicio} aoMudar={(v) => atualizarConector(id, { setaInicio: v })}>Seta no início</Chk></Linha>
        <Linha><button type="button" className="btn contorno" onClick={() => setUI({ conexoesDe: c.de })}>🕸️ Ver conexões da origem</button><button type="button" className="btn contorno perigo" onClick={() => excluirConector(id)}>🗑 Excluir</button></Linha>
      </Secao>
      <Secao titulo="Padrões para novos conectores" aberta={false}>
        <p className="text-xs opacity-70">Estilo, cor, desvio de obstáculos e saltos ficam em <b>Configurações → Conectores</b>.</p>
        <Linha><button type="button" className="btn contorno" onClick={() => setUI({ painel: 'config' })}>Abrir configurações</button></Linha>
      </Secao>
    </div>
  );
}

export function PropRegiao({ id }: { id: string }) {
  const regioes = useLousa((l) => l.doc.regioes); const r = regioes[id]; const modelos = useLousa((l) => l.modelosDivisao);
  if (!r) return null;
  const set = (p: Partial<Regiao>) => atualizarRegiao(id, p); const est = (p: Partial<Regiao['estilo']>) => atualizarRegiao(id, { estilo: { ...r.estilo, ...p } });
  const irmaos = r.pai ? regioes[r.pai].filhos.filter((f) => f !== id) : Object.values(regioes).filter((x) => !x.pai && x.id !== id).map((x) => x.id);
  return (
    <div>
      <div className="px-3 pt-2 text-xs opacity-70">{caminhoRegiao(id, regioes).join(' › ')}</div>
      <Secao titulo="Região">
        <Campo rotulo="Título"><input className="campo" value={r.nome} maxLength={120} onChange={(e) => atualizarRegiao(id, { nome: e.target.value }, false)} onBlur={() => atualizarRegiao(id, {}, true)} /></Campo>
        <Linha><Campo rotulo="Cor"><input type="color" className="campo !h-8 !p-0.5" value={r.estilo.cor} onChange={(e) => est({ cor: e.target.value })} /></Campo><Num rotulo="Transparência (0 a 1)" valor={r.estilo.opacidade} passo={0.05} min={0} max={1} aoMudar={(v) => est({ opacidade: v })} /><Campo rotulo="Ícone"><input className="campo !py-1" value={r.estilo.icone} maxLength={4} placeholder="📚" onChange={(e) => est({ icone: e.target.value })} /></Campo></Linha>
        <Linha><Campo rotulo="Borda"><input type="color" className="campo !h-8 !p-0.5" value={r.estilo.corBorda} onChange={(e) => est({ corBorda: e.target.value })} /></Campo><Num rotulo="Espessura" valor={r.estilo.espessuraBorda} min={0} max={20} aoMudar={(v) => est({ espessuraBorda: v })} />
          <Campo rotulo="Estilo"><select className="campo !py-1" value={r.estilo.estiloBorda} onChange={(e) => est({ estiloBorda: e.target.value as never })}><option value="solida">Sólida</option><option value="tracejada">Tracejada</option><option value="pontilhada">Pontilhada</option><option value="dupla">Dupla</option></select></Campo></Linha>
        <Linha><Num rotulo="Cantos" valor={r.estilo.raio} min={0} max={100} aoMudar={(v) => est({ raio: v })} /><Campo rotulo="Padrão de fundo"><select className="campo !py-1" value={r.estilo.padrao} onChange={(e) => est({ padrao: e.target.value as never })}><option value="nenhum">Nenhum</option><option value="listras">Listras</option><option value="pontos">Pontos</option><option value="grade">Grade</option></select></Campo><Num rotulo="Ângulo do rótulo" valor={r.estilo.rotuloAngulo} min={-90} max={90} aoMudar={(v) => est({ rotuloAngulo: v })} /></Linha>
        <Linha><Chk marcado={r.estilo.mostrarTitulo} aoMudar={(v) => est({ mostrarTitulo: v })}>Mostrar título</Chk><Chk marcado={r.estilo.numerar} aoMudar={(v) => est({ numerar: v })}>Numerar</Chk></Linha>
        <Linha><Chk marcado={r.recolhida} aoMudar={(v) => set({ recolhida: v })}>Recolhida</Chk><Chk marcado={r.oculta} aoMudar={(v) => set({ oculta: v })}>Oculta</Chk><Chk marcado={r.travada} aoMudar={(v) => set({ travada: v })}>🔒 Travada</Chk></Linha>
        <Linha><Chk marcado={r.itensAcompanham} aoMudar={(v) => set({ itensAcompanham: v })}>Itens acompanham a região ao mover</Chk></Linha>
        <Linha><Chk marcado={r.ima} aoMudar={(v) => set({ ima: v })}>🧲 Ímã (itens não saem da região)</Chk></Linha>
        {!r.pai && <Linha><Num rotulo="X" valor={r.bbox.x} aoMudar={(v) => import('../store').then((s) => { s.moverRegiao(id, v - r.bbox.x, 0, true); s.reatribuirRegioes(Object.keys(getEstado().lousa.doc.itens)); })} /><Num rotulo="Y" valor={r.bbox.y} aoMudar={(v) => import('../store').then((s) => { s.moverRegiao(id, 0, v - r.bbox.y, true); s.reatribuirRegioes(Object.keys(getEstado().lousa.doc.itens)); })} /><Num rotulo="Largura" valor={r.bbox.w} min={80} aoMudar={(v) => import('../store').then((s) => s.redimensionarRegiao(id, { ...r.bbox, w: v }, true))} /><Num rotulo="Altura" valor={r.bbox.h} min={60} aoMudar={(v) => import('../store').then((s) => s.redimensionarRegiao(id, { ...r.bbox, h: v }, true))} /></Linha>}
      </Secao>
      <Secao titulo="Ações">
        <Linha>
          <button type="button" className="btn primario" onClick={() => setUI({ dialogo: { tipo: 'dividir', regiaoId: id } })}>▦ Dividir…</button>
          <button type="button" className="btn contorno" onClick={() => dividirAoMeio(id)}>Dividir ao meio</button>
          <button type="button" className="btn contorno" onClick={() => irParaRegiao(id)}>Ir para</button>
          <button type="button" className="btn contorno" onClick={() => { setUI({ regiaoIsolada: getEstado().ui.regiaoIsolada === id ? null : id }); }}>{getEstado().ui.regiaoIsolada === id ? 'Sair do isolamento' : 'Isolar'}</button>
          <button type="button" className="btn contorno" onClick={() => { enquadrar(r.bbox, 10, 4); setUI({ regiaoIsolada: id }); setVisualizacao({ modoFoco: true }); }}>Tela cheia</button>
          <button type="button" className="btn contorno" onClick={() => duplicarRegiao(id)}>Duplicar com conteúdo</button>
          <button type="button" className="btn contorno" onClick={() => selecionarPor({ regiao: id })}>Selecionar itens</button>
        </Linha>
        {irmaos.length > 0 && <Linha>
          <Campo rotulo="Mesclar com"><select className="campo !py-1" defaultValue="" onChange={(e) => { if (e.target.value) mesclarRegioes(id, e.target.value); }}><option value="">escolha…</option>{irmaos.map((f) => <option key={f} value={f}>{regioes[f]?.nome}</option>)}</select></Campo>
          <Campo rotulo="Trocar de lugar com"><select className="campo !py-1" defaultValue="" onChange={(e) => { if (e.target.value) trocarRegioes(id, e.target.value); }}><option value="">escolha…</option>{irmaos.map((f) => <option key={f} value={f}>{regioes[f]?.nome}</option>)}</select></Campo>
        </Linha>}
        <Linha><span className="text-xs opacity-70">Por regra:</span><button type="button" className="btn contorno text-xs" onClick={() => dividirPorRegra(id, 'etiqueta')}>etiqueta</button><button type="button" className="btn contorno text-xs" onClick={() => dividirPorRegra(id, 'status')}>status</button><button type="button" className="btn contorno text-xs" onClick={() => dividirPorRegra(id, 'data')}>data de revisão</button></Linha>
        <Linha>{r.filhos.length > 0 && <button type="button" className="btn contorno" onClick={() => { const n = window.prompt('Nome do modelo de divisão'); const spec = especDaRegiao(id); if (n && spec) salvarModeloDivisao(n.slice(0, 60), spec); }}>💾 Salvar divisão como modelo</button>}
          {modelos.length > 0 && <Campo rotulo="Aplicar modelo salvo"><select className="campo !py-1" defaultValue="" onChange={(e) => { const m = modelos.find((x) => x.id === e.target.value); if (m) import('../store').then((s) => s.aplicarDivisao(id, s.especNormalizadaParaMundo(m.spec as never, r.bbox))); }}><option value="">escolha…</option>{modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></Campo>}</Linha>
        <Linha><button type="button" className="btn contorno perigo" onClick={() => removerRegiao(id, true)}>Remover (manter itens)</button><button type="button" className="btn contorno perigo" onClick={() => { if (window.confirm('Excluir a região E todos os itens dentro dela?')) removerRegiao(id, false); }}>Remover com itens</button></Linha>
      </Secao>
    </div>
  );
}

// ---------------- CAMADAS E FILTROS ----------------
function Camadas() {
  const camadas = useLousa((l) => l.doc.camadas); const vis = useLousa((l) => l.visualizacao); const itens = useLousa((l) => l.doc.itens); const regioes = useLousa((l) => l.doc.regioes); const visoes = useLousa((l) => l.visoesSalvas);
  const sel = useUI((u) => u.selecao);
  const etiquetas = useMemo(() => [...new Set(Object.values(itens).flatMap((i) => i.etiquetas))].sort(), [itens]);
  const cores = useMemo(() => [...new Set(Object.values(itens).map((i) => i.cor))], [itens]);
  const tipos: TipoItem[] = ['postit', 'texto', 'titulo', 'caixa', 'tarefas', 'tabela', 'imagem', 'link', 'desenho', 'forma', 'cloze', 'contador', 'carimbo'];
  const f = vis.filtro; const setF = (p: Partial<typeof f>) => setVisualizacao({ filtro: { ...f, ...p } });
  return (
    <div>
      <Secao titulo="Camadas">
        {camadas.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1 text-sm">
            <button type="button" className="btn !min-w-7" aria-label={c.visivel ? `Ocultar camada ${c.nome}` : `Mostrar camada ${c.nome}`} aria-pressed={!c.visivel} onClick={() => atualizarCamada(c.id, { visivel: !c.visivel })}>{c.visivel ? '👁' : '🚫'}</button>
            <button type="button" className="btn !min-w-7" aria-label={c.travada ? 'Destravar camada' : 'Travar camada'} onClick={() => atualizarCamada(c.id, { travada: !c.travada })}>{c.travada ? '🔒' : '🔓'}</button>
            <input className="campo !py-0.5 flex-1" value={c.nome} onChange={(e) => atualizarCamada(c.id, { nome: e.target.value })} aria-label="Nome da camada" />
            <input type="range" min={0} max={1} step={0.05} value={c.opacidade} className="w-14" onChange={(e) => atualizarCamada(c.id, { opacidade: Number(e.target.value) })} aria-label={`Opacidade da camada ${c.nome}`} />
            <button type="button" className="btn !min-w-6" aria-label="Subir" disabled={i === 0} onClick={() => reordenarCamada(c.id, -1)}>↑</button>
            <button type="button" className="btn !min-w-6" aria-label="Descer" disabled={i === camadas.length - 1} onClick={() => reordenarCamada(c.id, 1)}>↓</button>
            <button type="button" className="btn !min-w-6 perigo" aria-label="Excluir camada" onClick={() => excluirCamada(c.id)}>✕</button>
          </div>
        ))}
        <Linha><button type="button" className="btn contorno" onClick={() => { const n = window.prompt('Nome da camada'); if (n) criarCamada(n.slice(0, 40)); }}>+ Camada</button>{sel.length > 0 && <Campo rotulo="Mover seleção para"><select className="campo !py-1" defaultValue="" onChange={(e) => { if (e.target.value) moverParaCamada(sel, e.target.value); }}><option value="">camada…</option>{camadas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>}</Linha>
      </Secao>
      <Secao titulo="Ocultar por tipo de item">
        <div className="flex flex-wrap gap-1">{tipos.map((t) => <button key={t} type="button" className="chip" aria-pressed={vis.tiposOcultos.includes(t)} style={{ textDecoration: vis.tiposOcultos.includes(t) ? 'line-through' : undefined, opacity: vis.tiposOcultos.includes(t) ? 0.6 : 1 }} onClick={() => setVisualizacao({ tiposOcultos: vis.tiposOcultos.includes(t) ? vis.tiposOcultos.filter((x) => x !== t) : [...vis.tiposOcultos, t] })}>{nomeTipo(t)}</button>)}</div>
        <Linha><Chk marcado={vis.esmaecerOcultos} aoMudar={(v) => setVisualizacao({ esmaecerOcultos: v })}>Esmaecer em vez de ocultar</Chk><Num rotulo="Opacidade ao esmaecer" valor={vis.opacidadeEsmaecer} passo={0.05} min={0} max={1} aoMudar={(v) => setVisualizacao({ opacidadeEsmaecer: v })} /></Linha>
        <Campo rotulo="Destacar só um tipo (apaga o resto da vista)"><select className="campo !py-1" value={vis.destacarTipo ?? ''} onChange={(e) => setVisualizacao({ destacarTipo: (e.target.value || null) as TipoItem | null })}><option value="">— nenhum —</option>{tipos.map((t) => <option key={t} value={t}>{nomeTipo(t)}</option>)}</select></Campo>
      </Secao>
      <Secao titulo="Filtrar itens (só os de uma cor, etiqueta, região ou status)">
        <Linha>
          <Campo rotulo="Cor"><select className="campo !py-1" value={f.cor ?? ''} onChange={(e) => setF({ cor: e.target.value || null })}><option value="">todas</option>{cores.map((c) => <option key={c} value={c}>{PALETA.find((p) => p.cor === c)?.nome ?? c}</option>)}</select></Campo>
          <Campo rotulo="Etiqueta"><select className="campo !py-1" value={f.etiqueta ?? ''} onChange={(e) => setF({ etiqueta: e.target.value || null })}><option value="">todas</option>{etiquetas.map((c) => <option key={c} value={c}>{c}</option>)}</select></Campo>
        </Linha>
        <Linha>
          <Campo rotulo="Região"><select className="campo !py-1" value={f.regiao ?? ''} onChange={(e) => setF({ regiao: e.target.value || null })}><option value="">todas</option>{Object.values(regioes).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
          <Campo rotulo="Status"><select className="campo !py-1" value={f.status ?? ''} onChange={(e) => setF({ status: (e.target.value || null) as StatusEstudo | null })}><option value="">todos</option>{Object.entries(ROTULOS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        </Linha>
        <Linha><Chk marcado={f.esmaecer} aoMudar={(v) => setF({ esmaecer: v })}>Esmaecer os demais (em vez de ocultar)</Chk><button type="button" className="btn contorno" onClick={() => setF({ cor: null, etiqueta: null, regiao: null, status: null, texto: '' })}>Limpar filtros</button></Linha>
        <Linha><button type="button" className="btn contorno text-xs" onClick={() => selecionarPor({ cor: f.cor ?? undefined, etiqueta: f.etiqueta ?? undefined, regiao: f.regiao ?? undefined, status: f.status ?? undefined })}>Selecionar os itens filtrados</button></Linha>
      </Secao>
      <Secao titulo="Visões salvas" aberta={false}>
        {visoes.map((v) => <Linha key={v.id}><button type="button" className="btn contorno flex-1" onClick={() => import('../store').then((s) => s.aplicarVisao(v.id))}>⭐ {v.nome}</button><button type="button" className="btn perigo" aria-label="Excluir visão" onClick={() => excluirVisao(v.id)}>✕</button></Linha>)}
        <button type="button" className="btn contorno" onClick={() => { const n = window.prompt('Nome da visão'); if (n) import('../store').then((s) => s.salvarVisao(n.slice(0, 40))); }}>+ Salvar visão atual</button>
      </Secao>
    </div>
  );
}

// ---------------- REGIÕES ----------------
function PainelRegioes() {
  const regioes = useLousa((l) => l.doc.regioes); const sel = useUI((u) => u.regiaoSelecionada); const itens = useLousa((l) => l.doc.itens);
  const raizes = Object.values(regioes).filter((r) => !r.pai).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const contagem = (id: string) => { const ds = new Set(descendentes(id, regioes)); return Object.values(itens).filter((i) => i.regiao && ds.has(i.regiao)).length; };
  const No = ({ r, nivel }: { r: Regiao; nivel: number }) => (
    <li>
      <div className={`flex items-center gap-1 rounded px-1 py-0.5 text-sm ${sel === r.id ? 'ativo' : ''}`} style={{ paddingLeft: nivel * 14 + 4, background: sel === r.id ? 'var(--ui-fundo-2)' : undefined }}>
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: r.estilo.cor }} />
        <button type="button" className="flex-1 truncate text-left" onClick={() => setUI({ regiaoSelecionada: r.id })} onDoubleClick={() => irParaRegiao(r.id)} aria-label={`Região ${r.nome}`}>{r.estilo.icone} {r.nome} <span className="opacity-50">({contagem(r.id)})</span></button>
        <button type="button" className="btn !min-w-6 !min-h-6 text-xs" title="Ir para" aria-label="Ir para a região" onClick={() => irParaRegiao(r.id)}>→</button>
        <button type="button" className="btn !min-w-6 !min-h-6 text-xs" title={r.recolhida ? 'Expandir' : 'Recolher'} aria-label={r.recolhida ? 'Expandir' : 'Recolher'} onClick={() => atualizarRegiao(r.id, { recolhida: !r.recolhida })}>{r.recolhida ? '▸' : '▾'}</button>
        <button type="button" className="btn !min-w-6 !min-h-6 text-xs" title={r.oculta ? 'Mostrar' : 'Ocultar'} aria-label={r.oculta ? 'Mostrar' : 'Ocultar'} onClick={() => atualizarRegiao(r.id, { oculta: !r.oculta })}>{r.oculta ? '🚫' : '👁'}</button>
      </div>
      {r.filhos.length > 0 && <ul>{r.filhos.map((f) => regioes[f] && <No key={f} r={regioes[f]} nivel={nivel + 1} />)}</ul>}
    </li>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2 p-3">
        <button type="button" className="btn primario" onClick={() => setUI({ dialogo: { tipo: 'dividir', regiaoId: sel } })}>▦ Dividir {sel ? 'região' : 'a lousa'}…</button>
        <button type="button" className="btn contorno" onClick={() => setUI({ ferramenta: 'regiao', painel: null })}>▭ Desenhar região</button>
        <button type="button" className="btn contorno" onClick={() => setUI({ ferramenta: 'poligono', painel: null })}>⬠ Polígono</button>
        <button type="button" className="btn contorno" onClick={() => setUI({ ferramenta: 'laco', painel: null })}>➰ Laço</button>
        <button type="button" className="btn contorno" onClick={() => setUI({ ferramenta: 'linha-divisao', painel: null })}>╱ Traçar linha</button>
        <button type="button" className="btn contorno" onClick={() => reatribuirRegioes(Object.keys(itens))}>↻ Reatribuir itens</button>
      </div>
      {raizes.length === 0 && <p className="px-3 text-sm opacity-70">Ainda não há regiões. Use "Dividir a lousa" para criar a primeira (ela cobre a tela atual) ou desenhe uma região.</p>}
      <ul className="px-2 pb-3">{raizes.map((r) => <No key={r.id} r={r} nivel={0} />)}</ul>
      {sel && regioes[sel] && <PropRegiao id={sel} />}
    </div>
  );
}

// ---------------- ESTUDO ----------------
function PainelEstudo() {
  const lousa = useLousa((l) => l); const deslocamento = useUI((u) => u.deslocamentoTempo); const pomodoro = useUI((u) => u.pomodoro);
  const pendentes = useMemo(() => itensParaRevisar(lousa), [lousa.doc.itens, deslocamento]); // eslint-disable-line react-hooks/exhaustive-deps
  const est = lousa.estudo; const setE = (p: Partial<typeof est>) => setLousa((l) => ({ estudo: { ...l.estudo, ...p } }));
  const hoje = chaveDia(); const revisadosHoje = est.revisadosHoje.dia === hoje ? est.revisadosHoje.quantidade : 0;
  const erros = Object.values(lousa.doc.itens).filter((i) => i.modelo === 'erro' || i.etiquetas.includes('erro'));
  const porDisc = useMemo(() => { const m = new Map<string, number>(); for (const t of lousa.edital) m.set(t.disciplina, (m.get(t.disciplina) ?? 0) + t.dominio); const out: [string, number][] = []; for (const [d, s] of m) out.push([d, Math.round(s / lousa.edital.filter((t) => t.disciplina === d).length)]); return out; }, [lousa.edital]);
  const dominioGeral = lousa.edital.length ? Math.round(lousa.edital.reduce((s, t) => s + t.dominio, 0) / lousa.edital.length) : 0;
  const atrasados = pendentes.filter((i) => (i.revisao.proxima ?? 0) < agora() - DIA_MS).length;
  return (
    <div>
      <Secao titulo={`Revisar hoje (${pendentes.length})`}>
        {pendentes.length === 0 && <p className="text-sm opacity-70">Nada para revisar hoje. Ative a revisão espaçada em um post-it (Propriedades → Estudo).</p>}
        {atrasados > 0 && <p className="text-xs" style={{ color: 'var(--ui-perigo)' }}>{atrasados} atrasados</p>}
        <ul className="flex max-h-64 flex-col gap-1 overflow-auto">{pendentes.slice(0, 50).map((i) => <li key={i.id} className="flex items-center gap-1 text-sm"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: i.cor }} /><button type="button" className="flex-1 truncate text-left" onClick={() => irParaItem(i.id)}>{i.titulo || textoDoItem(i).slice(0, 40) || '(sem texto)'}</button><button type="button" className="btn !min-h-7 text-xs" style={{ color: '#16a34a' }} onClick={() => registrarRevisao(i.id, true)}>✓</button><button type="button" className="btn !min-h-7 text-xs perigo" onClick={() => registrarRevisao(i.id, false)}>✗</button></li>)}</ul>
        <Linha><button type="button" className="btn primario" disabled={!pendentes.length} onClick={() => setUI({ dialogo: { tipo: 'fila-revisao' } })}>▶ Revisar em fila (tela cheia)</button><Chk marcado={est.intercalar} aoMudar={(v) => setE({ intercalar: v })}>Intercalar disciplinas</Chk></Linha>
        <Campo rotulo="Sequência de intervalos em dias (padrão 1, 7, 30)"><input className="campo !py-1" defaultValue={est.intervalos.join(', ')} onBlur={(e) => { const v = e.target.value.split(/[,; ]+/).map(Number).filter((x) => x > 0); if (v.length) setE({ intervalos: v }); }} /></Campo>
        <Linha><button type="button" className="btn contorno text-xs" title="Para testar: avança o relógio interno em 1 dia" onClick={() => setUI({ deslocamentoTempo: deslocamento + DIA_MS })}>⏩ Simular +1 dia</button>{deslocamento > 0 && <button type="button" className="btn contorno text-xs" onClick={() => setUI({ deslocamentoTempo: 0 })}>Voltar ao dia real (+{Math.round(deslocamento / DIA_MS)}d)</button>}</Linha>
      </Secao>
      <Secao titulo="Meta diária e rotina">
        <Linha><Num rotulo="Meta de itens revisados por dia" valor={est.metaDiaria} min={1} max={500} aoMudar={(v) => setE({ metaDiaria: v })} /><div className="flex-1 text-sm">Hoje: <b>{revisadosHoje}/{est.metaDiaria}</b><div className="barra-progresso mt-1"><div style={{ width: `${Math.min(100, (revisadosHoje / est.metaDiaria) * 100)}%` }} /></div></div></Linha>
        <p className="text-sm">🔥 Sequência: <b>{est.sequenciaDias}</b> dia(s) batendo a meta</p>
        <Linha><Num rotulo="Pomodoro: foco (min)" valor={est.pomodoroFoco} min={1} max={120} aoMudar={(v) => setE({ pomodoroFoco: v })} /><Num rotulo="pausa (min)" valor={est.pomodoroPausa} min={1} max={60} aoMudar={(v) => setE({ pomodoroPausa: v })} /></Linha>
        <Linha>{pomodoro.fase === 'parado' ? <button type="button" className="btn primario" onClick={() => iniciarPomodoro('foco')}>🍅 Iniciar foco</button> : <><button type="button" className="btn contorno" onClick={() => iniciarPomodoro(pomodoro.fase === 'foco' ? 'pausa' : 'foco')}>{pomodoro.fase === 'foco' ? '☕ Pular para pausa' : '🍅 Voltar ao foco'}</button><button type="button" className="btn contorno" onClick={pararPomodoro}>Parar</button></>}<span className="text-xs opacity-70">ciclos: {pomodoro.ciclos}</span></Linha>
        <Linha><Campo rotulo="Nome da prova"><input className="campo !py-1" value={est.nomeProva} onChange={(e) => setE({ nomeProva: e.target.value })} /></Campo><Campo rotulo="Data da prova"><input type="date" className="campo !py-1" value={est.dataProva ?? ''} onChange={(e) => setE({ dataProva: e.target.value || null })} /></Campo></Linha>
      </Secao>
      <Secao titulo="Mapa do edital">
        {lousa.edital.length > 0 && <><div className="text-sm">Domínio geral: <b>{dominioGeral}%</b><div className="barra-progresso mt-1"><div style={{ width: `${dominioGeral}%` }} /></div></div>{porDisc.map(([d, v]) => <div key={d} className="text-xs"><div className="flex justify-between"><span>{d}</span><span>{v}%</span></div><div className="barra-progresso" style={{ height: 5 }}><div style={{ width: `${v}%` }} /></div></div>)}</>}
        <Linha><button type="button" className="btn primario" onClick={() => setUI({ dialogo: { tipo: 'edital' } })}>📜 Abrir mapa do edital</button></Linha>
      </Secao>
      <Secao titulo="Questões e caderno de erros">
        <p className="text-sm">{erros.length} erro(s) registrados · {lousa.questoes.reduce((s, q) => s + q.total, 0)} questões feitas</p>
        <Linha><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'caderno-erros' } })}>❌ Caderno de erros</button><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'questoes' } })}>📝 Questões e simulado</button><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'estatisticas' } })}>📊 Estatísticas</button></Linha>
        <Linha><button type="button" className="btn contorno" onClick={() => { setUI({ apresentacao: { indice: 0 }, dialogo: { tipo: 'apresentacao' } }); }}>▶ Modo apresentação (regiões como slides)</button></Linha>
      </Secao>
      <Secao titulo="Legenda de cores" aberta={false}>
        {lousa.legenda.map((l, i) => <Linha key={i}><input type="color" value={l.cor} onChange={(e) => setLousa((x) => ({ legenda: x.legenda.map((y, j) => (j === i ? { ...y, cor: e.target.value } : y)) }))} aria-label="Cor da legenda" /><input className="campo !py-1 flex-1" value={l.significado} onChange={(e) => setLousa((x) => ({ legenda: x.legenda.map((y, j) => (j === i ? { ...y, significado: e.target.value } : y)) }))} aria-label="Significado" /><button type="button" className="btn perigo" aria-label="Remover" onClick={() => setLousa((x) => ({ legenda: x.legenda.filter((_, j) => j !== i) }))}>✕</button></Linha>)}
        <Linha><button type="button" className="btn contorno" onClick={() => setLousa((x) => ({ legenda: [...x.legenda, { cor: '#90caf9', significado: 'Novo significado' }] }))}>+ Cor</button><Chk marcado={lousa.visualizacao.legenda} aoMudar={(v) => setVisualizacao({ legenda: v })}>Mostrar na lousa</Chk></Linha>
      </Secao>
    </div>
  );
}

// ---------------- DADOS ----------------
function PainelDados({ aoExportar }: { aoExportar: () => void }) {
  const nome = useLousa((l) => l.nome); const espaco = useUI((u) => u.espaco); const indisponivel = useUI((u) => u.armazenamentoIndisponivel); const lixeira = useLousa((l) => l.lixeira);
  const input = useRef<HTMLInputElement>(null); const [persistido, setPersistido] = useState<boolean | null>(null);
  useEffect(() => { atualizarEspaco(); navigator.storage?.persisted?.().then(setPersistido).catch(() => {}); }, []);
  const nuvem = useUI((u) => u.nuvem); const sincronizar = useLousa((l) => l.config.sincronizarNuvem); const totalNuvem = useUI((u) => u.nuvemTotal);
  const statusTexto = nuvem.status === 'conectada' ? (nuvem.modo === 'local' ? 'Conectada ao banco local embutido do servidor (sem PostgreSQL configurado) — suas lousas são espelhadas nele.' : 'Conectada — suas lousas são espelhadas no banco de dados PostgreSQL.') : nuvem.status === 'sincronizando' ? 'Sincronizando…' : nuvem.status === 'desativada' ? 'Desativada — tudo fica só neste navegador.' : nuvem.status === 'verificando' ? 'Verificando…' : nuvem.status === 'erro' ? 'Erro ao sincronizar. Os dados locais estão seguros.' : 'Indisponível — trabalhando no modo local. Tentaremos reconectar automaticamente.';
  return (
    <div>
      <Secao titulo="Nuvem (banco de dados)">
        <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'var(--ui-fundo-2)' }}>
          <span className="mt-0.5" style={{ color: nuvem.status === 'conectada' ? 'var(--ui-ok)' : 'var(--ui-texto-2)' }}>{nuvem.status === 'conectada' || nuvem.status === 'sincronizando' ? <IcNuvem width={22} height={22} /> : <IcNuvemOff width={22} height={22} />}</span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">{nuvem.status === 'conectada' ? (nuvem.modo === 'local' ? 'Banco local do servidor' : 'Nuvem conectada') : nuvem.status === 'sincronizando' ? 'Sincronizando' : nuvem.status === 'desativada' ? 'Nuvem desativada' : 'Modo local'}</div>
            <div className="text-xs opacity-70">{statusTexto}</div>
            {nuvem.ultimaSync && <div className="mt-1 text-xs opacity-60">Última sincronização: {new Date(nuvem.ultimaSync).toLocaleString('pt-BR')} · {totalNuvem} lousa(s) na nuvem</div>}
          </div>
        </div>
        <div className="linha-config"><div><div className="text-sm font-medium">Sincronizar com a nuvem</div><div className="desc">O armazenamento local continua sendo a fonte principal; a nuvem é um espelho com histórico por data.</div></div><button type="button" role="switch" aria-checked={sincronizar !== false} className="interruptor" aria-label="Sincronizar com a nuvem" onClick={() => definirSincronizacao(sincronizar === false)} /></div>
        <Linha><button type="button" className="btn primario" disabled={sincronizar === false} onClick={() => sincronizarTudo(true)}><IcSync width={15} height={15} /> Sincronizar agora</button><button type="button" className="btn contorno" onClick={() => verificarNuvem(false)}>Testar conexão</button></Linha>
      </Secao>
      <Secao titulo="Esta lousa">
        <Campo rotulo="Nome"><input className="campo" value={nome} maxLength={80} onChange={(e) => setLousa(() => ({ nome: e.target.value }))} /></Campo>
        <Linha><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'lousas' } })}>🗂️ Minhas lousas</button><button type="button" className="btn contorno" onClick={() => salvarAgora()}>Salvar agora</button></Linha>
      </Secao>
      <Secao titulo="Backup e exportação">
        {indisponivel && <p className="rounded-lg border p-2 text-sm" style={{ borderColor: 'var(--ui-perigo)' }}>O armazenamento do navegador está bloqueado (janela privativa ou restrição ao abrir o arquivo). Nada é salvo automaticamente: <b>exporte o .json</b> antes de fechar.</p>}
        <Linha><button type="button" className="btn primario" onClick={() => exportarJSON()}>⬇ Exportar .json (tudo)</button><button type="button" className="btn contorno" onClick={() => input.current?.click()}>⬆ Importar .json</button></Linha>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const modo = window.confirm('Importar como NOVA lousa? (Cancelar substitui a lousa atual)') ? 'nova' : 'substituir'; try { await importarJSON(f, modo); } catch (err) { avisar((err as Error).message, undefined, 'erro', 8000); } e.target.value = ''; }} />
        <Linha><button type="button" className="btn contorno" onClick={aoExportar}>🖼️ PNG / PDF</button><button type="button" className="btn contorno" onClick={() => exportarTexto('md')}>📝 Markdown</button><button type="button" className="btn contorno" onClick={() => exportarTexto('txt')}>📄 Texto</button><button type="button" className="btn contorno" onClick={exportarCSVCartoes}>🗃️ CSV dos cartões</button></Linha>
        <Linha><button type="button" className="btn contorno" onClick={() => criarBackup('manual')}>Criar backup interno</button><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'backups' } })}>Restaurar backup…</button></Linha>
        <p className="text-xs opacity-70">Backups internos são feitos a cada 10 minutos (últimos 10 guardados). O navegador pode apagar dados locais: exporte um .json com frequência.</p>
      </Secao>
      <Secao titulo="Armazenamento">
        <p className="text-sm">{espaco ? <>Usado: <b>{formatarBytes(espaco.usado)}</b> de {formatarBytes(espaco.cota)}</> : 'Estimativa indisponível'}</p>
        {espaco && <div className="barra-progresso"><div style={{ width: `${Math.min(100, (espaco.usado / (espaco.cota || 1)) * 100)}%` }} /></div>}
        <Linha><button type="button" className="btn contorno" onClick={async () => { const ok = await pedirPersistencia(); setPersistido(ok); avisar(ok ? 'O navegador vai preservar seus dados.' : 'O navegador não garantiu a persistência; mantenha backups.'); }}>{persistido ? '✓ Dados protegidos' : 'Pedir para proteger dados'}</button><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'lixeira' } })}>🗑️ Lixeira ({lixeira.length})</button></Linha>
      </Secao>
      <Secao titulo="Desempenho e testes" aberta={false}>
        <Linha><button type="button" className="btn contorno" onClick={() => gerarTesteCarga(500)}>Teste de carga: +500</button><button type="button" className="btn contorno" onClick={() => gerarTesteCarga(3000)}>+3.000</button></Linha>
        <Linha><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'sobre' } })}>ℹ️ Sobre, privacidade e testes de segurança</button></Linha>
      </Secao>
    </div>
  );
}

// ---------------- BUSCA ----------------
function PainelBusca() {
  const itens = useLousa((l) => l.doc.itens); const regioes = useLousa((l) => l.doc.regioes); const f = useLousa((l) => l.visualizacao.filtro);
  const [q, setQ] = useState(f.texto); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const res = useMemo(() => { const t = q.trim().toLowerCase(); if (!t) return []; return Object.values(itens).filter((i) => textoDoItem(i).toLowerCase().includes(t) || i.etiquetas.some((e) => e.toLowerCase().includes(t))).slice(0, 100); }, [q, itens]);
  return (
    <div className="p-3">
      <input ref={ref} className="campo" placeholder="Buscar em títulos, textos e etiquetas…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) irParaItem(res[0].id); if (e.key === 'Escape') setUI({ painel: null }); }} aria-label="Buscar" />
      <Linha><Chk marcado={!!f.texto} aoMudar={(v) => setVisualizacao({ filtro: { ...f, texto: v ? q : '' } })}>Realçar na lousa (esmaece os demais)</Chk></Linha>
      <p className="py-1 text-xs opacity-70">{res.length} resultado(s)</p>
      <ul className="flex flex-col gap-1">{res.map((i) => <li key={i.id}><button type="button" className="flex w-full items-start gap-2 rounded-lg p-2 text-left text-sm hover:bg-[var(--ui-fundo-2)]" onClick={() => irParaItem(i.id)}><span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: i.cor }} /><span className="min-w-0"><span className="block truncate font-semibold">{i.titulo || nomeTipo(i.tipo)}</span><span className="block truncate text-xs opacity-70">{textoDoItem(i).slice(0, 90)}</span><span className="block text-[10px] opacity-50">{caminhoRegiao(i.regiao, regioes).join(' › ')}</span></span></button></li>)}</ul>
    </div>
  );
}
