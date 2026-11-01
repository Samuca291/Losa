// ============================================================
// CONFIGURAÇÕES: cartões por tema, com pré-visualizações ao vivo
// (tema, fundo, conectores), busca de opções e restaurar padrões.
// ============================================================
import { useMemo, useState, type ReactNode } from 'react';
import { FONTES, PALETA, TAMANHOS_POSTIT, type Config } from '../types';
import { avisar, criarLousaVazia, setLousa, setUI, setVisualizacao, useLousa } from '../store';
import { calcularRota, calcularSaltos, pathComSaltos, seta, type OpcoesRota } from '../utils/conectores';
import { IcAjuda, IcConector, IcDados, IcLapis, IcOlho, IcPostit, IcSol } from './Icones';

// ---------- Controles ----------
const Interruptor = ({ valor, aoMudar, rotulo }: { valor: boolean; aoMudar: (v: boolean) => void; rotulo: string }) => <button type="button" role="switch" aria-checked={valor} className="interruptor" aria-label={rotulo} onClick={() => aoMudar(!valor)} />;
function Segmentado<T extends string>({ valor, opcoes, aoMudar, rotulo }: { valor: T; opcoes: { v: T; r: ReactNode; titulo?: string }[]; aoMudar: (v: T) => void; rotulo: string }) {
  return <div className="segmentado" role="radiogroup" aria-label={rotulo}>{opcoes.map((o) => <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} title={o.titulo} onClick={() => aoMudar(o.v)}>{o.r}</button>)}</div>;
}
const Deslizador = ({ valor, min, max, passo, aoMudar, rotulo, formato }: { valor: number; min: number; max: number; passo: number; aoMudar: (v: number) => void; rotulo: string; formato?: (v: number) => string }) => (
  <div className="deslizador"><input type="range" min={min} max={max} step={passo} value={valor} aria-label={rotulo} onChange={(e) => aoMudar(Number(e.target.value))} /><span className="valor tabular-nums">{formato ? formato(valor) : valor}</span></div>
);
function Opcao({ titulo, desc, children, termos = '' }: { titulo: string; desc?: string; children: ReactNode; termos?: string }) {
  return <div className="opcao" data-termos={`${titulo} ${desc ?? ''} ${termos}`.toLowerCase()}><div className="min-w-0 flex-1"><div className="text-sm font-medium">{titulo}</div>{desc && <div className="desc">{desc}</div>}</div><div className="controle">{children}</div></div>;
}
function Cartao({ icone, titulo, desc, children, cor }: { icone: ReactNode; titulo: string; desc: string; children: ReactNode; cor: string }) {
  return (
    <section className="cartao-config" aria-label={titulo}>
      <header><span className="icone" style={{ background: `${cor}1f`, color: cor }}>{icone}</span><div><h3>{titulo}</h3><p>{desc}</p></div></header>
      <div className="corpo">{children}</div>
    </section>
  );
}

