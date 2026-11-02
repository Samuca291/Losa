// ============================================================
// GUIA DO JSON: tutorial completo, referência gerada a partir dos
// esquemas reais do validador, receitas testadas, validador ao vivo
// e execução da suíte de testes no navegador.
// ============================================================
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FONTES, PALETA, ROTULOS_MOTIVO, ROTULOS_STATUS, type TipoItem } from '../types';
import { criarLousaVazia, nomeTipo, setUI } from '../store';
import { CATALOGO } from '../utils/divisoes';
import { baixarArquivo } from '../utils/db';
import { ESTILOS_PERMITIDOS, TAGS_PERMITIDAS } from '../utils/seguranca';
import { analisarTexto, type AnaliseImportacao } from '../dados/importacao';
import { lerJSON } from '../dados/json';
import { descreverRegra, ESQUEMA_CONFIG, ESQUEMA_ESTUDO, ESQUEMA_FILTRO, ESQUEMA_VISUALIZACAO, MOTIVOS_ERRO, TIPOS_ITEM, type Esquema, type Regra } from '../dados/esquemas';
import { PADROES_TIPO } from '../dados/autoria';
import { FORMAS_ITEM } from '../dados/validacao';
import { EXEMPLOS, exemploJSON } from '../dados/exemplos';
import type { ResultadoTeste } from '../dados/testes';
import { FORMATO_AUTORIA, FORMATO_BACKUP, LIMITES, VERSAO_ENVELOPE } from '../dados/tipos';
import { ErroSintaxeView, RelatorioView, ResumoAnalise } from './DialogosDados';

const SECOES = [
  { id: 'visao', icone: '🧭', titulo: 'Visão geral' },
  { id: 'primeiro', icone: '🚀', titulo: 'Seu primeiro JSON em 2 minutos' },
  { id: 'sintaxe', icone: '📐', titulo: 'JSON em 6 regras' },
  { id: 'estrutura', icone: '🏗️', titulo: 'Estrutura do arquivo' },
  { id: 'valores', icone: '🔤', titulo: 'Ids, cores, datas, textos e limites' },
  { id: 'itens', icone: '🗒️', titulo: 'Itens: campos comuns' },
  { id: 'tipos', icone: '🧩', titulo: 'Os 15 tipos de item' },
  { id: 'estudo-itens', icone: '🎓', titulo: 'Flashcards, lacunas, revisão e erros' },
  { id: 'regioes', icone: '▦', titulo: 'Regiões e divisões automáticas' },
  { id: 'conectores', icone: '🔗', titulo: 'Conectores' },
  { id: 'camadas', icone: '📚', titulo: 'Camadas' },
  { id: 'config', icone: '⚙️', titulo: 'Configurações (config)' },
  { id: 'visualizacao', icone: '👁️', titulo: 'Visualização e filtros' },
  { id: 'estudo', icone: '🎯', titulo: 'Estudo, edital, questões e legenda' },
  { id: 'imagens', icone: '🖼️', titulo: 'Imagens embutidas' },
  { id: 'backup', icone: '🔐', titulo: 'Backup oficial e integridade' },
  { id: 'importar', icone: '📥', titulo: 'Como a importação funciona' },
  { id: 'receitas', icone: '🍳', titulo: 'Receitas prontas' },
  { id: 'erros', icone: '🩺', titulo: 'Erros comuns e soluções' },
  { id: 'validador', icone: '🧪', titulo: 'Validador ao vivo' },
  { id: 'testes', icone: '✅', titulo: 'Testes de integridade' },
  { id: 'referencia', icone: '📎', titulo: 'Referência rápida' },
] as const;

const CtxGuia = createContext<{ validar: (codigo: string) => void }>({ validar: () => {} });
const C = ({ children }: { children: ReactNode }) => <code className="guia-cod">{children}</code>;
const j = (v: unknown) => JSON.stringify(v, null, 2);
const j1 = (v: unknown) => JSON.stringify(v);

function realcar(codigo: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /("(?:\\.|[^"\\\n])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let i = 0, k = 0, m: RegExpExecArray | null;
  if (codigo.length > 60_000) return [codigo];
  while ((m = re.exec(codigo))) {
    if (m.index > i) out.push(codigo.slice(i, m.index));
    if (m[1]) { out.push(<span key={k++} className={m[2] ? 'tk-chave' : 'tk-texto'}>{m[1]}</span>); if (m[2]) out.push(m[2]); }
    else if (m[3]) out.push(<span key={k++} className="tk-lit">{m[3]}</span>);
    else out.push(<span key={k++} className="tk-num">{m[4]}</span>);
    i = re.lastIndex;
  }
  if (i < codigo.length) out.push(codigo.slice(i));
  return out;
}

