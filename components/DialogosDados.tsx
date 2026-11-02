// ============================================================
// DIÁLOGOS DE DADOS: assistente de importação (analisar → revisar →
// escolher o modo → aplicar) e central de exportação.
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Dialogos';
import { getEstado, setUI, useLousa, useUI } from '../store';
import { analisarArquivo, analisarTexto, type AnaliseImportacao } from '../dados/importacao';
import { ICONE_SEVERIDADE, ROTULO_SEVERIDADE, type Relatorio, type Severidade } from '../dados/relatorio';
import type { ErroSintaxe } from '../dados/json';
import { EXEMPLOS, exemploJSON } from '../dados/exemplos';
import { baixarPNG, exportarAutoriaJSON, exportarCSVCartoes, exportarJSON, exportarTexto, importarAnalise, imprimirPDF, type ModoImportacao, type ResultadoExportacao, type ResultadoImportacao } from '../persistencia';
import { formatarBytes } from '../utils/db';

const abrirGuia = (secao?: string) => setUI({ dialogo: { tipo: 'guia-json', secao } });

// ---------- Peças compartilhadas (também usadas pelo guia) ----------
export function ErroSintaxeView({ erro }: { erro: ErroSintaxe }) {
  return (
    <div className="erro-sintaxe guia-nota perigo flex-col" role="alert">
      <div><b>JSON inválido — linha {erro.linha}, coluna {erro.coluna}</b></div>
      <div>{erro.mensagem}</div>
      <pre aria-label="Trecho com o erro">{`${String(erro.linha).padStart(4)} | ${erro.trecho}\n       ${erro.marcador}`}</pre>
    </div>
  );
}

export function RelatorioView({ rel }: { rel: Relatorio }) {
  const [filtro, setFiltro] = useState<Severidade | 'todas'>('todas');
  if (!rel.total) return <div className="guia-nota dica">✅ Nenhum problema encontrado: tudo foi lido exatamente como está no arquivo.</div>;
  const lista = rel.mensagens.filter((m) => filtro === 'todas' || m.sev === filtro);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Filtrar mensagens">
        {(['todas', 'erro', 'aviso', 'correcao', 'info'] as const).map((s) => {
          const n = s === 'todas' ? rel.total : rel.contagem[s]; if (s !== 'todas' && !n) return null;
          return <button key={s} type="button" className="chip" aria-pressed={filtro === s} onClick={() => setFiltro(s)}>{s === 'todas' ? 'Todas' : `${ICONE_SEVERIDADE[s]} ${ROTULO_SEVERIDADE[s]}`} · {n}</button>;
        })}
      </div>
      <ul className="relatorio-lista">{lista.map((m, i) => <li key={i}><span aria-hidden="true">{ICONE_SEVERIDADE[m.sev]}</span><span><code>{m.caminho || '(raiz do arquivo)'}</code><br />{m.texto}</span></li>)}</ul>
      {rel.omitidas > 0 && <p className="mt-1 text-xs opacity-70">+ {rel.omitidas} mensagem(ns) semelhantes não exibidas.</p>}
    </div>
  );
}

const dataValida = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toLocaleString('pt-BR') : null);
export function ResumoAnalise({ a }: { a: AnaliseImportacao }) {
  const t = a.resumos.reduce((s, r) => ({ itens: s.itens + r.itens, regioes: s.regioes + r.regioes, conectores: s.conectores + r.conectores, cartoes: s.cartoes + r.cartoes, edital: s.edital + r.edital, questoes: s.questoes + r.questoes }), { itens: 0, regioes: 0, conectores: 0, cartoes: 0, edital: 0, questoes: 0 });
  const integ = a.integridade === 'verificada' ? <span className="chip ok" title={a.hashArquivo}>🔐 Integridade verificada (SHA-256)</span> : a.integridade === 'divergente' ? <span className="chip perigo" title={a.hashArquivo}>⚠️ Conteúdo alterado desde a exportação</span> : <span className="chip">Sem hash de integridade</span>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="chip acento">{a.descricaoFormato}</span>{integ}
        {a.aplicativo && <span className="chip">{a.aplicativo}</span>}
        {dataValida(a.exportadoEm) && <span className="chip">exportado em {dataValida(a.exportadoEm)}</span>}
        <span className="chip">{formatarBytes(a.bytes)}</span><span className="chip">analisado em {a.duracaoMs} ms</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {([['Lousas', a.lousas.length], ['Itens', t.itens], ['Regiões', t.regioes], ['Conectores', t.conectores], ['Imagens', a.imagens.length], ['Cartões', t.cartoes]] as const).map(([r, v]) => <div key={r} className="estat"><b>{v}</b><span className="text-xs opacity-70">{r}</span></div>)}
      </div>
      {(t.edital > 0 || t.questoes > 0) && <p className="text-xs opacity-70">Também: {t.edital} tópico(s) de edital · {t.questoes} registro(s) de questões.</p>}
    </div>
  );
}

