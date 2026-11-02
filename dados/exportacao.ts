// ============================================================
// DADOS · EXPORTAÇÃO
// - Envelope v2: identificação do formato, versão do app, resumo,
//   imagens e hash SHA-256 do conteúdo (integridade).
// - Verificação de ida e volta: o arquivo gerado é lido de novo pelo
//   MESMO importador antes de ser entregue (backup que não volta não
//   é backup).
// - JSON simplificado (para editar à mão), CSV seguro e Markdown.
// ============================================================
import { ROTULOS_STATUS, type Item, type Lousa } from '../types';
import { criarLousaVazia, caminhoRegiao } from '../store';
import { blobParaBase64, htmlParaTexto } from '../utils/seguranca';
import { sha256Hex } from './hash';
import { PADROES_TIPO } from './autoria';
import { analisarTexto } from './importacao';
import { conteudoCanonico, FORMATO_AUTORIA, FORMATO_BACKUP, imagensDaLousa, NOME_APP, TIPO_LEGADO, VERSAO_APP, VERSAO_ENVELOPE, type EnvelopeBackup } from './tipos';

export interface OpcoesExportacao { incluirImagens: boolean; incluirLixeira: boolean; legivel: boolean; pacote: boolean }
export const OPCOES_PADRAO: OpcoesExportacao = { incluirImagens: true, incluirLixeira: true, legivel: false, pacote: false };

export async function montarEnvelope(lousas: Lousa[], op: OpcoesExportacao, carregarImagem: (id: string) => Promise<Blob | undefined | null>): Promise<{ envelope: EnvelopeBackup; faltando: string[] }> {
  if (!lousas.length) throw new Error('Não há lousas para exportar.');
  const ls = op.incluirLixeira ? lousas : lousas.map((l) => ({ ...l, lixeira: [] }));
  const imagens: Record<string, string> = {}; const faltando: string[] = []; let bytesImagens = 0;
  if (op.incluirImagens) {
    const ids = new Set<string>(); for (const l of ls) for (const id of imagensDaLousa(l)) ids.add(id);
    for (const id of ids) {
      try { const b = await carregarImagem(id); if (b) { imagens[id] = await blobParaBase64(b); bytesImagens += b.size; } else faltando.push(id); }
      catch { faltando.push(id); }
    }
  }
  const pacote = op.pacote || ls.length > 1;
  const envelope: EnvelopeBackup = {
    formato: FORMATO_BACKUP, versao: VERSAO_ENVELOPE, tipo: TIPO_LEGADO,
    aplicativo: { nome: NOME_APP, versao: VERSAO_APP }, exportadoEm: new Date().toISOString(),
    conteudo: pacote ? 'pacote' : 'lousa', ...(pacote ? { lousas: ls } : { lousa: ls[0] }), imagens,
    resumo: { lousas: ls.length, itens: ls.reduce((s, l) => s + Object.keys(l.doc.itens).length, 0), regioes: ls.reduce((s, l) => s + Object.keys(l.doc.regioes).length, 0), conectores: ls.reduce((s, l) => s + Object.keys(l.doc.conectores).length, 0), imagens: Object.keys(imagens).length, bytesImagens },
  };
  envelope.integridade = { algoritmo: 'SHA-256', escopo: 'conteudo', hash: await sha256Hex(conteudoCanonico(envelope)) };
  return { envelope, faltando };
}

export const serializar = (valor: unknown, legivel: boolean) => JSON.stringify(valor, null, legivel ? 2 : undefined);

/** Lê o texto gerado com o importador real e confere hash e contagens. */
export async function verificarIdaEVolta(texto: string, envelope: EnvelopeBackup): Promise<{ ok: boolean; problemas: string[] }> {
  const a = await analisarTexto(texto, 'verificacao.json');
  const problemas: string[] = [];
  if (!a.ok) problemas.push(a.erroFatal ?? 'o arquivo gerado não pôde ser lido');
  if (a.integridade !== 'verificada') problemas.push('o hash de integridade não confere');
  if (a.ok && a.resumos.reduce((s, r) => s + r.itens, 0) !== envelope.resumo.itens) problemas.push('a quantidade de itens lida não confere');
  if (a.ok && a.resumos.reduce((s, r) => s + r.conectores, 0) !== envelope.resumo.conectores) problemas.push('a quantidade de conectores lida não confere');
  return { ok: problemas.length === 0, problemas };
}