function Codigo({ codigo, titulo = 'JSON', acoes = true, arquivo = 'exemplo-lousa.json' }: { codigo: string; titulo?: string; acoes?: boolean; arquivo?: string }) {
  const { validar } = useContext(CtxGuia); const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigo); } catch { const t = document.createElement('textarea'); t.value = codigo; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    setCopiado(true); window.setTimeout(() => setCopiado(false), 1500);
  };
  return (
    <div className="guia-bloco">
      <header><span className="flex-1 truncate">{titulo}</span>
        <button type="button" className="btn" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
        {acoes && <><button type="button" className="btn" onClick={() => validar(codigo)} title="Abrir no validador ao vivo">Validar</button><button type="button" className="btn" onClick={() => baixarArquivo(arquivo, codigo)}>Baixar</button><button type="button" className="btn" onClick={() => setUI({ dialogo: { tipo: 'importar', texto: codigo } })}>Importar</button></>}
      </header>
      <pre><code>{realcar(codigo)}</code></pre>
    </div>
  );
}
function Tabela({ cab, linhas }: { cab: string[]; linhas: ReactNode[][] }) {
  return <div className="guia-tabela-wrap"><table className="guia-tabela"><thead><tr>{cab.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{linhas.map((l, i) => <tr key={i}>{l.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>;
}
function Nota({ tipo = 'info', children }: { tipo?: 'dica' | 'atencao' | 'info' | 'perigo'; children: ReactNode }) {
  const ic = { dica: '💡', atencao: '⚠️', info: 'ℹ️', perigo: '⛔' }[tipo];
  return <div className={`guia-nota ${tipo}`}><span aria-hidden="true">{ic}</span><div>{children}</div></div>;
}
function TabelaEsquema<T extends object>({ esquema, padrao }: { esquema: Esquema<T>; padrao: T }) {
  return <Tabela cab={['Campo', 'Valores aceitos', 'Padrão', 'O que faz']} linhas={(Object.keys(esquema) as (keyof T & string)[]).map((k) => { const r = esquema[k] as Regra; return [k, <C key="t">{descreverRegra(r)}</C>, <C key="p">{j1((padrao as Record<string, unknown>)[k])}</C>, r.desc]; })} />;
}
function Secao({ id, children }: { id: (typeof SECOES)[number]['id']; children: ReactNode }) {
  const s = SECOES.find((x) => x.id === id)!; const n = SECOES.indexOf(s) + 1;
  return <section id={`guia-${id}`} className="guia-secao" aria-labelledby={`guia-t-${id}`}><h2 id={`guia-t-${id}`}><span aria-hidden="true">{s.icone}</span>{n}. {s.titulo}</h2>{children}</section>;
}

// ---------- Conteúdo de referência ----------
const CAMPOS_ITEM: [string, ReactNode, string, ReactNode][] = [
  ['id', 'texto: letras, números, _ e - (até 64)', 'gerado', 'Identificador único. Só é necessário para ligar conectores ao item (ou para reimportar sem duplicar).'],
  ['tipo', <C key="t">{TIPOS_ITEM.join(' | ')}</C>, '"postit"', 'Tipo do item (seção 7). Tipo desconhecido vira "postit" com aviso e sugestão.'],
  ['texto ✍️', 'texto puro', '—', <>Conteúdo em texto simples: <C>{'<'}</C> e <C>&</C> aparecem como digitados; <C>\n</C> quebra a linha.</>],
  ['frente ✍️', 'texto puro', '—', 'Sinônimo de "texto" (combina com "verso" em flashcards).'],
  ['html', 'HTML (filtrado)', '""', <>Conteúdo rico (negrito, listas, títulos, links…). Tem prioridade sobre <C>texto</C>. Veja as tags aceitas na seção 5.</>],
  ['titulo', 'texto (até 120)', '""', 'Título do item (aparece no topo e na busca). Tags HTML são removidas.'],
  ['x, y', 'número', 'automático', 'Canto superior esquerdo, em pixels da lousa (y cresce para baixo). Sem x/y o item é posicionado sozinho.'],
  ['w, h', 'número 10 a 10 000', 'pelo tipo', 'Largura e altura em pixels.'],
  ['angulo', 'número −360 a 360', '0', 'Rotação em graus, sentido horário.'],
  ['z', 'número ≥ 0', 'ordem da lista', 'Empilhamento: maior fica por cima.'],
  ['cor', 'cor ou nome da paleta', 'pelo tipo', <>Fundo do item: <C>"amarelo"</C>, <C>"#ffcc80"</C>, <C>"transparent"</C>…</>],
  ['corTexto', 'cor', 'automática', 'Cor da letra (sem ela, o contraste é calculado).'],
  ['fonte', <C key="f">{FONTES.map((f) => f.nome).join(' | ')}</C>, '"Padrão"', 'Família tipográfica.'],
  ['tamanhoFonte', 'número 8 a 120', '15 (32 no título)', 'Tamanho da letra em pixels.'],
  ['autoAjuste', 'true | false', 'false', 'A altura acompanha o texto.'],
  ['etiquetas', 'lista ou "a, b"', '[]', 'Marcadores para filtro, busca e intercalação da revisão (até 50; repetidas são removidas).'],
  ['status', 'nao-visto | estudando | revisar | dominado', '"nao-visto"', 'Situação de estudo. Aceita também os rótulos: "Não visto", "Estudando", "Revisar", "Dominado".'],
  ['regiao', 'id, nome ou "Mãe / Filha"', 'nenhuma', 'Região do item. Sem x/y, o item é arrumado dentro dela.'],
  ['camada', 'id ou nome', '"principal"', 'Camada (seção 11).'],
  ['grupo', 'texto (id)', 'null', 'Itens com o mesmo grupo se movem juntos.'],
  ['travado · oculto · fixado', 'true | false', 'false', 'Não pode ser movido/editado · escondido · preso.'],
  ['criadoEm · alteradoEm', 'data', 'agora', 'Milissegundos ou "AAAA-MM-DD".'],
];
const TIPOS_DOC: { tipo: TipoItem; desc: string; campos: ReactNode; exemplo: object }[] = [
  { tipo: 'postit', desc: 'O bloco de anotação clássico. O tamanho segue config.tamanhoPostit.', campos: 'texto/html, titulo, cor, verso', exemplo: { texto: 'Princípio da legalidade', cor: 'amarelo' } },
  { tipo: 'texto', desc: 'Texto solto, sem fundo.', campos: 'texto/html, tamanhoFonte, corTexto', exemplo: { tipo: 'texto', texto: 'Anotação solta' } },
  { tipo: 'titulo', desc: 'Título grande para nomear áreas da lousa.', campos: 'texto/html, tamanhoFonte', exemplo: { tipo: 'titulo', texto: 'Direito Penal' } },
  { tipo: 'caixa', desc: 'Cartão branco para textos longos, listas e tabelas em HTML.', campos: 'html', exemplo: { tipo: 'caixa', html: '<h3>Resumo</h3><ul><li>tópico</li></ul>' } },
  { tipo: 'tarefas', desc: 'Checklist. Cada tarefa: "[x] feita", "[ ] pendente" ou { "texto", "feito" }.', campos: 'tarefas (até 200)', exemplo: { tipo: 'tarefas', titulo: 'Hoje', tarefas: ['[x] Lei seca', '[ ] 20 questões'] } },
  { tipo: 'tabela', desc: 'Tabela editável: lista de linhas (a 1ª é o cabeçalho). Linhas curtas são completadas.', campos: 'tabela (até 100 × 30)', exemplo: { tipo: 'tabela', tabela: [['Prazo', 'Dias'], ['Contestação', '15']] } },
  { tipo: 'imagem', desc: 'PNG, JPEG, WebP ou GIF (seção 15). Opacidade 0–1 e recorte normalizado 0–1.', campos: 'imagem ou imagemId, opacidade, recorte', exemplo: { tipo: 'imagem', imagem: 'data:image/png;base64,…', w: 300, h: 200 } },
  { tipo: 'link', desc: 'Cartão de link. Só http://, https:// e mailto:. Sem título, usa o domínio.', campos: 'url, titulo', exemplo: { tipo: 'link', url: 'https://www.stf.jus.br' } },
  { tipo: 'desenho', desc: 'Traços à mão livre. Pontos relativos ao item (0..w, 0..h). Vai para a camada "anotacoes".', campos: 'tracos: [{ pontos, cor, espessura, marcaTexto }]', exemplo: { tipo: 'desenho', w: 120, h: 60, tracos: [{ cor: '#dc2626', espessura: 3, pontos: [{ x: 0, y: 50 }, { x: 120, y: 10 }] }] } },
  { tipo: 'forma', desc: 'Forma geométrica preenchida.', campos: <>forma: <C>{FORMAS_ITEM.join(', ')}</C></>, exemplo: { tipo: 'forma', forma: 'losango', cor: 'azul' } },
  { tipo: 'cloze', desc: 'Texto com lacunas: {{resposta}} fica escondida no modo prova.', campos: 'texto/html com {{ }}', exemplo: { tipo: 'cloze', texto: 'O prazo do MS é de {{120}} dias.' } },
  { tipo: 'contador', desc: 'Contador com botões + e −.', campos: 'valor, titulo', exemplo: { tipo: 'contador', titulo: 'Questões', valor: 0 } },
  { tipo: 'fita', desc: 'Fita adesiva decorativa (nasce inclinada −8°).', campos: 'cor, angulo', exemplo: { tipo: 'fita', x: 100, y: 90 } },
  { tipo: 'pino', desc: 'Alfinete decorativo.', campos: 'cor', exemplo: { tipo: 'pino', cor: 'vermelho' } },
  { tipo: 'carimbo', desc: 'Carimbo em letras grandes (inclinado −12°).', campos: 'carimbo (até 30 letras), cor', exemplo: { tipo: 'carimbo', carimbo: 'cai muito' } },
];
const ERROS: [string, string, string][] = [
  ['Vírgula sobrando antes de "}" / "]"', '{ "a": 1, }', 'Apague a vírgula depois do último campo ou elemento.'],
  ['Faltou uma vírgula entre dois campos', '{ "a": 1 "b": 2 }', 'Separe cada par "campo": valor com vírgula.'],
  ['Nome de campo sem aspas', '{ texto: "x" }', 'Escreva "texto": "x".'],
  ['Aspas simples não são permitidas', "{ 'texto': 'x' }", 'Use aspas duplas " ".'],
  ['Aspas “curvas”', '{ “texto”: “x” }', 'Word/WhatsApp trocam as aspas. Use o Bloco de Notas ou um editor de código.'],
  ['Comentários não são permitidos', '// observação', 'Apague o comentário.'],
  ['Quebra de linha dentro de um texto', '"linha 1⏎linha 2"', 'Dentro das aspas, use \\n no lugar do Enter.'],
  ['Escape inválido', '"C:\\pasta"', 'Barra invertida se escreve \\\\ (duas).'],
  ['Formato não reconhecido', '{ "posts": [] }', 'O arquivo precisa ter "itens", "regioes", "conectores", "edital", "questoes", "doc" ou ser um backup.'],
  ['Região "X" não existe', '"regiao": "Penal"', 'Declare a região em "regioes" com esse nome. Acentos e maiúsculas não importam.'],
  ['Conector descartado: origem/destino não corresponde a nenhum item', '"de": "a1"', 'Dê "id": "a1" ao item. Ids diferenciam maiúsculas de minúsculas.'],
  ['Cor inválida', '"cor": "amarelinho"', 'Use um nome da paleta ("amarelo") ou hexadecimal ("#fff176").'],
  ['Tipo desconhecido / chave desconhecida', '"tipo": "nota", "titlo": "x"', 'O relatório sugere o nome certo ("você quis dizer…").'],
  ['Conteúdo NÃO confere com o hash', 'backup editado à mão', 'Esperado se você editou um backup. Se não editou, o arquivo pode estar corrompido: use outro.'],
  ['Os itens não aparecem na tela', '"x": 50000', 'Eles estão longe: use "Ver tudo" (botão de enquadrar).'],
  ['Arquivo grande demais', '> 200 MB', 'Exporte sem imagens ou divida em várias lousas.'],
];
const ENVELOPE_DOC = { formato: FORMATO_BACKUP, versao: VERSAO_ENVELOPE, tipo: 'lousa-estudos', aplicativo: { nome: 'Lousa Digital de Estudos', versao: '2.1.0' }, exportadoEm: '2026-03-10T14:30:00.000Z', conteudo: 'lousa', lousa: { versao: 1, id: '…', nome: '…', doc: { itens: {}, regioes: {}, conectores: {}, camadas: [] }, config: {}, '…': '…' }, imagens: { 'img-1': 'data:image/png;base64,…' }, resumo: { lousas: 1, itens: 42, regioes: 5, conectores: 9, imagens: 1, bytesImagens: 18234 }, integridade: { algoritmo: 'SHA-256', escopo: 'conteudo', hash: '9f2c…64 caracteres hexadecimais…' } };

// ---------- Validador ao vivo ----------
function Validador({ texto, setTexto }: { texto: string; setTexto: (s: string) => void }) {
  const [a, setA] = useState<AnaliseImportacao | null>(null); const [ocupado, setOcupado] = useState(false);
  const validar = async () => { setOcupado(true); try { setA(await analisarTexto(texto, 'validador')); } finally { setOcupado(false); } };
  useEffect(() => { setA(null); }, [texto]);
  const formatar = () => { const r = lerJSON(texto); if (r.ok) setTexto(j(r.valor)); else validar(); };
  return (
    <div className="flex flex-col gap-2">
      <textarea className="campo font-mono text-xs" rows={14} spellCheck={false} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="JSON para validar" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn primario" disabled={ocupado || !texto.trim()} onClick={validar}>{ocupado ? 'Validando…' : '🧪 Validar'}</button>
        <button type="button" className="btn contorno" onClick={formatar}>Formatar</button>
        <button type="button" className="btn contorno" disabled={!a?.ok} onClick={() => setUI({ dialogo: { tipo: 'importar', texto } })}>Importar este JSON…</button>
        <button type="button" className="btn contorno" onClick={() => baixarArquivo('minha-lousa.json', texto)}>Baixar</button>
        <select className="campo !w-auto !py-1 text-sm" value="" aria-label="Carregar exemplo" onChange={(e) => { if (e.target.value) setTexto(exemploJSON(e.target.value)); }}><option value="">Carregar exemplo…</option>{EXEMPLOS.map((x) => <option key={x.id} value={x.id}>{x.icone} {x.titulo}</option>)}</select>
        <button type="button" className="btn" onClick={() => setTexto('')}>Limpar</button>
      </div>
      {a && (a.ok ? <><ResumoAnalise a={a} /><RelatorioView rel={a.relatorio} /></> : a.erroSintaxe ? <ErroSintaxeView erro={a.erroSintaxe} /> : <Nota tipo="perigo">{a.erroFatal}</Nota>)}
    </div>
  );
}

function Testes() {
  const [res, setRes] = useState<ResultadoTeste[] | null>(null); const [prog, setProg] = useState<[number, number] | null>(null);
  const rodar = async () => { setRes(null); const { executarTestes } = await import('../dados/testes'); const t0 = performance.now(); const r = await executarTestes((f, t) => setProg([f, t])); setProg(null); setRes(r); setDur(Math.round(performance.now() - t0)); };
  const [dur, setDur] = useState(0);
  const grupos = res ? [...new Set(res.map((r) => r.grupo))] : [];
  const ok = res?.filter((r) => r.passou).length ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn primario" disabled={!!prog} onClick={rodar}>{prog ? `Rodando ${prog[0]}/${prog[1]}…` : '▶ Rodar todos os testes'}</button>{res && <span className={`chip ${ok === res.length ? 'ok' : 'perigo'}`}>{ok}/{res.length} passaram · {dur} ms</span>}</div>
      {res && grupos.map((g) => (
        <details key={g} open={res.some((r) => r.grupo === g && !r.passou)} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--ui-borda)' }}>
          <summary className="cursor-pointer text-sm font-semibold">{res.filter((r) => r.grupo === g).every((r) => r.passou) ? '✅' : '❌'} {g} ({res.filter((r) => r.grupo === g && r.passou).length}/{res.filter((r) => r.grupo === g).length})</summary>
          <ul className="mt-1 text-xs">{res.filter((r) => r.grupo === g).map((r) => <li key={r.nome} className="flex gap-2 border-b py-1" style={{ borderColor: 'var(--ui-borda)' }}><span>{r.passou ? '✅' : '❌'}</span><span className="flex-1">{r.nome}{r.erro && <span className="block" style={{ color: 'var(--ui-perigo)' }}>{r.erro}</span>}</span><span className="opacity-60">{r.ms} ms</span></li>)}</ul>
        </details>
      ))}
    </div>
  );
}

// ---------- Guia ----------
export function GuiaJSON({ secaoInicial }: { secaoInicial?: string }) {
  const conteudo = useRef<HTMLDivElement>(null); const [ativa, setAtiva] = useState<string>(secaoInicial ?? 'visao');
  const [pg, setPg] = useState(exemploJSON('minimo'));
  const padrao = criarLousaVazia(); const fechar = () => setUI({ dialogo: null });
  const irPara = (id: string) => { const c = conteudo.current; const el = c?.querySelector<HTMLElement>(`#guia-${id}`); if (c && el) { c.scrollTo({ top: el.offsetTop - 6, behavior: 'smooth' }); setAtiva(id); } };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', k, true); if (secaoInicial) window.setTimeout(() => irPara(secaoInicial), 40);
    return () => document.removeEventListener('keydown', k, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const aoRolar = () => { const c = conteudo.current; if (!c) return; let atual: string = SECOES[0].id; for (const s of SECOES) { const el = c.querySelector<HTMLElement>(`#guia-${s.id}`); if (el && el.offsetTop - 60 <= c.scrollTop) atual = s.id; } if (atual !== ativa) setAtiva(atual); };
  const validar = (codigo: string) => { setPg(codigo); window.setTimeout(() => irPara('validador'), 20); };

  return (
    <CtxGuia.Provider value={{ validar }}>
      <div className="dialogo-fundo" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
        <div className="guia-json ui surgir" role="dialog" aria-modal="true" aria-label="Guia completo do JSON" onKeyDown={(e) => e.stopPropagation()}>
          <header className="guia-topo">
            <span className="text-2xl" aria-hidden="true">📘</span>
            <div className="min-w-0 flex-1"><h1 className="text-lg font-extrabold leading-tight">Guia completo do JSON da lousa</h1><p className="text-xs opacity-70">Como criar, validar, importar e exportar — com cada campo explicado e exemplos testados.</p></div>
            <button type="button" className="btn contorno hidden sm:inline-flex" onClick={() => irPara('validador')}>🧪 Validador</button>
            <button type="button" className="btn" aria-label="Fechar guia" onClick={fechar}>✕</button>
          </header>
          <div className="guia-corpo">
            <nav className="guia-indice" aria-label="Seções do guia">{SECOES.map((s, i) => <button key={s.id} type="button" aria-current={ativa === s.id} onClick={() => irPara(s.id)}><span aria-hidden="true">{s.icone}</span><span>{i + 1}. {s.titulo}</span></button>)}</nav>
            <div ref={conteudo} className="guia-conteudo" onScroll={aoRolar}>
              <select className="campo guia-indice-movel mt-3" value={ativa} aria-label="Ir para a seção" onChange={(e) => irPara(e.target.value)}>{SECOES.map((s, i) => <option key={s.id} value={s.id}>{s.icone} {i + 1}. {s.titulo}</option>)}</select>

              <Secao id="visao">
                <p>A lousa lê e grava arquivos <b>JSON</b>, um formato de texto simples e universal. Com ele você pode <b>montar lousas inteiras fora do site</b> (à mão, numa planilha, com um script ou pedindo a uma IA), <b>fazer backup</b>, levar seus estudos para outro computador e compartilhar material com colegas.</p>
                <div className="guia-cartoes">
                  <div className="guia-cartao"><b>✍️ Formato simplificado</b><p className="text-xs opacity-80">O mais fácil de escrever. Ids e posições são opcionais, cores e regiões podem ser chamadas pelo nome. É o foco deste guia.</p></div>
                  <div className="guia-cartao"><b>🔐 Backup oficial</b><p className="text-xs opacity-80">Gerado por <i>Exportar .json</i>. Contém absolutamente tudo e um hash SHA-256 que detecta qualquer alteração. Não precisa ser editado.</p></div>
                  <div className="guia-cartao"><b>📋 Lista simples</b><p className="text-xs opacity-80">Um array de textos: <C>["item 1", "item 2"]</C> vira um post-it por texto.</p></div>
                </div>
                <h3>Onde importar</h3>
                <ul><li>Painel <b>Dados</b> → <b>⬆ Importar .json</b>;</li><li>arrastando o arquivo <C>.json</C> para cima da lousa;</li><li>no <b>Validador ao vivo</b> (seção 20), colando o texto;</li><li>pela paleta de comandos (<kbd>Ctrl</kbd>+<kbd>K</kbd>) → “Importar JSON”.</li></ul>
                <Nota tipo="dica">Toda importação mostra antes um <b>relatório</b> com o que foi entendido, corrigido ou descartado. Você só confirma depois de ler, e nada do arquivo é executado: textos e HTML passam pelo filtro de segurança.</Nota>
              </Secao>

              <Secao id="primeiro">
                <div className="guia-passos">
                  <div className="guia-passo"><b>Abra um editor de texto.</b> Bloco de Notas, TextEdit (modo texto simples) ou VS Code. Evite o Word, que troca as aspas.</div>
                  <div className="guia-passo"><b>Cole o exemplo abaixo.</b> É um JSON completo e válido.<Codigo codigo={exemploJSON('minimo')} titulo="minha-lousa.json" arquivo="minha-lousa.json" /></div>
                  <div className="guia-passo"><b>Salve como <C>minha-lousa.json</C></b>, com codificação <b>UTF-8</b> (padrão em quase todos os editores).</div>
                  <div className="guia-passo"><b>Importe.</b> Dados → ⬆ Importar .json, ou arraste o arquivo para a lousa. Também dá para clicar em <b>Importar</b> no bloco acima.</div>
                  <div className="guia-passo"><b>Leia o relatório e confirme.</b> O padrão é criar uma <b>nova lousa</b>, então a atual não é tocada.</div>
                </div>
                <h3>Agora, com um pouco mais</h3>
                <Codigo codigo={j({ nome: 'Minha primeira lousa', itens: [{ titulo: 'Conceito', texto: 'Ato administrativo é a manifestação unilateral de vontade da Administração.', cor: 'amarelo' }, { texto: 'Atributos: PATI', cor: 'azul', etiquetas: ['administrativo'] }, { tipo: 'titulo', texto: 'Administrativo', x: 0, y: -100 }] })} />
                <p>Você acabou de usar <C>titulo</C>, <C>cor</C> por nome, <C>etiquetas</C>, o tipo <C>titulo</C> e posição manual (<C>x</C>, <C>y</C>). Os itens sem posição são arrumados em grade automaticamente.</p>
              </Secao>

              <Secao id="sintaxe">
                <ol>
                  <li><b>Textos e nomes de campo usam aspas duplas:</b> <C>"nome": "Penal"</C>.</li>
                  <li><b>Objeto</b> <C>{'{ }'}</C> é um conjunto de pares <C>"campo": valor</C> separados por vírgula. <b>Lista</b> <C>[ ]</C> são valores separados por vírgula.</li>
                  <li><b>Nada de vírgula depois do último</b> elemento: <C>[1, 2, 3]</C>, nunca <C>[1, 2, 3,]</C>.</li>
                  <li><b>Números sem aspas e com ponto:</b> <C>0.5</C>, <C>120</C>. Sim/não são <C>true</C>/<C>false</C>; “vazio” é <C>null</C>.</li>
                  <li><b>Sem comentários</b> (<C>//</C> ou <C>/* */</C>).</li>
                  <li><b>Dentro de textos:</b> quebra de linha é <C>\n</C>, aspas são <C>\"</C> e barra invertida é <C>\\</C>.</li>
                </ol>
                <Tabela cab={['Tipo', 'Exemplo', 'Uso na lousa']} linhas={[['texto', <C key="a">"Crase"</C>, 'nomes, conteúdos, cores, datas'], ['número', <C key="b">200</C>, 'posições, tamanhos, contadores'], ['booleano', <C key="c">true</C>, 'ligar/desligar opções'], ['nulo', <C key="d">null</C>, '“nenhum” (ex.: sem data de prova)'], ['lista', <C key="e">["a", "b"]</C>, 'itens, etiquetas, tarefas'], ['objeto', <C key="f">{'{ "x": 0, "y": 0 }'}</C>, 'cada item, região, configuração']]} />
                <Nota tipo="dica">Errou a sintaxe? O validador aponta <b>linha, coluna e a causa provável em português</b> (vírgula sobrando, aspas curvas, comentário…) e mostra o trecho com um <C>^</C> embaixo do erro.</Nota>
              </Secao>

              <Secao id="estrutura">
                <p>No formato simplificado, tudo fica no <b>primeiro nível</b> do objeto. Todos os campos são opcionais, mas o arquivo precisa ter ao menos um de <C>itens</C>, <C>regioes</C>, <C>conectores</C>, <C>edital</C> ou <C>questoes</C>.</p>
                <Tabela cab={['Campo', 'Tipo', 'O que é']} linhas={[
                  ['formato', 'texto', <>Opcional: <C>"{FORMATO_AUTORIA}"</C> deixa explícito que é o formato simplificado.</>],
                  ['nome', 'texto (até 80)', 'Nome da lousa. Padrão: “Lousa importada”.'],
                  ['itens', 'lista', 'Post-its e demais itens (seções 6 a 8). Também aceita textos soltos.'],
                  ['regioes', 'lista', 'Divisões da lousa, com hierarquia e divisão automática (seção 9).'],
                  ['conectores', 'lista', 'Linhas entre itens (seção 10).'],
                  ['camadas', 'lista', 'Camadas extras, além das 5 padrão (seção 11).'],
                  ['config', 'objeto', 'Aparência e comportamento (seção 12).'],
                  ['visualizacao', 'objeto', 'O que aparece na tela e filtros (seção 13).'],
                  ['estudo · edital · questoes · legenda', 'objeto/lista', 'Metas, revisão espaçada, edital, histórico de questões e legenda de cores (seção 14).'],
                  ['imagens', 'objeto', 'Mapa { id: "data:image/..." } referenciado por imagemId (seção 15).'],
                  ['camera', 'objeto', '{ "x", "y", "zoom" } inicial. Sem ela, a lousa enquadra o conteúdo sozinha.'],
                  ['visoesSalvas · modelosDivisao · lixeira · arquivada', '—', 'Campos avançados, iguais aos do backup oficial.'],
                ]} />
                <Codigo codigo={exemploJSON('esqueleto')} titulo="Esqueleto com todos os blocos principais" arquivo="esqueleto-lousa.json" />
                <Nota>Também é aceito o <b>documento interno</b> (o que fica dentro de um backup): <C>{'{ "versao": 1, "nome": "...", "doc": { "itens": {...}, "regioes": {...}, "conectores": {...}, "camadas": [...] } }'}</C>. Nele, <C>itens</C> pode ser lista ou dicionário <C>{'{ "id": {...} }'}</C>. Os atalhos marcados com ✍️ neste guia valem só no formato simplificado.</Nota>
              </Secao>

              <Secao id="valores">
                <h3>Ids</h3>
                <p>Letras sem acento, números, <C>_</C> e <C>-</C>, com até 64 caracteres (ex.: <C>"art-5"</C>, <C>"conceito_1"</C>). São <b>opcionais</b>: servem para ligar conectores e referenciar regiões. Id inválido (ex.: <C>"meu item"</C>, com espaço) é trocado automaticamente, e os conectores do mesmo arquivo continuam apontando para o item certo. Id repetido ganha um novo, com aviso.</p>
                <h3>Cores</h3>
                <p>Aceitas: <C>#rgb</C>, <C>#rgba</C>, <C>#rrggbb</C>, <C>#rrggbbaa</C>, <C>rgb()</C>/<C>rgba()</C>, <C>hsl()</C>/<C>hsla()</C>, <C>"transparent"</C> e os <b>nomes da paleta</b> ✍️ (sem diferenciar acento ou maiúscula):</p>
                <div className="flex flex-wrap gap-1.5">{PALETA.map((p) => <span key={p.nome} className="chip"><span className="inline-block h-3 w-3 rounded-sm border" style={{ background: p.cor }} />{p.nome.toLowerCase()} <span className="opacity-60">{p.cor}</span></span>)}<span className="chip">transparente</span></div>
                <h3>Datas</h3>
                <p>Milissegundos desde 1970 (<C>1767225600000</C>), <C>"AAAA-MM-DD"</C> (meia-noite no seu fuso), <C>"AAAA-MM-DDTHH:MM"</C> ou <C>"DD/MM/AAAA"</C>. A data da prova é gravada sempre como <C>"AAAA-MM-DD"</C>.</p>
                <h3>Texto puro × HTML</h3>
                <p><C>texto</C> ✍️ é mostrado exatamente como escrito. <C>html</C> permite formatação, mas passa por um filtro que mantém só as tags: <C>{TAGS_PERMITIDAS.join(', ')}</C>. No atributo <C>style</C> sobrevivem apenas: <C>{ESTILOS_PERMITIDOS.join(', ')}</C>. Links aceitam só <C>http</C>, <C>https</C> e <C>mailto</C> e abrem em nova aba com <C>noopener</C>. Scripts, imagens, iframes, SVG e atributos <C>on*</C> são removidos, e o relatório avisa.</p>
                <Codigo acoes={false} titulo="HTML aceito" codigo={j({ html: '<b>Negrito</b>, <i>itálico</i>, <mark>realce</mark>, <span style="color: #dc2626">vermelho</span><ul><li>lista</li></ul><a href="https://www.planalto.gov.br">link</a>' })} />
                <h3>Coordenadas</h3>
                <p>A lousa é infinita: <C>x</C> cresce para a direita e <C>y</C> para baixo, em pixels com zoom 100%. Um post-it médio tem 200×200.</p>
                <h3>Limites de segurança</h3>
                <Tabela cab={['O quê', 'Limite']} linhas={[['Tamanho do arquivo', `${LIMITES.bytesArquivo / 1048576} MB`], ['Itens por lousa', LIMITES.itens.toLocaleString('pt-BR')], ['Regiões / conectores', `${LIMITES.regioes.toLocaleString('pt-BR')} / ${LIMITES.conectores.toLocaleString('pt-BR')}`], ['Camadas', LIMITES.camadas], ['HTML por item', `${LIMITES.html.toLocaleString('pt-BR')} caracteres`], ['Imagens / tamanho de cada', `${LIMITES.imagens} / ${LIMITES.bytesImagem / 1048576} MB`], ['Lousas por pacote', LIMITES.lousasPorPacote], ['Aninhamento do JSON', `${LIMITES.profundidadeJSON} níveis`], ['Edital / questões', `${LIMITES.edital} / ${LIMITES.questoes}`]]} />
              </Secao>

              <Secao id="itens">
                <p>Cada elemento de <C>itens</C> é um objeto, ou simplesmente um texto (<C>"Crase"</C> é igual a <C>{'{ "texto": "Crase" }'}</C>). Campos comuns a todos os tipos (✍️ = só no formato simplificado):</p>
                <Tabela cab={['Campo', 'Valores', 'Padrão', 'Descrição']} linhas={CAMPOS_ITEM.map((l) => [l[0], l[1], l[2], l[3]])} />
                <h3>Posicionamento automático</h3>
                <p>Itens sem <C>x</C>/<C>y</C> são colocados em grade, da esquerda para a direita e de cima para baixo, com 16 px de espaço: <b>dentro da região</b> indicada em <C>regiao</C> (abaixo do título dela) ou, sem região, <b>abaixo de todas as regiões</b>. Itens com posição explícita não são mexidos.</p>
                <Codigo codigo={j({ nome: 'Item completo', itens: [{ id: 'sv13', tipo: 'postit', titulo: 'Súmula Vinculante 13', texto: 'Proíbe o nepotismo na administração pública.', cor: 'lavanda', etiquetas: ['constitucional', 'súmula'], status: 'estudando', x: 120, y: 80, w: 240, h: 200, angulo: -2, tamanhoFonte: 16 }] })} />
              </Secao>

              <Secao id="tipos">
                <p>Tamanho e cor padrão de cada tipo, campos específicos e um exemplo mínimo:</p>
                <div className="flex flex-col gap-3">{TIPOS_DOC.map((t) => (
                  <div key={t.tipo} className="guia-cartao">
                    <div className="flex flex-wrap items-baseline gap-2"><b>{nomeTipo(t.tipo)}</b><C>"tipo": "{t.tipo}"</C><span className="text-xs opacity-60">{PADROES_TIPO[t.tipo].w}×{PADROES_TIPO[t.tipo].h}px · cor {PADROES_TIPO[t.tipo].cor}</span></div>
                    <p className="text-sm">{t.desc}</p><p className="text-xs opacity-75">Campos: {t.campos}</p>
                    <Codigo acoes={false} titulo={`Exemplo: ${t.tipo}`} codigo={j1(t.exemplo)} />
                  </div>
                ))}</div>
                <p>Veja todos juntos na receita <b>“Um item de cada tipo”</b> (seção 18).</p>
              </Secao>

              <Secao id="estudo-itens">
                <h3>Flashcards (frente e verso)</h3>
                <p>Use <C>frente</C> (ou <C>texto</C>/<C>html</C>) e <C>verso</C>. O verso aceita texto ou HTML; para garantir texto puro, use <C>versoTexto</C> ✍️. <C>virado: true</C> começa mostrando o verso. Cartões entram no CSV de revisão.</p>
                <h3>Lacunas (cloze)</h3>
                <p>No tipo <C>cloze</C>, escreva <C>{'{{resposta}}'}</C>: no modo prova a resposta fica escondida até você clicar.</p>
                <h3>Revisão espaçada</h3>
                <p>✍️ <C>"revisao": true</C> ativa a revisão com a primeira data para hoje e marca o status como <C>revisar</C>. A forma completa é:</p>
                <Codigo acoes={false} codigo={j({ revisao: { ativa: true, indice: 0, proxima: '2026-04-01', historico: [{ data: '2026-03-20', acertou: true }] } })} />
                <p><C>indice</C> é a posição na sequência <C>estudo.intervalos</C> (padrão 1, 7 e 30 dias). Revisão ativa sem data é marcada para hoje.</p>
                <h3>Status</h3>
                <Tabela cab={['Valor', 'Rótulo também aceito ✍️']} linhas={Object.entries(ROTULOS_STATUS).map(([k, r]) => [k, r])} />
                <h3>Caderno de erros</h3>
                <p>O campo <C>erro</C> transforma o item num registro do caderno de erros:</p>
                <Tabela cab={['Campo', 'Tipo', 'Descrição']} linhas={[['disciplina', 'texto (80)', 'Ex.: Administrativo'], ['assunto', 'texto (120)', 'Ex.: Atributos do ato'], ['banca', 'texto (40)', 'Ex.: CEBRASPE'], ['ano', 'texto (8)', 'Ex.: "2024"'], ['oQueErrei', 'texto (2000)', 'O que você marcou/pensou'], ['motivo', <C key="m">{MOTIVOS_ERRO.join(' | ')}</C>, Object.entries(ROTULOS_MOTIVO).map(([k, v]) => `${k} = ${v}`).join(' · ')], ['respostaCerta', 'texto (2000)', 'O gabarito explicado'], ['fonte', 'texto (300)', 'Número da questão, link…']]} />
                <Codigo codigo={exemploJSON('erros')} titulo="Receita: caderno de erros" />
              </Secao>

              <Secao id="regioes">
                <p>Regiões dividem a lousa em áreas (disciplinas, colunas, quadrantes…). Os itens podem ficar dentro delas e acompanhá-las ao serem movidas.</p>
                <Tabela cab={['Campo', 'Valores', 'Descrição']} linhas={[
                  ['id', 'id', 'Opcional. Itens e outras regiões também podem citar a região pelo nome.'],
                  ['nome', 'texto (120)', 'Nome exibido no rótulo.'],
                  ['x, y, w, h ✍️ ou bbox', 'números', <>Retângulo da região. <C>bbox</C> é a forma interna: <C>{'{ "x", "y", "w", "h" }'}</C>. Sem posição, a região é colocada à direita da anterior (900×600).</>],
                  ['cor ✍️', 'cor ou nome', 'Atalho para estilo.cor.'],
                  ['estilo', 'objeto', <>cor, opacidade (0–1), corBorda, espessuraBorda (0–20), estiloBorda (<C>solida | tracejada | pontilhada | dupla</C>), raio (0–100), icone (emoji), padrao (<C>nenhum | listras | pontos | grade</C>), rotuloAngulo, numerar, mostrarTitulo</>],
                  ['pai', 'id ou nome', 'Região-mãe. Ciclos (A dentro de B dentro de A) são quebrados automaticamente.'],
                  ['filhos', 'lista de ids ✍️ ou de objetos', 'Objetos aninhados viram regiões filhas; as que não têm posição dividem a mãe em partes iguais.'],
                  ['divisao ✍️', 'texto ou objeto', 'Divide a região usando o catálogo do menu Dividir (abaixo).'],
                  ['pontos', 'lista de {x, y} (≥ 3)', 'Polígono livre (região não retangular).'],
                  ['recolhida · oculta · travada · ima · itensAcompanham', 'true | false', 'Comportamentos da região.'],
                ]} />
                <h3>Divisão automática ✍️</h3>
                <p>Formas aceitas para <C>divisao</C>:</p>
                <Tabela cab={['Forma', 'Resultado']} linhas={[
                  [<C key="1">"divisao": "kanban"</C>, 'Usa o método do catálogo pelo id, com os parâmetros padrão.'],
                  [<C key="2">{'{ "colunas": 3 }'}</C>, '3 colunas iguais.'],
                  [<C key="3">{'{ "colunas": [1, 2, 1], "nomes": ["A", "B", "C"] }'}</C>, 'Colunas proporcionais e com nomes.'],
                  [<C key="4">{'{ "linhas": 2 }'}</C>, '2 faixas horizontais.'],
                  [<C key="5">{'{ "linhas": 2, "colunas": 3 }'}</C>, 'Grade 2 × 3.'],
                  [<C key="6">{'{ "metodo": "pizza", "n": 8, "nomes": ["…"] }'}</C>, 'Qualquer método do catálogo, com parâmetros (números são limitados à faixa permitida).'],
                  [<C key="7">{'{ …, "cores": ["verde", "#ffcc00"] }'}</C>, 'Cores das partes, na ordem.'],
                ]} />
                <p>Depois da divisão, as partes podem ser citadas pelo nome em <C>"regiao"</C> dos itens, inclusive com o caminho <C>"Quadro / Estudando"</C> quando houver nomes repetidos.</p>
                <details className="my-2"><summary className="cursor-pointer text-sm font-semibold">Catálogo completo de métodos ({CATALOGO.length})</summary>
                  <Tabela cab={['metodo', 'Nome', 'Parâmetros (chave: tipo, padrão)']} linhas={CATALOGO.map((c) => [c.id, `${c.icone} ${c.nome} — ${c.descricao}`, (c.params ?? []).map((p) => p.tipo === 'numero' ? `${p.chave}: número ${p.min}–${p.max} (padrão ${p.padrao})` : p.tipo === 'opcao' ? `${p.chave}: ${(p.opcoes ?? []).map((o) => o.valor).join(' | ')} (padrão ${p.padrao})` : `${p.chave}: texto${p.padrao !== '' ? ` (padrão "${String(p.padrao).slice(0, 40)}")` : ''}`).join(' · ') || '—'])} />
                </details>
                <Codigo codigo={exemploJSON('kanban')} titulo="Receita: Kanban com divisão automática" />
                <Codigo codigo={exemploJSON('regioes')} titulo="Receita: regiões aninhadas e camadas" />
              </Secao>

              <Secao id="conectores">
                <p>Conectores ligam dois itens pelos <b>ids</b>. A linha desvia de obstáculos e salta cruzamentos conforme a configuração.</p>
                <Tabela cab={['Campo', 'Valores', 'Padrão', 'Descrição']} linhas={[['de · para', 'id do item', '—', 'Origem e destino (obrigatórios). Conector para item inexistente ou de um item para ele mesmo é descartado.'], ['rotulo', 'texto (120)', '""', 'Texto sobre a linha (“exceção de”, “depende de”).'], ['estilo', 'reto | curvo | angulo', '"curvo"', 'Traçado.'], ['tracejado', 'true | false', 'false', 'Linha tracejada.'], ['setaInicio · setaFim', 'true | false', 'false · true', 'Setas nas pontas.'], ['cor', 'cor ou nome', '"#475569"', 'Cor da linha.'], ['espessura', 'número 1 a 12', '2', 'Espessura.'], ['camada', 'id ou nome', '"principal"', 'Camada do conector.'], ['id', 'id', 'gerado', 'Opcional.']]} />
                <p>✍️ Forma curta: <C>["origem", "destino", "rótulo opcional"]</C>.</p>
                <Codigo codigo={exemploJSON('mapa')} titulo="Receita: mapa mental" />
              </Secao>

              <Secao id="camadas">
                <p>Camadas agrupam itens para mostrar, esconder ou travar de uma vez. Toda lousa tem estas 5:</p>
                <Tabela cab={['id', 'Nome']} linhas={padrao.doc.camadas.map((c) => [c.id, c.nome])} />
                <p>Em <C>camadas</C> ✍️, um texto (<C>"Leis"</C>) cria uma camada com esse nome. Um objeto <C>{'{ "nome", "visivel", "travada", "opacidade" }'}</C> cria ou ajusta uma camada (se o id ou nome já existir, ela é ajustada). Itens citam a camada pelo id ou pelo nome. O id gerado vem do nome (ex.: “Jurisprudência” → <C>jurisprudencia</C>).</p>
              </Secao>

              <Secao id="config">
                <p>Tudo o que existe em Configurações. Valor fora da faixa é ajustado ao limite; valor inválido volta ao padrão, com aviso (e sugestão, se for erro de digitação).</p>
                <TabelaEsquema esquema={ESQUEMA_CONFIG} padrao={padrao.config} />
                <Codigo codigo={exemploJSON('aparencia')} titulo="Receita: aparência e comportamento" />
              </Secao>

              <Secao id="visualizacao">
                <TabelaEsquema esquema={ESQUEMA_VISUALIZACAO} padrao={padrao.visualizacao} />
                <h3>filtro (dentro de visualizacao)</h3>
                <TabelaEsquema esquema={ESQUEMA_FILTRO} padrao={padrao.visualizacao.filtro} />
                <p><C>visoesSalvas</C> é uma lista de <C>{'{ "nome", "visualizacao", "camera": { "x", "y", "zoom" } }'}</C>, os atalhos de visão do painel Camadas.</p>
              </Secao>

              <Secao id="estudo">
                <h3>estudo</h3>
                <TabelaEsquema esquema={ESQUEMA_ESTUDO} padrao={padrao.estudo} />
                <h3>edital</h3>
                <p>Três formas aceitas ✍️: objeto <C>{'{ "Disciplina": ["tópico", …] }'}</C>, lista de textos <C>"Disciplina: tópico"</C>, ou lista de objetos <C>{'{ "disciplina", "topico", "status", "dominio" (0–100) }'}</C>.</p>
                <h3>questoes</h3>
                <p>Lista de <C>{'{ "data", "disciplina", "assunto", "acertos", "total" }'}</C>. Acertos maiores que o total são limitados ao total.</p>
                <h3>legenda</h3>
                <p>Lista de <C>{'{ "cor", "significado" }'}</C> ou ✍️ objeto <C>{'{ "vermelho": "Exceção" }'}</C>. Aparece na lousa quando <C>visualizacao.legenda</C> é true.</p>
                <Codigo codigo={exemploJSON('estudo')} titulo="Receita: edital, questões e metas" />
              </Secao>

              <Secao id="imagens">
                <p>Imagens viajam dentro do JSON como <b>data URL base64</b>: <C>"data:image/png;base64,iVBORw0…"</C>. Formatos aceitos: PNG, JPEG, WebP e GIF. <b>SVG é recusado</b> (pode conter script).</p>
                <ul><li>✍️ <b>Direto no item:</b> <C>{'{ "tipo": "imagem", "imagem": "data:image/png;base64,…" }'}</C>, com o id gerado sozinho;</li><li><b>Por referência:</b> <C>{'"imagens": { "logo": "data:…" }'}</C> no topo e <C>{'"imagemId": "logo"'}</C> no item (forma usada nos backups).</li></ul>
                <p>Segurança e robustez: o base64 pode ter quebras de linha; o tipo real é conferido pelos <b>primeiros bytes</b> do arquivo (tipo declarado errado é corrigido; conteúdo que não é imagem é recusado); cada imagem tem no máximo {LIMITES.bytesImagem / 1048576} MB; imagens não usadas por nenhum item são ignoradas; se já existir neste navegador uma imagem <b>diferente</b> com o mesmo id, a importada recebe um id novo (nada é sobrescrito).</p>
                <Nota tipo="dica">Para obter o base64 de uma imagem, adicione-a a uma lousa e use <b>Exportar → JSON simplificado com imagens</b>.</Nota>
              </Secao>

              <Secao id="backup">
                <p><b>Exportar .json</b> gera o <b>envelope oficial v{VERSAO_ENVELOPE}</b>, que guarda a lousa completa (ou todas, no modo pacote), as imagens e um hash de integridade:</p>
                <Codigo acoes={false} codigo={j(ENVELOPE_DOC)} titulo="Estrutura do backup (resumida)" />
                <Tabela cab={['Campo', 'Descrição']} linhas={[['formato · versao', <>Identificação (<C>"{FORMATO_BACKUP}"</C>, versão {VERSAO_ENVELOPE}). Versão mais nova que a do programa é recusada com orientação.</>], ['tipo', '"lousa-estudos": mantém compatibilidade com versões antigas do programa.'], ['conteudo', '"lousa" (usa o campo lousa) ou "pacote" (usa a lista lousas).'], ['imagens', 'Todas as imagens usadas, em base64.'], ['resumo', 'Contagens, para conferência rápida.'], ['integridade', 'SHA-256 de JSON.stringify([lousa, lousas, imagens]).']]} />
                <h3>Integridade (SHA-256)</h3>
                <p>Ao importar, o hash é recalculado: <span className="chip ok">verificada</span> significa idêntico ao exportado; <span className="chip perigo">divergente</span>, que o conteúdo mudou (edição manual, arquivo truncado ou corrompido). A importação continua possível, mas o relatório avisa. Identar ou reformatar o arquivo <b>não</b> altera o hash, só mudanças de conteúdo.</p>
                <h3>Verificação de ida e volta</h3>
                <p>Antes de entregar o arquivo, a exportação o <b>lê de volta com o próprio importador</b> e confere formato, hash e contagens. Se algo não bater, você é avisado na hora, e não no dia em que precisar do backup.</p>
                <Nota>Backups antigos (<C>{'{ "tipo": "lousa-estudos", "versao": 1, "lousa": … }'}</C>) continuam sendo lidos normalmente.</Nota>
              </Secao>

              <Secao id="importar">
                <ol>
                  <li><b>Leitura segura:</b> remove BOM e bloqueia chaves perigosas (<C>__proto__</C>), aninhamento excessivo e arquivos acima de {LIMITES.bytesArquivo / 1048576} MB.</li>
                  <li><b>Detecção do formato</b> pelo conteúdo (não pela extensão).</li>
                  <li><b>Integridade:</b> confere o SHA-256, quando houver.</li>
                  <li><b>Validação completa:</b> tipos, faixas, valores aceitos, cores, URLs, HTML, referências entre itens, regiões e camadas, ciclos e duplicatas.</li>
                  <li><b>Imagens:</b> decodificadas e conferidas pela assinatura dos bytes.</li>
                  <li><b>Relatório:</b> você vê tudo antes de confirmar.</li>
                  <li><b>Você escolhe o modo.</b> Antes de substituir ou mesclar, um <b>backup interno automático</b> da lousa atual é criado.</li>
                </ol>
                <Tabela cab={['Modo', 'O que acontece']} linhas={[['Criar nova lousa', 'Padrão e mais seguro. Pacotes podem importar várias lousas de uma vez.'], ['Mesclar na atual', 'Copia itens, regiões e conectores com ids NOVOS, à direita do conteúdo existente. Camadas são casadas por id/nome; edital, questões e legenda são somados. Ctrl+Z desfaz.'], ['Substituir a atual', 'Troca o conteúdo, mantendo o id da lousa. Backup interno antes.']]} />
                <Tabela cab={['Mensagem', 'Significado']} linhas={[['⛔ Erro', 'Impede a importação (JSON inválido, versão mais nova, formato desconhecido).'], ['⚠️ Aviso', 'Algo foi descartado ou trocado pelo padrão (cor inválida, conector órfão…).'], ['🔧 Correção automática', 'Ajuste sem perda relevante (id gerado, número limitado à faixa).'], ['ℹ️ Informação', 'Observação (chave desconhecida ignorada, itens posicionados sozinhos).']]} />
              </Secao>

              <Secao id="receitas">
                <p>Todas as receitas abaixo fazem parte da suíte de testes: cada uma precisa importar <b>sem erros e sem avisos</b>.</p>
                {EXEMPLOS.map((e) => <div key={e.id} className="mt-4"><h3>{e.icone} {e.titulo}</h3><p className="text-sm opacity-80">{e.descricao}</p><Codigo codigo={exemploJSON(e.id)} titulo={`${e.id}.json`} arquivo={`exemplo-${e.id}.json`} /></div>)}
              </Secao>

              <Secao id="erros">
                <Tabela cab={['Mensagem / sintoma', 'Exemplo', 'Como resolver']} linhas={ERROS.map(([a, b, c]) => [a, <C key="e">{b}</C>, c])} />
                <Nota tipo="dica">Dica de ouro: escreva aos poucos e valide a cada bloco no <b>Validador ao vivo</b>. É bem mais fácil achar um erro em 10 linhas do que em 500.</Nota>
              </Secao>

              <Secao id="validador">
                <p>Cole ou edite um JSON e clique em <b>Validar</b>. A análise é a mesma da importação, mas nada é gravado.</p>
                <Validador texto={pg} setTexto={setPg} />
              </Secao>

              <Secao id="testes">
                <p>A camada de dados tem uma suíte de testes automatizados: integridade SHA-256 com vetores oficiais, leitura de JSON, validação, formato simplificado, envelope, imagens, exportações e mescla. É a mesma suíte que roda no desenvolvimento (<C>npx vitest run</C>), executada aqui no seu navegador.</p>
                <Testes />
              </Secao>

              <Secao id="referencia">
                <Tabela cab={['Quero…', 'Escreva']} linhas={[
                  ['um post-it', <C key="1">{'{ "texto": "..." }'}</C>], ['um post-it colorido com título', <C key="2">{'{ "titulo": "...", "texto": "...", "cor": "azul" }'}</C>], ['um flashcard com revisão', <C key="3">{'{ "frente": "...", "verso": "...", "revisao": true }'}</C>], ['uma lacuna', <C key="4">{'{ "tipo": "cloze", "texto": "... {{resposta}} ..." }'}</C>], ['uma checklist', <C key="5">{'{ "tipo": "tarefas", "tarefas": ["[ ] ..."] }'}</C>], ['uma tabela', <C key="6">{'{ "tipo": "tabela", "tabela": [["A","B"],["1","2"]] }'}</C>], ['um link', <C key="7">{'{ "tipo": "link", "url": "https://..." }'}</C>],
                  ['uma região dividida', <C key="8">{'{ "nome": "Quadro", "x": 0, "y": 0, "w": 1200, "h": 700, "divisao": "kanban" }'}</C>], ['item dentro de região', <C key="9">{'{ "texto": "...", "regiao": "Estudando" }'}</C>], ['ligar dois itens', <C key="10">{'["id1", "id2", "rótulo"]'}</C>], ['tema escuro', <C key="11">{'"config": { "tema": "escuro" }'}</C>], ['edital', <C key="12">{'"edital": { "Português": ["Crase"] }'}</C>],
                ]} />
                <Nota tipo="info">Campos desconhecidos são ignorados com aviso (e sugestão de grafia), então o arquivo nunca “quebra” a lousa. Exporte a qualquer momento em <b>Exportar → JSON simplificado</b> para ver como a sua lousa atual fica escrita neste formato.</Nota>
                <p className="mt-6 text-center text-xs opacity-60">Fim do guia · formato simplificado <C>{FORMATO_AUTORIA}</C> · backup <C>{FORMATO_BACKUP}</C> v{VERSAO_ENVELOPE}</p>
              </Secao>
            </div>
          </div>
        </div>
      </div>
    </CtxGuia.Provider>
  );
}