// ---------- Pré-visualizações ----------
function PreviaTema({ tema, ativo }: { tema: 'claro' | 'escuro' | 'contraste' | 'auto'; ativo: boolean }) {
  const paleta = tema === 'claro' ? { f: '#f5f3ec', b: '#ffffff', t: '#16192a', p: '#fff176' } : tema === 'escuro' ? { f: '#1b1f2a', b: '#151823', t: '#eef0f6', p: '#fff176' } : tema === 'contraste' ? { f: '#000', b: '#000', t: '#fff', p: '#ffff00' } : null;
  return (
    <div className={`previa-tema ${ativo ? 'ativo' : ''}`} aria-hidden="true" style={paleta ? { background: paleta.f } : { background: 'linear-gradient(110deg, #f5f3ec 50%, #1b1f2a 50%)' }}>
      <div className="barra" style={{ background: paleta?.b ?? '#fff', borderColor: paleta ? 'transparent' : '#ccc' }} />
      <div className="postit" style={{ background: paleta?.p ?? '#fff176', transform: 'rotate(-4deg)' }} />
      <div className="postit dois" style={{ background: '#90caf9', transform: 'rotate(5deg)' }} />
      <div className="linha" style={{ background: paleta?.t ?? '#16192a' }} />
    </div>
  );
}
function PreviaFundo({ tipo, cor, intensidade, ativo }: { tipo: Config['fundo']; cor: string; intensidade: number; ativo: boolean }) {
  const escuro = (() => { const m = cor.replace('#', ''); if (m.length < 6) return false; const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5; })();
  const c = `rgba(${escuro ? '255,255,255' : '31,41,55'},${intensidade * 0.6})`;
  const estilo = tipo === 'pontilhado' ? { backgroundImage: `radial-gradient(${c} 1px, transparent 1px)`, backgroundSize: '8px 8px' } : tipo === 'quadriculado' ? { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: '8px 8px' } : tipo === 'pautado' ? { backgroundImage: `linear-gradient(${c} 1px, transparent 1px)`, backgroundSize: '100% 9px' } : {};
  return <div className={`previa-fundo ${ativo ? 'ativo' : ''}`} style={{ background: cor, ...estilo }} aria-hidden="true" />;
}
/** Demonstração ao vivo: dois post-its, um obstáculo no meio e uma linha cruzando. */
function PreviaConector({ cfg }: { cfg: Config }) {
  const op: OpcoesRota = { desviar: cfg.desviarObstaculos, margem: Math.max(6, cfg.margemDesvio * 0.45), raio: cfg.raioCanto * 0.6, saltos: cfg.saltosLinha };
  const a = { x: 10, y: 34, w: 46, h: 40 }, b = { x: 214, y: 34, w: 46, h: 40 }, o = { x: 118, y: 22, w: 36, h: 60 };
  const c = { x: 60, y: 92, w: 40, h: 22 }, d = { x: 160, y: 2, w: 40, h: 22 };
  const r1 = calcularRota('p1', cfg.estiloConector, a, b, [o], op); const r2 = calcularRota('p2', 'reto', c, d, [], { ...op, desviar: false });
  const saltos = op.saltos ? calcularSaltos([r1, r2]) : new Map();
  const d1 = pathComSaltos(r1.pontos, saltos.get('p1'), 4), d2 = pathComSaltos(r2.pontos, saltos.get('p2'), 4);
  return (
    <svg viewBox="0 0 270 118" className="previa-conector" aria-label="Pré-visualização dos conectores">
      {[a, b, o, c, d].map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill={i === 2 ? '#f8bbd0' : i > 2 ? '#a5d6a7' : '#fff176'} stroke="rgba(0,0,0,0.15)" />)}
      <path d={d2} fill="none" stroke="#94a3b8" strokeWidth={1.6} />
      <path d={d1} fill="none" stroke={cfg.corConector} strokeWidth={2} />
      {cfg.setaConector && <path d={seta(r1.pontos, 8)} fill={cfg.corConector} />}
      <text x={135} y={112} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.6}>{cfg.desviarObstaculos ? 'desvia do post-it rosa' : 'passa por cima do post-it rosa'}{cfg.saltosLinha ? ' · salta a linha cinza' : ''}</text>
    </svg>
  );
}

const COR_FUNDOS: [string, string][] = [['#f5f3ec', 'Papel'], ['#ffffff', 'Branco'], ['#fdf6e3', 'Creme'], ['#e8f0e8', 'Verde claro'], ['#eef2ff', 'Lavanda'], ['#2f3e34', 'Lousa verde'], ['#1b1f2a', 'Noite'], ['#0f172a', 'Ardósia']];

