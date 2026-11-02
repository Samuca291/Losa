// ============================================================
// DADOS · IMPORTAÇÃO EM DUAS FASES
//  1) analisar (dry-run): lê, detecta o formato, confere integridade,
//     valida TUDO e decodifica imagens — sem tocar no estado.
//  2) aplicar (em persistencia.ts): só depois que a pessoa revisou o
//     relatório e escolheu o modo (nova / substituir / mesclar).
// ============================================================
import type { Camada, Conector, Doc, Item, Lousa, Regiao, Retangulo } from '../types';
import { criarLousaVazia } from '../store';
import { carregarImagemDB } from '../utils/db';
import { uniaoRetangulos, bboxItemGirado } from '../utils/geometria';
import { lerJSON, type ErroSintaxe } from './json';
import { Relatorio } from './relatorio';
import { bytesDoBlob, sha256Hex } from './hash';
import { decodificarImagem, type MimeImagem } from './imagens';
import { normalizarAutoria } from './autoria';
import { ehObj, geradorIds, idSeguro, validarLousa } from './validacao';
import {
  conteudoCanonico, DESCRICAO_FORMATO, FORMATO_AUTORIA, FORMATO_BACKUP, imagensDaLousa, LIMITES, resumirLousa, TIPO_LEGADO, VERSAO_ENVELOPE,
  type EstadoIntegridade, type ResumoLousa, type TipoFormato,
} from './tipos';

export interface ImagemPreparada { id: string; blob: Blob; mime: MimeImagem; bytes: number }
export interface AnaliseImportacao {
  ok: boolean;
  erroFatal?: string;
  erroSintaxe?: ErroSintaxe;
  formato?: TipoFormato;
  descricaoFormato?: string;
  versaoArquivo: number | null;
  exportadoEm: string | null;
  aplicativo: string | null;
  lousas: Lousa[];
  resumos: ResumoLousa[];
  imagens: ImagemPreparada[];
  imagensFaltando: string[];
  imagensNaoUsadas: number;
  integridade: EstadoIntegridade;
  hashArquivo?: string;
  relatorio: Relatorio;
  bytes: number;
  nomeArquivo?: string;
  duracaoMs: number;
  /** O arquivo não definiu câmera: depois de aplicar, enquadrar o conteúdo. */
  enquadrar: boolean;
}

const vazio = (rel: Relatorio, bytes: number, nomeArquivo?: string): AnaliseImportacao => ({ ok: false, versaoArquivo: null, exportadoEm: null, aplicativo: null, lousas: [], resumos: [], imagens: [], imagensFaltando: [], imagensNaoUsadas: 0, integridade: 'ausente', relatorio: rel, bytes, nomeArquivo, duracaoMs: 0, enquadrar: false });
const agoraMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Reconhece o formato pelo conteúdo (não pela extensão). */
export function detectarFormato(v: unknown): { formato: TipoFormato } | { erro: string } {
  if (Array.isArray(v)) return v.length ? { formato: 'lista-itens' } : { erro: 'A lista está vazia: não há itens para importar.' };
  if (!ehObj(v)) return { erro: 'O JSON precisa ser um objeto { ... } ou uma lista [ ... ]. Veja o guia em Configurações → Dados em JSON.' };
  if (v.formato === FORMATO_BACKUP || v.tipo === TIPO_LEGADO) {
    if (Array.isArray(v.lousas)) return { formato: 'pacote' };
    if (ehObj(v.lousa)) return { formato: v.formato === FORMATO_BACKUP ? 'backup' : 'legado' };
    return { erro: 'O arquivo tem o cabeçalho de backup, mas não contém "lousa" nem "lousas".' };
  }
  if (Array.isArray(v.lousas)) return { formato: 'pacote' };
  if (ehObj(v.lousa)) return { formato: 'legado' };
  if (ehObj(v.doc)) return { formato: 'lousa-interna' };
  if (v.formato === FORMATO_AUTORIA || ['itens', 'regioes', 'conectores', 'edital', 'questoes'].some((k) => v[k] !== undefined)) return { formato: 'autoria' };
  return { erro: 'Formato não reconhecido: esperava "itens", "regioes", "doc" ou um backup exportado pela lousa. Abra o guia do JSON para ver exemplos.' };
}