function OpcaoModo({ ativo, desabilitado, aoEscolher, titulo, children }: { ativo: boolean; desabilitado?: boolean; aoEscolher: () => void; titulo: string; children: ReactNode }) {
  return (
    <div role="radio" tabIndex={desabilitado ? -1 : 0} aria-checked={ativo} aria-disabled={desabilitado} className="opcao-modo" onClick={() => !desabilitado && aoEscolher()} onKeyDown={(e) => { if (!desabilitado && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); aoEscolher(); } }}>
      <span className="mt-0.5 text-lg" aria-hidden="true">{ativo ? '◉' : '○'}</span>
      <span><b className="text-sm">{titulo}</b><span className="block text-xs opacity-75">{children}</span></span>
    </div>
  );
}

// ---------- Assistente de importação ----------
type Fase = 'entrada' | 'analisando' | 'revisao' | 'aplicando' | 'feito';

export function DialogoImportar({ arquivo, texto }: { arquivo?: File; texto?: string }) {
  const [fase, setFase] = useState<Fase>(arquivo || texto ? 'analisando' : 'entrada');
  const [txt, setTxt] = useState(texto ?? ''); const [arrastando, setArrastando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseImportacao | null>(null);
  const [modo, setModo] = useState<ModoImportacao>('nova'); const [sel, setSel] = useState<number[]>([]);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null); const [erro, setErro] = useState('');
  const input = useRef<HTMLInputElement>(null); const nomeAtual = useLousa((l) => l.nome);
  const analisar = async (fonte: File | string) => {
    setFase('analisando'); setErro('');
    const a = typeof fonte === 'string' ? await analisarTexto(fonte, 'texto colado') : await analisarArquivo(fonte);
    setAnalise(a); setSel(a.lousas.map((_, i) => i)); setModo('nova'); setFase('revisao');
  };
  useEffect(() => { if (arquivo) analisar(arquivo); else if (texto) analisar(texto); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const aplicar = async () => {
    if (!analise) return; setFase('aplicando'); setErro('');
    try { setResultado(await importarAnalise(analise, modo, analise.lousas.length > 1 ? sel : undefined)); setFase('feito'); }
    catch (e) { setErro((e as Error).message); setFase('revisao'); }
  };
  const varias = (analise?.lousas.length ?? 0) > 1; const umaSelecionada = !varias || sel.length === 1;
  const rodape = fase === 'revisao' && analise?.ok ? <>
    <button type="button" className="btn contorno" onClick={() => { setAnalise(null); setFase('entrada'); }}>← Voltar</button>
    <button type="button" className="btn primario" disabled={varias && !sel.length} onClick={aplicar}>{modo === 'nova' ? `Importar ${varias ? `${sel.length} lousa(s)` : 'como nova lousa'}` : modo === 'substituir' ? 'Substituir a lousa atual' : 'Mesclar na lousa atual'}</button>
  </> : fase === 'feito' ? <button type="button" className="btn primario" onClick={() => setUI({ dialogo: null })}>Ver na lousa</button> : undefined;

  return (
    <Modal titulo="Importar JSON" largura={780} rodape={rodape}>
      {fase === 'entrada' && (
        <div className="flex flex-col gap-3">
          <div className={`zona-soltar ${arrastando ? 'ativa' : ''}`} onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) analisar(f); }}>
            <div className="text-3xl" aria-hidden="true">📥</div>
            <p className="mt-1 text-sm"><b>Arraste um arquivo .json para cá</b> ou</p>
            <button type="button" className="btn primario mt-2" onClick={() => input.current?.click()}>Escolher arquivo…</button>
            <input ref={input} type="file" accept="application/json,.json,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) analisar(f); e.target.value = ''; }} />
            <p className="mt-2 text-xs opacity-70">Backups exportados pela lousa (inclusive os antigos), pacotes com várias lousas, o formato simplificado e listas de textos.</p>
          </div>
          <label className="text-sm font-medium" htmlFor="json-colado">…ou cole o JSON aqui</label>
          <textarea id="json-colado" className="campo font-mono text-xs" rows={9} spellCheck={false} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'{\n  "nome": "Minha lousa",\n  "itens": [ { "texto": "Olá!" } ]\n}'} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn primario" disabled={!txt.trim()} onClick={() => analisar(txt)}>Analisar texto</button>
            <select className="campo !w-auto !py-1 text-sm" value="" aria-label="Carregar um exemplo" onChange={(e) => { if (e.target.value) setTxt(exemploJSON(e.target.value)); }}><option value="">Carregar um exemplo…</option>{EXEMPLOS.map((x) => <option key={x.id} value={x.id}>{x.icone} {x.titulo}</option>)}</select>
            <span className="flex-1" />
            <button type="button" className="btn contorno" onClick={() => abrirGuia('primeiro')}>📘 Como montar o JSON?</button>
          </div>
        </div>
      )}
      {(fase === 'analisando' || fase === 'aplicando') && <div className="flex items-center gap-3 py-10 text-sm" role="status"><span className="girando" aria-hidden="true" />{fase === 'analisando' ? 'Lendo, validando e conferindo a integridade…' : 'Gravando com segurança (backup automático antes de alterar a lousa atual)…'}</div>}
      {fase === 'revisao' && analise && (
        <div className="flex flex-col gap-3">
          {!analise.ok ? (
            <>
              {analise.erroSintaxe ? <ErroSintaxeView erro={analise.erroSintaxe} /> : <div className="guia-nota perigo" role="alert">⛔ {analise.erroFatal}</div>}
              {analise.relatorio.total > 0 && <RelatorioView rel={analise.relatorio} />}
              <div className="flex flex-wrap gap-2"><button type="button" className="btn primario" onClick={() => setFase('entrada')}>← Voltar e corrigir</button><button type="button" className="btn contorno" onClick={() => abrirGuia('erros')}>🩺 Ver erros comuns</button></div>
            </>
          ) : (
            <>
              <ResumoAnalise a={analise} />
              {varias && (
                <div className="rounded-xl border p-2" style={{ borderColor: 'var(--ui-borda)' }}>
                  <div className="mb-1 flex items-center gap-2 text-sm"><b className="flex-1">Lousas do pacote</b><button type="button" className="btn !min-h-7 text-xs" onClick={() => setSel(analise.lousas.map((_, i) => i))}>Todas</button><button type="button" className="btn !min-h-7 text-xs" onClick={() => setSel([])}>Nenhuma</button></div>
                  <ul className="max-h-40 overflow-y-auto text-sm">{analise.resumos.map((r, i) => <li key={i}><label className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={sel.includes(i)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i)))} /> <span className="flex-1 truncate">{r.nome}</span><span className="text-xs opacity-60">{r.itens} itens · {r.regioes} regiões</span></label></li>)}</ul>
                </div>
              )}
              <details open={analise.relatorio.contagem.aviso + analise.relatorio.contagem.erro > 0}><summary className="cursor-pointer text-sm font-semibold">Relatório de validação ({analise.relatorio.total})</summary><div className="mt-2"><RelatorioView rel={analise.relatorio} /></div></details>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Como importar">
                <OpcaoModo ativo={modo === 'nova'} aoEscolher={() => setModo('nova')} titulo="Criar nova lousa (recomendado)">A lousa atual não é alterada. Nomes repetidos ganham “(importada)”.</OpcaoModo>
                <OpcaoModo ativo={modo === 'mesclar'} desabilitado={!umaSelecionada} aoEscolher={() => setModo('mesclar')} titulo={`Mesclar em “${nomeAtual}”`}>Itens, regiões e conectores entram à direita do conteúdo atual, com ids novos (nada é sobrescrito). Ctrl+Z desfaz.</OpcaoModo>
                <OpcaoModo ativo={modo === 'substituir'} desabilitado={!umaSelecionada} aoEscolher={() => setModo('substituir')} titulo={`Substituir “${nomeAtual}”`}>O conteúdo atual é trocado pelo do arquivo. Um backup interno é criado antes (Dados → Restaurar backup).</OpcaoModo>
              </div>
              {erro && <div className="guia-nota perigo" role="alert">⛔ {erro}</div>}
            </>
          )}
        </div>
      )}
      {fase === 'feito' && resultado && (
        <div className="flex flex-col gap-2 text-sm" role="status">
          <div className="guia-nota dica">✅ <span>Importação concluída: <b>{resultado.itens}</b> item(ns) em <b>{resultado.lousas}</b> lousa(s){resultado.modo === 'mesclar' ? ' mesclados na lousa atual' : ''}.</span></div>
          <ul className="list-disc pl-5">
            <li>Lousa(s): {resultado.nomes.join(', ')}</li>
            <li>{resultado.imagens} imagem(ns) disponível(is){resultado.imagensRemapeadas ? ` · ${resultado.imagensRemapeadas} renomeada(s) para não sobrescrever imagens de outras lousas` : ''}</li>
            {resultado.backupCriado && <li>Backup interno da versão anterior criado (Dados → Restaurar backup…)</li>}
            {resultado.modo === 'mesclar' && <li>Mudou de ideia? <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz a mesclagem.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// ---------- Central de exportação ----------
export function DialogoExportar({ mundoRef }: { mundoRef: React.RefObject<HTMLDivElement | null> }) {
  const regioes = useLousa((l) => l.doc.regioes); const qtdLousas = useUI((u) => u.lousas.length); const qtdImagens = useLousa((l) => Object.values(l.doc.itens).filter((i) => i.imagemId).length);
  const [escopo, setEscopo] = useState<'atual' | 'todas'>('atual'); const [imagens, setImagens] = useState(true); const [lixeira, setLixeira] = useState(true); const [legivel, setLegivel] = useState(false);
  const [res, setRes] = useState<ResultadoExportacao | null>(null); const [ocupado, setOcupado] = useState(''); const [reg, setReg] = useState('');
  const run = async (rotulo: string, fn: () => Promise<unknown>) => { setOcupado(rotulo); try { await fn(); } finally { setOcupado(''); } };
  return (
    <Modal titulo="Exportar" largura={720}>
      <div className="flex flex-col gap-4">
        <section className="cartao-config"><header><span className="icone" style={{ background: '#4f46e51f', color: '#4f46e5' }}>💾</span><div><h3>Backup completo (.json)</h3><p>Tudo: itens, regiões, conectores, estudo, configurações e imagens. Com hash SHA-256 e verificação automática.</p></div></header>
          <div className="corpo flex flex-col gap-2 py-3">
            <div className="segmentado" role="radiogroup" aria-label="O que exportar"><button type="button" role="radio" aria-checked={escopo === 'atual'} onClick={() => setEscopo('atual')}>Esta lousa</button><button type="button" role="radio" aria-checked={escopo === 'todas'} onClick={() => setEscopo('todas')}>Todas as lousas ({Math.max(1, qtdLousas)})</button></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={imagens} onChange={(e) => setImagens(e.target.checked)} /> Incluir imagens {qtdImagens ? `(${qtdImagens} nesta lousa)` : ''}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lixeira} onChange={(e) => setLixeira(e.target.checked)} /> Incluir a lixeira</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={legivel} onChange={(e) => setLegivel(e.target.checked)} /> JSON identado (legível, arquivo maior)</label>
            <div><button type="button" className="btn primario" disabled={!!ocupado} onClick={() => run('json', async () => setRes(await exportarJSON({ escopo, incluirImagens: imagens, incluirLixeira: lixeira, legivel })))}>{ocupado === 'json' ? 'Gerando e verificando…' : '⬇ Exportar .json'}</button></div>
            {res && (
              <div className={`guia-nota ${res.verificado ? 'dica' : 'perigo'} flex-col text-xs`} role="status">
                <b className="text-sm">{res.verificado ? '✅ Arquivo gerado e verificado' : '⚠️ Arquivo gerado, mas a verificação falhou'}</b>
                <span><code>{res.nomeArquivo}</code> · {formatarBytes(res.bytes)} · {res.lousas} lousa(s) · {res.itens} itens · {res.imagens} imagem(ns)</span>
                <span>SHA-256: <code title={res.hash}>{res.hash.slice(0, 24)}…</code></span>
                {res.verificado ? <span>O arquivo foi lido de volta pelo importador: formato, contagens e hash conferem.</span> : <span>Problemas: {res.problemas.join('; ')}</span>}
                {res.faltando.length > 0 && <span>⚠️ {res.faltando.length} imagem(ns) não foram encontradas neste navegador e ficaram de fora.</span>}
              </div>
            )}
          </div>
        </section>
        <section className="cartao-config"><header><span className="icone" style={{ background: '#10b9811f', color: '#10b981' }}>✍️</span><div><h3>JSON simplificado (para editar à mão)</h3><p>Só o que difere do padrão, no mesmo formato do guia. Edite e importe de volta.</p></div></header>
          <div className="corpo flex flex-wrap items-center gap-2 py-3"><button type="button" className="btn contorno" onClick={() => exportarAutoriaJSON(false)}>⬇ Exportar simplificado</button><button type="button" className="btn contorno" onClick={() => exportarAutoriaJSON(true)}>⬇ Simplificado com imagens</button><button type="button" className="btn" onClick={() => abrirGuia('estrutura')}>📘 Entender o formato</button></div>
        </section>
        <section className="cartao-config"><header><span className="icone" style={{ background: '#f59e0b1f', color: '#f59e0b' }}>🖼️</span><div><h3>Imagem e PDF</h3><p>Inclui itens girados e as divisões.</p></div></header>
          <div className="corpo flex flex-col gap-2 py-3">
            <label className="text-sm">Área <select className="campo mt-1" value={reg} onChange={(e) => setReg(e.target.value)}><option value="">Lousa inteira</option>{Object.values(regioes).map((r) => <option key={r.id} value={r.id}>Região: {r.nome}</option>)}</select></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn contorno" disabled={!!ocupado} onClick={() => run('png', () => baixarPNG(mundoRef.current!, 1, reg || null))}>🖼️ PNG 1×</button>
              <button type="button" className="btn contorno" disabled={!!ocupado} onClick={() => run('png', () => baixarPNG(mundoRef.current!, 2, reg || null))}>🖼️ PNG 2× (nítido)</button>
              <button type="button" className="btn contorno" disabled={!!ocupado} onClick={() => run('pdf', () => imprimirPDF(mundoRef.current!, reg || null))}>📄 PDF (imprimir)</button>
            </div>
            {(ocupado === 'png' || ocupado === 'pdf') && <p className="text-xs">Gerando imagem… com muitos itens pode levar alguns segundos.</p>}
          </div>
        </section>
        <section className="cartao-config"><header><span className="icone" style={{ background: '#64748b1f', color: '#64748b' }}>📝</span><div><h3>Texto e planilha</h3><p>Markdown e texto agrupados por região; CSV dos cartões (seguro contra injeção de fórmulas).</p></div></header>
          <div className="corpo flex flex-wrap gap-2 py-3"><button type="button" className="btn contorno" onClick={() => exportarTexto('md')}>📝 Markdown</button><button type="button" className="btn contorno" onClick={() => exportarTexto('txt')}>📄 Texto simples</button><button type="button" className="btn contorno" onClick={exportarCSVCartoes}>🗃️ CSV dos cartões</button></div>
        </section>
        <p className="text-xs opacity-70">Lousa atual: <b>{getEstado().lousa.nome}</b>. Backups internos automáticos continuam sendo feitos a cada 10 minutos, mas só o arquivo .json protege contra limpeza do navegador.</p>
      </div>
    </Modal>
  );
}