// ---------- JSON simplificado (para editar à mão) ----------
const arred = (n: number) => Math.round(n * 100) / 100;
function itemParaAutoria(it: Item): Record<string, unknown> {
  const pd = PADROES_TIPO[it.tipo]; const o: Record<string, unknown> = { id: it.id };
  if (it.tipo !== 'postit') o.tipo = it.tipo;
  Object.assign(o, { x: arred(it.x), y: arred(it.y), w: arred(it.w), h: arred(it.h) });
  if (it.angulo) o.angulo = arred(it.angulo);
  if (it.titulo) o.titulo = it.titulo;
  if (it.html) o.html = it.html;
  if (it.verso !== undefined) o.verso = it.verso;
  if (it.cor !== (pd.cor ?? '#fff176')) o.cor = it.cor;
  if (it.corTexto) o.corTexto = it.corTexto;
  if (it.fonte !== 'Padrão') o.fonte = it.fonte;
  if (it.tamanhoFonte !== (it.tipo === 'titulo' ? 32 : 15)) o.tamanhoFonte = it.tamanhoFonte;
  if (it.autoAjuste) o.autoAjuste = true;
  if (it.etiquetas.length) o.etiquetas = it.etiquetas;
  if (it.status !== 'nao-visto') o.status = it.status;
  if (it.revisao.ativa || it.revisao.historico.length) o.revisao = it.revisao;
  if (it.regiao) o.regiao = it.regiao;
  if (it.camada !== (it.tipo === 'desenho' ? 'anotacoes' : 'principal')) o.camada = it.camada;
  if (it.grupo) o.grupo = it.grupo;
  for (const k of ['travado', 'oculto', 'fixado', 'virado'] as const) if (it[k]) o[k] = true;
  for (const k of ['tarefas', 'tabela', 'url', 'imagemId', 'tracos', 'recorte', 'erro', 'modelo'] as const) if (it[k] !== undefined) o[k] = it[k];
  if (it.opacidade !== undefined && it.opacidade !== 1) o.opacidade = it.opacidade;
  if (it.forma !== undefined && it.forma !== 'retangulo') o.forma = it.forma;
  if (it.valor !== undefined && it.valor !== 0) o.valor = it.valor;
  if (it.carimbo !== undefined && it.carimbo !== 'importante') o.carimbo = it.carimbo;
  return o;
}
export function lousaParaAutoria(l: Lousa, imagens: Record<string, string> = {}): Record<string, unknown> {
  const base = criarLousaVazia();
  const difere = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.fromEntries(Object.entries(a).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(b[k])));
  const prof = (id: string) => { let d = 0; let r = l.doc.regioes[id]; while (r?.pai && d < 100) { d++; r = l.doc.regioes[r.pai]; } return d; };
  const estiloPadrao = { opacidade: 0.16, corBorda: '#64748b', espessuraBorda: 1.5, estiloBorda: 'solida', raio: 10, icone: '', padrao: 'nenhum', rotuloAngulo: 0, numerar: false, mostrarTitulo: true };
  const out: Record<string, unknown> = { formato: FORMATO_AUTORIA, versao: 1, nome: l.nome };
  const cfg = difere(l.config as unknown as Record<string, unknown>, base.config as unknown as Record<string, unknown>); if (Object.keys(cfg).length) out.config = cfg;
  const camadasExtras = l.doc.camadas.filter((c) => { const p = base.doc.camadas.find((x) => x.id === c.id); return !p || JSON.stringify(p) !== JSON.stringify(c); }); if (camadasExtras.length) out.camadas = camadasExtras;
  const regs = Object.values(l.doc.regioes).sort((a, b) => prof(a.id) - prof(b.id) || (a.ordem ?? 0) - (b.ordem ?? 0));
  if (regs.length) out.regioes = regs.map((r) => { const est = difere({ ...r.estilo } as Record<string, unknown>, estiloPadrao); delete est.cor; return { id: r.id, nome: r.nome, ...(r.pai ? { pai: r.pai } : {}), x: arred(r.bbox.x), y: arred(r.bbox.y), w: arred(r.bbox.w), h: arred(r.bbox.h), cor: r.estilo.cor, ...(Object.keys(est).length ? { estilo: est } : {}), ...(r.pontos ? { pontos: r.pontos.map((p) => ({ x: arred(p.x), y: arred(p.y) })) } : {}), ...(r.layout ? { layout: r.layout } : {}), ...(r.metodo !== 'manual' ? { metodo: r.metodo } : {}), ...(r.recolhida ? { recolhida: true } : {}), ...(r.oculta ? { oculta: true } : {}), ...(r.travada ? { travada: true } : {}), ...(r.ima ? { ima: true } : {}), ...(!r.itensAcompanham ? { itensAcompanham: false } : {}) }; });
  const its = Object.values(l.doc.itens).sort((a, b) => a.z - b.z); if (its.length) out.itens = its.map(itemParaAutoria);
  const cons = Object.values(l.doc.conectores); if (cons.length) out.conectores = cons.map((c) => ({ id: c.id, de: c.de, para: c.para, ...(c.rotulo ? { rotulo: c.rotulo } : {}), ...(c.estilo !== 'curvo' ? { estilo: c.estilo } : {}), ...(c.tracejado ? { tracejado: true } : {}), ...(c.setaInicio ? { setaInicio: true } : {}), ...(!c.setaFim ? { setaFim: false } : {}), ...(c.cor !== '#475569' ? { cor: c.cor } : {}), ...(c.espessura !== 2 ? { espessura: c.espessura } : {}), ...(c.camada !== 'principal' ? { camada: c.camada } : {}) }));
  const est = difere(l.estudo as unknown as Record<string, unknown>, base.estudo as unknown as Record<string, unknown>); if (Object.keys(est).length) out.estudo = est;
  if (l.edital.length) out.edital = l.edital; if (l.questoes.length) out.questoes = l.questoes;
  if (JSON.stringify(l.legenda) !== JSON.stringify(base.legenda)) out.legenda = l.legenda;
  if (l.modelosDivisao.length) out.modelosDivisao = l.modelosDivisao;
  if (Object.keys(imagens).length) out.imagens = imagens;
  return out;
}