export async function analisarArquivo(arquivo: File): Promise<AnaliseImportacao> {
  const rel = new Relatorio();
  if (arquivo.size > LIMITES.bytesArquivo) { const a = vazio(rel, arquivo.size, arquivo.name); a.erroFatal = `Arquivo grande demais (${(arquivo.size / 1048576).toFixed(0)} MB). O máximo é ${LIMITES.bytesArquivo / 1048576} MB.`; return a; }
  if (arquivo.size === 0) { const a = vazio(rel, 0, arquivo.name); a.erroFatal = 'O arquivo está vazio.'; return a; }
  let texto: string;
  try { texto = await arquivo.text(); } catch { const a = vazio(rel, arquivo.size, arquivo.name); a.erroFatal = 'Não foi possível ler o arquivo.'; return a; }
  if (!/\.json$/i.test(arquivo.name)) rel.info('arquivo', `"${arquivo.name}" não termina em .json; o conteúdo foi lido mesmo assim.`);
  return analisarTexto(texto, arquivo.name, arquivo.size, rel);
}

export async function analisarTexto(texto: string, nomeArquivo?: string, bytes = new Blob([texto]).size, relInicial?: Relatorio): Promise<AnaliseImportacao> {
  const t0 = agoraMs(); const rel = relInicial ?? new Relatorio(); const a = vazio(rel, bytes, nomeArquivo);
  const fim = () => { a.duracaoMs = Math.round(agoraMs() - t0); return a; };
  if (bytes > LIMITES.bytesArquivo) { a.erroFatal = `Conteúdo grande demais (máximo ${LIMITES.bytesArquivo / 1048576} MB).`; return fim(); }
  const lido = lerJSON(texto);
  if (!lido.ok) { a.erroSintaxe = lido.erro; a.erroFatal = `JSON inválido na linha ${lido.erro.linha}, coluna ${lido.erro.coluna}: ${lido.erro.mensagem}`; return fim(); }
  const valor = lido.valor; const det = detectarFormato(valor);
  if ('erro' in det) { a.erroFatal = det.erro; return fim(); }
  a.formato = det.formato; a.descricaoFormato = DESCRICAO_FORMATO[det.formato];
  const env = (ehObj(valor) ? valor : {}) as Record<string, unknown>;
  let lousasBrutas: unknown[] = []; let imagensBrutas: Record<string, unknown> = {};

  if (det.formato === 'backup' || det.formato === 'pacote' || det.formato === 'legado') {
    a.versaoArquivo = typeof env.versao === 'number' ? env.versao : null;
    a.exportadoEm = typeof env.exportadoEm === 'string' ? env.exportadoEm.slice(0, 40) : null;
    a.aplicativo = ehObj(env.aplicativo) ? `${String(env.aplicativo.nome ?? '').slice(0, 60)} ${String(env.aplicativo.versao ?? '').slice(0, 20)}`.trim() : null;
    if (env.formato === FORMATO_BACKUP && typeof env.versao === 'number' && env.versao > VERSAO_ENVELOPE) { a.erroFatal = `Este backup foi criado por uma versão mais nova do programa (envelope ${env.versao}; este lê até o ${VERSAO_ENVELOPE}). Atualize antes de importar.`; return fim(); }
    if (ehObj(env.imagens)) imagensBrutas = env.imagens; else if (env.imagens !== undefined) rel.aviso('imagens', '"imagens" deveria ser um objeto { id: "data:image/..." }; ignorado.');
    if (det.formato === 'pacote') {
      const ls = env.lousas as unknown[];
      if (ls.length > LIMITES.lousasPorPacote) rel.aviso('lousas', `O pacote tem ${ls.length} lousas; só as ${LIMITES.lousasPorPacote} primeiras serão lidas.`);
      lousasBrutas = ls.slice(0, LIMITES.lousasPorPacote);
    } else lousasBrutas = [env.lousa];
    // Integridade (SHA-256 do conteúdo canônico)
    const integ = env.integridade;
    if (ehObj(integ) && typeof integ.hash === 'string') {
      a.hashArquivo = integ.hash.slice(0, 64);
      const calculado = await sha256Hex(conteudoCanonico(env));
      a.integridade = calculado === integ.hash ? 'verificada' : 'divergente';
      if (a.integridade === 'divergente') rel.aviso('integridade', 'O conteúdo NÃO confere com o hash SHA-256 gravado na exportação: o arquivo foi editado à mão, truncado ou corrompido. Revise o relatório antes de importar.');
    } else if (det.formato !== 'legado') rel.info('integridade', 'O arquivo não traz hash de integridade (normal em arquivos editados à mão).');
  } else if (det.formato === 'lousa-interna') {
    lousasBrutas = [valor];
  } else {
    const { bruto, imagens } = normalizarAutoria(valor, rel);
    lousasBrutas = [bruto]; imagensBrutas = imagens as Record<string, unknown>;
    a.enquadrar = !(ehObj(valor) && valor.camera !== undefined);
  }

  // Validação de cada lousa
  lousasBrutas.forEach((raw, i) => {
    const caminho = lousasBrutas.length > 1 ? `lousas[${i}]` : 'lousa';
    try { const l = validarLousa(raw, criarLousaVazia(), { rel, caminho }); a.lousas.push(l); }
    catch (e) { if (lousasBrutas.length === 1) a.erroFatal = (e as Error).message; else rel.erro(caminho, `Lousa não importável: ${(e as Error).message}`); }
  });
  if (a.erroFatal) return fim();
  if (!a.lousas.length) { a.erroFatal = 'Nenhuma lousa válida foi encontrada no arquivo.'; return fim(); }
  if (a.formato === 'pacote') { const ids = new Set<string>(); for (const l of a.lousas) { if (ids.has(l.id)) { const novo = geradorIds(ids)(); rel.correcao(`lousas`, `Duas lousas com o mesmo id "${l.id}": "${l.nome}" recebeu um id novo.`); l.id = novo; } ids.add(l.id); } }

  // Imagens: só as referenciadas; assinatura real dos bytes conferida
  const refs = new Set<string>(); for (const l of a.lousas) for (const id of imagensDaLousa(l)) refs.add(id);
  const entradasImg = Object.entries(imagensBrutas);
  if (entradasImg.length > LIMITES.imagens) rel.aviso('imagens', `Mais de ${LIMITES.imagens} imagens: as excedentes foram ignoradas.`);
  for (const [id, dado] of entradasImg.slice(0, LIMITES.imagens)) {
    if (!idSeguro(id)) { rel.aviso(`imagens.${id.slice(0, 40)}`, 'Id de imagem inválido; imagem ignorada.'); continue; }
    if (!refs.has(id)) { a.imagensNaoUsadas++; continue; }
    const d = decodificarImagem(dado);
    if (!d.ok) { rel.aviso(`imagens.${id}`, `Imagem descartada: ${d.erro}.`); continue; }
    if (d.corrigido) rel.correcao(`imagens.${id}`, d.corrigido);
    a.imagens.push({ id, blob: d.blob, mime: d.mime, bytes: d.bytes });
  }
  if (a.imagensNaoUsadas) rel.info('imagens', `${a.imagensNaoUsadas} imagem(ns) do arquivo não são usadas por nenhum item e foram ignoradas.`);
  const presentes = new Set(a.imagens.map((x) => x.id));
  for (const id of refs) {
    if (presentes.has(id)) continue;
    let local = false; try { local = !!(await carregarImagemDB(id)); } catch { local = false; }
    if (!local) a.imagensFaltando.push(id);
  }
  if (a.imagensFaltando.length) rel.aviso('imagens', `${a.imagensFaltando.length} imagem(ns) usada(s) por itens não estão no arquivo nem neste navegador: esses itens aparecerão vazios.`);
  a.resumos = a.lousas.map(resumirLousa);
  a.ok = true;
  return fim();
}