export function PainelConfig() {
  const cfg = useLousa((l) => l.config); const vis = useLousa((l) => l.visualizacao);
  const set = (p: Partial<Config>) => setLousa((l) => ({ config: { ...l.config, ...p } }));
  const [busca, setBusca] = useState('');
  const padrao = useMemo(() => criarLousaVazia().config, []);
  const restaurar = () => { if (!window.confirm('Restaurar todas as configurações para o padrão? (a sincronização com a nuvem é mantida)')) return; set({ ...padrao, sincronizarNuvem: cfg.sincronizarNuvem, coresFavoritas: cfg.coresFavoritas }); avisar('Configurações restauradas', undefined, 'ok'); };
  const termo = busca.trim().toLowerCase();
  return (
    <div className={`painel-config ${termo ? 'filtrando' : ''}`} data-busca={termo}>
      <div className="busca-config">
        <input className="campo" placeholder="Buscar opção… (ex.: tema, seta, grade)" value={busca} aria-label="Buscar configuração" onChange={(e) => setBusca(e.target.value)} />
        {termo && <button type="button" className="btn !min-h-8 text-xs" onClick={() => setBusca('')}>Limpar</button>}
      </div>
      {termo && <style>{`.painel-config.filtrando .opcao:not([data-termos*="${termo.replace(/["\\]/g, '')}"]) { display: none; } .painel-config.filtrando .cartao-config:not(:has(.opcao[data-termos*="${termo.replace(/["\\]/g, '')}"])) { display: none; }`}</style>}

      <Cartao icone={<IcSol />} titulo="Aparência" desc="Tema, tamanho da interface e movimento." cor="#f59e0b">
        <Opcao titulo="Tema" desc={cfg.temaAuto ? 'Seguindo o sistema operacional' : 'Escolha como a interface aparece'} termos="claro escuro contraste automático dark">
          <div className="grade-temas">{([['claro', 'Claro'], ['escuro', 'Escuro'], ['contraste', 'Contraste'], ['auto', 'Automático']] as const).map(([v, r]) => <button key={v} type="button" className="escolha-tema" aria-pressed={cfg.temaAuto ? v === 'auto' : cfg.tema === v} onClick={() => (v === 'auto' ? set({ temaAuto: true }) : set({ tema: v, temaAuto: false }))}><PreviaTema tema={v} ativo={cfg.temaAuto ? v === 'auto' : cfg.tema === v} /><span>{r}</span></button>)}</div>
        </Opcao>
        <Opcao titulo="Tamanho da interface" desc="Botões, painéis e textos da interface (não afeta os post-its)" termos="escala zoom fonte"><Deslizador valor={cfg.escalaInterface} min={0.8} max={1.6} passo={0.05} rotulo="Tamanho da interface" aoMudar={(v) => set({ escalaInterface: v })} formato={(v) => `${Math.round(v * 100)}%`} /></Opcao>
        <Opcao titulo="Animações" desc="Transições, entrada de itens e traçado das linhas" termos="movimento"><Interruptor rotulo="Animações" valor={cfg.animacoes} aoMudar={(v) => set({ animacoes: v })} /></Opcao>
        <Opcao titulo="Zoom suave" desc="Anima o zoom dos botões, atalhos e “ver tudo”"><Interruptor rotulo="Zoom suave" valor={cfg.zoomSuave} aoMudar={(v) => set({ zoomSuave: v })} /></Opcao>
        <Opcao titulo="Sombra de papel nos post-its" desc="Relevo sutil; desligue para um visual mais plano"><Interruptor rotulo="Sombra" valor={cfg.sombraPostit !== false} aoMudar={(v) => set({ sombraPostit: v })} /></Opcao>
      </Cartao>

      <Cartao icone={<IcOlho />} titulo="Fundo da lousa" desc="Padrão, intensidade e cor do papel." cor="#0ea5e9">
        <Opcao titulo="Padrão" termos="pontos grade pauta liso quadriculado">
          <div className="grade-fundos">{([['liso', 'Liso'], ['pontilhado', 'Pontos'], ['quadriculado', 'Grade'], ['pautado', 'Pauta']] as const).map(([v, r]) => <button key={v} type="button" className="escolha-fundo" aria-pressed={cfg.fundo === v} onClick={() => set({ fundo: v })}><PreviaFundo tipo={v} cor={cfg.corFundo} intensidade={Math.max(0.5, cfg.intensidadeFundo)} ativo={cfg.fundo === v} /><span>{r}</span></button>)}</div>
        </Opcao>
        <Opcao titulo="Intensidade do padrão"><Deslizador valor={cfg.intensidadeFundo} min={0} max={1} passo={0.05} rotulo="Intensidade" aoMudar={(v) => set({ intensidadeFundo: v })} formato={(v) => `${Math.round(v * 100)}%`} /></Opcao>
        <Opcao titulo="Espaçamento do padrão" desc="Também define a grade magnética"><Deslizador valor={cfg.tamanhoGrade} min={10} max={80} passo={2} rotulo="Espaçamento" aoMudar={(v) => set({ tamanhoGrade: v })} formato={(v) => `${v}px`} /></Opcao>
        <Opcao titulo="Cor do papel" termos="cor fundo"><div className="amostras">{COR_FUNDOS.map(([c, n]) => <button key={c} type="button" className="amostra" style={{ background: c }} aria-pressed={cfg.corFundo === c} title={n} aria-label={n} onClick={() => set({ corFundo: c })} />)}<label className="amostra livre" title="Cor livre">🎨<input type="color" value={cfg.corFundo} aria-label="Cor livre" onChange={(e) => set({ corFundo: e.target.value })} /></label></div></Opcao>
      </Cartao>

      <Cartao icone={<IcPostit />} titulo="Post-its" desc="Como os novos itens nascem." cor="#eab308">
        <Opcao titulo="Duplo clique cria post-it" desc="Em qualquer área vazia, inclusive dentro de regiões"><Interruptor rotulo="Duplo clique cria post-it" valor={cfg.duploCliqueCria} aoMudar={(v) => set({ duploCliqueCria: v })} /></Opcao>
        <Opcao titulo="Tamanho padrão" termos="pequeno médio grande">
          <div className="grade-tamanhos">{(['pequeno', 'medio', 'grande'] as const).map((t) => <button key={t} type="button" className="escolha-tamanho" aria-pressed={cfg.tamanhoPostit === t} onClick={() => set({ tamanhoPostit: t })}><span className="mini" style={{ width: TAMANHOS_POSTIT[t].w / 8, height: TAMANHOS_POSTIT[t].h / 8 }} /><span>{t === 'medio' ? 'Médio' : t[0].toUpperCase() + t.slice(1)}<small>{TAMANHOS_POSTIT[t].w}×{TAMANHOS_POSTIT[t].h}</small></span></button>)}</div>
        </Opcao>
        <Opcao titulo="Altura cresce com o texto" desc="Novos post-its se ajustam ao conteúdo"><Interruptor rotulo="Altura automática" valor={cfg.autoAjusteAltura} aoMudar={(v) => set({ autoAjusteAltura: v })} /></Opcao>
        <Opcao titulo="Levemente torto" desc="Efeito de papel colado à mão" termos="ângulo aleatório"><Interruptor rotulo="Ângulo aleatório" valor={cfg.anguloAleatorio} aoMudar={(v) => set({ anguloAleatorio: v })} /></Opcao>
        <Opcao titulo="Fonte padrão" termos="tipografia letra"><select className="campo !w-40 !py-1" value={cfg.fontePadrao} aria-label="Fonte padrão" onChange={(e) => set({ fontePadrao: e.target.value })}>{FONTES.map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}</select></Opcao>
        <Opcao titulo="Cores favoritas" desc="Aparecem primeiro nas paletas (★ em Propriedades)"><div className="amostras">{cfg.coresFavoritas.length ? cfg.coresFavoritas.map((c) => <button key={c} type="button" className="amostra" style={{ background: c }} title="Remover das favoritas" aria-label={`Remover ${c}`} onClick={() => set({ coresFavoritas: cfg.coresFavoritas.filter((x) => x !== c) })} />) : <span className="text-xs opacity-60">nenhuma</span>}</div></Opcao>
      </Cartao>

      <Cartao icone={<IcConector />} titulo="Conectores" desc="Linhas entre post-its: estilo, desvio de obstáculos e saltos." cor="#6366f1">
        <PreviaConector cfg={cfg} />
        <Opcao titulo="Estilo padrão" termos="curvo reto ângulo ortogonal">
          <Segmentado rotulo="Estilo do conector" valor={cfg.estiloConector} aoMudar={(v) => set({ estiloConector: v })} opcoes={[{ v: 'curvo', r: <svg width="26" height="14" viewBox="0 0 26 14"><path d="M1 12C9 12 17 2 25 2" fill="none" stroke="currentColor" strokeWidth="2" /></svg>, titulo: 'Curvo' }, { v: 'reto', r: <svg width="26" height="14" viewBox="0 0 26 14"><path d="M1 12L25 2" fill="none" stroke="currentColor" strokeWidth="2" /></svg>, titulo: 'Reto' }, { v: 'angulo', r: <svg width="26" height="14" viewBox="0 0 26 14"><path d="M1 12H13V2H25" fill="none" stroke="currentColor" strokeWidth="2" /></svg>, titulo: 'Em ângulo' }]} />
        </Opcao>
        <Opcao titulo="Desviar de outros post-its" desc="A linha contorna itens que estiverem no caminho" termos="obstáculo rota inteligente"><Interruptor rotulo="Desviar de obstáculos" valor={cfg.desviarObstaculos} aoMudar={(v) => set({ desviarObstaculos: v })} /></Opcao>
        <Opcao titulo="Saltos onde linhas se cruzam" desc="Pequena “ponte” para não confundir os cruzamentos"><Interruptor rotulo="Saltos de linha" valor={cfg.saltosLinha} aoMudar={(v) => set({ saltosLinha: v })} /></Opcao>
        <Opcao titulo="Linhas por cima dos itens" desc="Por padrão ficam atrás; itens sobrepostos sempre ganham um arco por cima"><Interruptor rotulo="Conectores acima" valor={cfg.conectoresAcima} aoMudar={(v) => set({ conectoresAcima: v })} /></Opcao>
        <Opcao titulo="Arredondamento dos cantos"><Deslizador valor={cfg.raioCanto} min={0} max={40} passo={2} rotulo="Raio dos cantos" aoMudar={(v) => set({ raioCanto: v })} formato={(v) => `${v}px`} /></Opcao>
        <Opcao titulo="Distância dos obstáculos" desc="Folga entre a linha e os post-its contornados"><Deslizador valor={cfg.margemDesvio} min={8} max={48} passo={2} rotulo="Margem" aoMudar={(v) => set({ margemDesvio: v })} formato={(v) => `${v}px`} /></Opcao>
        <Opcao titulo="Seta na ponta"><Interruptor rotulo="Seta na ponta" valor={cfg.setaConector} aoMudar={(v) => set({ setaConector: v })} /></Opcao>
        <Opcao titulo="Mostrar rótulos" desc="Textos como “exceção de”, “depende de” sobre as linhas"><Interruptor rotulo="Rótulos" valor={cfg.rotulosConector !== false} aoMudar={(v) => set({ rotulosConector: v })} /></Opcao>
        <Opcao titulo="Cor padrão"><div className="amostras">{['#475569', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2'].map((c) => <button key={c} type="button" className="amostra" style={{ background: c }} aria-pressed={cfg.corConector === c} aria-label={`Cor ${c}`} onClick={() => set({ corConector: c })} />)}<label className="amostra livre" title="Cor livre">🎨<input type="color" value={cfg.corConector} aria-label="Cor livre" onChange={(e) => set({ corConector: e.target.value })} /></label></div></Opcao>
        <Opcao titulo="Pontos de conexão" desc="Bolinhas + nas bordas do item sob o mouse ou selecionado"><Interruptor rotulo="Pontos de conexão" valor={cfg.portasConexao} aoMudar={(v) => set({ portasConexao: v })} /></Opcao>
        <p className="dica-cartao">Para conectar: arraste a bolinha <b>+</b> até outro item, ou <b>clique</b> nela e depois clique no destino. Com um conector selecionado, arraste as pontas para religar; duplo clique na linha edita o rótulo. <kbd>L</kbd> liga os selecionados.</p>
      </Cartao>

      <Cartao icone={<IcLapis />} titulo="Edição de texto" desc="Comportamento do editor dentro dos post-its." cor="#10b981">
        <Opcao titulo="Atalhos estilo Markdown" desc={'"- " vira lista, "1. " numerada, "# " título, "> " citação, "[] " caixa'} termos="markdown lista título"><Interruptor rotulo="Atalhos Markdown" valor={cfg.atalhosMarkdown !== false} aoMudar={(v) => set({ atalhosMarkdown: v })} /></Opcao>
        <Opcao titulo="Corretor ortográfico" desc="Sublinha erros enquanto digita"><Interruptor rotulo="Corretor ortográfico" valor={cfg.corretorOrtografico} aoMudar={(v) => set({ corretorOrtografico: v })} /></Opcao>
        <Opcao titulo="Cor padrão dos novos post-its" termos="paleta amarelo"><div className="amostras">{PALETA.slice(0, 8).map((c) => <button key={c.cor} type="button" className="amostra" style={{ background: c.cor }} title={c.nome} aria-label={c.nome} onClick={() => setUI({ corAtual: c.cor })} />)}</div></Opcao>
        <p className="dica-cartao">Na edição: <kbd>Ctrl+B/I/U</kbd> estilo · <kbd>Ctrl+Shift+X</kbd> tachado · <kbd>Ctrl+Shift+7/8</kbd> listas · <kbd>Ctrl+[</kbd>/<kbd>]</kbd> recuo · <kbd>Ctrl+Shift+H</kbd> realce · <kbd>Ctrl+Shift+L</kbd> lacuna · <kbd>Ctrl+K</kbd> link · <kbd>Tab</kbd> novo post-it ao lado.</p>
      </Cartao>

      <Cartao icone={<IcOlho />} titulo="Guias e comportamento" desc="Alinhamento, grade e regiões." cor="#f43f5e">
        <Opcao titulo="Grade magnética" desc={`Alinha ao mover e redimensionar (${cfg.tamanhoGrade}px)`} termos="snap"><Interruptor rotulo="Grade magnética" valor={cfg.grade} aoMudar={(v) => set({ grade: v })} /></Opcao>
        <Opcao titulo="Guias inteligentes" desc="Linhas de alinhamento com outros itens ao arrastar"><Interruptor rotulo="Guias inteligentes" valor={cfg.guiasInteligentes} aoMudar={(v) => set({ guiasInteligentes: v })} /></Opcao>
        <Opcao titulo="Itens acompanham a região" desc="Padrão para novas regiões ao movê-las"><Interruptor rotulo="Itens acompanham a região" valor={cfg.itensAcompanhamRegiao} aoMudar={(v) => set({ itensAcompanhamRegiao: v })} /></Opcao>
        <Opcao titulo="Minimapa" desc="Canto inferior direito"><Interruptor rotulo="Minimapa" valor={vis.minimapa} aoMudar={(v) => setVisualizacao({ minimapa: v })} /></Opcao>
        <Opcao titulo="Réguas" desc="Coordenadas da lousa nas bordas"><Interruptor rotulo="Réguas" valor={vis.reguas} aoMudar={(v) => setVisualizacao({ reguas: v })} /></Opcao>
      </Cartao>

      <Cartao icone={<IcDados />} titulo="Dados e ajuda" desc="Nuvem, backups e atalhos." cor="#64748b">
        <Opcao titulo="Sincronização e backups" desc="Nuvem (banco de dados), exportar e importar"><button type="button" className="btn contorno" onClick={() => setUI({ painel: 'dados' })}>Abrir Dados</button></Opcao>
        <Opcao titulo="Atalhos de teclado" desc="Lista completa de teclas e gestos"><button type="button" className="btn contorno" onClick={() => setUI({ dialogo: { tipo: 'ajuda' } })}><IcAjuda width={16} height={16} /> Ver atalhos</button></Opcao>
        <Opcao titulo="Restaurar padrões" desc="Volta todas as opções acima ao estado inicial"><button type="button" className="btn contorno perigo" onClick={restaurar}>Restaurar</button></Opcao>
      </Cartao>
    </div>
  );
}