// ---------- CSV e texto ----------
/** Neutraliza injeção de fórmulas (OWASP): células que começam com = + - @ TAB CR viram texto no Excel/Sheets. */
export const neutralizarFormula = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const celula = (s: string) => `"${neutralizarFormula(s).replace(/"/g, '""')}"`;

export function gerarCSVCartoes(l: Lousa): string {
  const linhas = ['frente;verso;titulo;etiquetas;status;proxima_revisao;regiao'];
  for (const it of Object.values(l.doc.itens)) {
    if (it.verso === undefined && !it.revisao.ativa && it.tipo !== 'cloze') continue;
    linhas.push([htmlParaTexto(it.html), htmlParaTexto(it.verso ?? ''), it.titulo, it.etiquetas.join(', '), ROTULOS_STATUS[it.status], it.revisao.proxima ? new Date(it.revisao.proxima).toLocaleDateString('pt-BR') : '', caminhoRegiao(it.regiao, l.doc.regioes).join(' › ')].map(celula).join(';'));
  }
  return '\ufeff' + linhas.join('\r\n') + '\r\n';
}

const escMd = (s: string) => s.replace(/([\\`*_[\]#|])/g, '\\$1');
export function gerarTexto(l: Lousa, formato: 'md' | 'txt'): string {
  const porRegiao = new Map<string, Item[]>();
  for (const it of Object.values(l.doc.itens)) { const k = caminhoRegiao(it.regiao, l.doc.regioes).join(' › '); porRegiao.set(k, [...(porRegiao.get(k) ?? []), it]); }
  const linhas: string[] = [formato === 'md' ? `# ${escMd(l.nome)}` : l.nome.toUpperCase(), ''];
  for (const [reg, itens] of [...porRegiao.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
    linhas.push(formato === 'md' ? `## ${escMd(reg)}` : `=== ${reg} ===`, '');
    for (const it of itens.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const corpo = htmlParaTexto(it.html); const meta = [it.etiquetas.length ? `#${it.etiquetas.join(' #')}` : '', ROTULOS_STATUS[it.status]].filter(Boolean).join(' · ');
      if (formato === 'md') {
        const titulo = it.titulo ? `**${escMd(it.titulo)}:** ` : '';
        const tarefas = it.tarefas?.length ? '\n' + it.tarefas.map((t) => `  - [${t.feito ? 'x' : ' '}] ${escMd(t.texto)}`).join('\n') : '';
        const tabela = it.tabela?.length ? '\n\n' + it.tabela.map((r, i) => `  | ${r.map((c) => escMd(c)).join(' | ')} |${i === 0 ? `\n  |${r.map(() => ' --- |').join('')}` : ''}`).join('\n') : '';
        linhas.push(`- ${titulo}${escMd(corpo).replace(/\n/g, '\n  ')}${it.verso ? `\n  - Verso: ${escMd(htmlParaTexto(it.verso))}` : ''}${it.url ? `\n  - <${it.url}>` : ''}${tarefas}${tabela}${meta ? `\n  _${escMd(meta)}_` : ''}`);
      } else linhas.push(`• ${it.titulo ? `${it.titulo}: ` : ''}${corpo}${it.verso ? `\n  Verso: ${htmlParaTexto(it.verso)}` : ''}${it.url ? `\n  ${it.url}` : ''}${it.tarefas?.length ? '\n' + it.tarefas.map((t) => `  [${t.feito ? 'x' : ' '}] ${t.texto}`).join('\n') : ''}${meta ? `\n  (${meta})` : ''}`);
    }
    linhas.push('');
  }
  return linhas.join('\n');
}