// ---------- Imagens: colisão de ids entre lousas ----------
/** Ids de imagem são globais no navegador. Se já existir uma imagem DIFERENTE com o mesmo id, a importada ganha id novo
 *  (antes ela sobrescrevia a imagem de outra lousa). Se for idêntica, é reaproveitada sem gravar de novo. */
export async function resolverColisoesImagens(lousas: Lousa[], imagens: ImagemPreparada[]): Promise<{ lousas: Lousa[]; imagens: ImagemPreparada[]; remapeadas: number; reaproveitadas: number }> {
  const mapa = new Map<string, string>(); const out: ImagemPreparada[] = []; const novoId = geradorIds(new Set(imagens.map((i) => i.id)));
  let reaproveitadas = 0;
  for (const img of imagens) {
    let existente: Blob | undefined; try { existente = await carregarImagemDB(img.id); } catch { existente = undefined; }
    if (!existente) { out.push(img); continue; }
    const iguais = existente.size === img.bytes && (await sha256Hex(await bytesDoBlob(existente))) === (await sha256Hex(await bytesDoBlob(img.blob)));
    if (iguais) { reaproveitadas++; continue; }
    const novo = novoId(); mapa.set(img.id, novo); out.push({ ...img, id: novo });
  }
  return { lousas: mapa.size ? lousas.map((l) => remapearImagens(l, mapa)) : lousas, imagens: out, remapeadas: mapa.size, reaproveitadas };
}
export function remapearImagens(l: Lousa, mapa: Map<string, string>): Lousa {
  const troca = (it: Item): Item => (it.imagemId && mapa.has(it.imagemId) ? { ...it, imagemId: mapa.get(it.imagemId) } : it);
  return { ...l, doc: { ...l.doc, itens: Object.fromEntries(Object.entries(l.doc.itens).map(([k, it]) => [k, troca(it)])) }, lixeira: l.lixeira.map((e) => ({ ...e, item: troca(e.item) })) };
}

// ---------- Mesclar na lousa atual ----------
export interface ResultadoMescla { doc: Doc; edital: Lousa['edital']; questoes: Lousa['questoes']; legenda: Lousa['legenda']; contagem: { itens: number; regioes: number; conectores: number; camadas: number }; deslocamento: { x: number; y: number } }

/** Copia o conteúdo de `entrada` para dentro de `atual` com ids NOVOS (nunca sobrescreve nada), à direita do conteúdo existente. */
export function prepararMescla(atual: Lousa, entrada: Lousa): ResultadoMescla {
  const usados = new Set<string>([...Object.keys(atual.doc.itens), ...Object.keys(atual.doc.regioes), ...Object.keys(atual.doc.conectores), ...atual.lixeira.map((e) => e.item.id)]);
  const novoId = geradorIds(usados);
  const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // Camadas: por id, depois por nome; senão cria
  const camadas: Camada[] = [...atual.doc.camadas]; const mapaCam = new Map<string, string>(); let camadasNovas = 0;
  for (const c of entrada.doc.camadas) {
    const ex = camadas.find((x) => x.id === c.id) ?? camadas.find((x) => semAcento(x.nome) === semAcento(c.nome));
    if (ex) mapaCam.set(c.id, ex.id);
    else if (camadas.length < LIMITES.camadas) { const id = camadas.some((x) => x.id === c.id) ? novoId() : c.id; camadas.push({ ...c, id }); mapaCam.set(c.id, id); camadasNovas++; }
    else mapaCam.set(c.id, 'principal');
  }
  // Deslocamento: à direita do que já existe
  const caixa = (l: Lousa): Retangulo | null => { const cs = [...Object.values(l.doc.itens).map(bboxItemGirado), ...Object.values(l.doc.regioes).filter((r) => !r.pai).map((r) => r.bbox)]; return cs.length ? uniaoRetangulos(cs) : null; };
  const ca = caixa(atual), ce = caixa(entrada);
  const dx = ca && ce ? Math.round(ca.x + ca.w + 160 - ce.x) : 0, dy = ca && ce ? Math.round(ca.y - ce.y) : 0;
  const mapaReg = new Map<string, string>(); for (const id of Object.keys(entrada.doc.regioes)) mapaReg.set(id, novoId());
  const mapaIt = new Map<string, string>(); for (const id of Object.keys(entrada.doc.itens)) mapaIt.set(id, novoId());
  const mapaGrupo = new Map<string, string>();
  const regioes: Record<string, Regiao> = { ...atual.doc.regioes };
  const ordemBase = Object.keys(atual.doc.regioes).length;
  for (const r of Object.values(entrada.doc.regioes)) {
    const id = mapaReg.get(r.id)!;
    regioes[id] = { ...r, id, pai: r.pai ? mapaReg.get(r.pai) ?? null : null, filhos: r.filhos.map((f) => mapaReg.get(f)).filter((f): f is string => !!f), bbox: { ...r.bbox, x: r.bbox.x + dx, y: r.bbox.y + dy }, pontos: r.pontos ? r.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy })) : null, ordem: (r.ordem ?? 0) + ordemBase };
  }
  const zBase = Object.values(atual.doc.itens).reduce((m, it) => Math.max(m, it.z), 0);
  const itens: Record<string, Item> = { ...atual.doc.itens };
  for (const it of Object.values(entrada.doc.itens)) {
    const id = mapaIt.get(it.id)!; let grupo: string | null = null;
    if (it.grupo) { if (!mapaGrupo.has(it.grupo)) mapaGrupo.set(it.grupo, novoId()); grupo = mapaGrupo.get(it.grupo)!; }
    itens[id] = { ...it, id, x: it.x + dx, y: it.y + dy, z: it.z + zBase, regiao: it.regiao ? mapaReg.get(it.regiao) ?? null : null, camada: mapaCam.get(it.camada) ?? 'principal', grupo };
  }
  const conectores: Record<string, Conector> = { ...atual.doc.conectores };
  for (const c of Object.values(entrada.doc.conectores)) { const de = mapaIt.get(c.de), para = mapaIt.get(c.para); if (!de || !para) continue; const id = novoId(); conectores[id] = { ...c, id, de, para, camada: mapaCam.get(c.camada) ?? 'principal' }; }
  const idsEdital = new Set(atual.edital.map((t) => t.id)); const idsQ = new Set(atual.questoes.map((q) => q.id));
  const legenda = [...atual.legenda]; for (const l of entrada.legenda) if (!legenda.some((x) => x.cor === l.cor && x.significado === l.significado) && legenda.length < LIMITES.legenda) legenda.push(l);
  return {
    doc: { itens, regioes, conectores, camadas },
    edital: [...atual.edital, ...entrada.edital.map((t) => (idsEdital.has(t.id) ? { ...t, id: novoId() } : t))].slice(0, LIMITES.edital),
    questoes: [...entrada.questoes.map((q) => (idsQ.has(q.id) ? { ...q, id: novoId() } : q)), ...atual.questoes].slice(0, LIMITES.questoes),
    legenda,
    contagem: { itens: mapaIt.size, regioes: mapaReg.size, conectores: Object.keys(conectores).length - Object.keys(atual.doc.conectores).length, camadas: camadasNovas },
    deslocamento: { x: dx, y: dy },
  };
}
