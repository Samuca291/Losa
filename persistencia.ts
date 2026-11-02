// ============================================================
// PERSISTÊNCIA: liga o store ao IndexedDB, backups, exportações e
// importações. A lógica de dados (validação, formatos, integridade)
// vive em ./dados; aqui ficam só as ações que mexem no estado.
// ============================================================
import { toPng } from 'html-to-image';
import type { Item, Lousa } from './types';
import {
  abrirDB, baixarArquivo, carregarImagemDB, carregarLousaDB, dataParaNome, ehErroDeCota, estimarEspaco, excluirBackupDB,
  excluirLousaDB, gravarMeta, lerMeta, listarBackupsDB, listarLousasDB, nomeArquivoSeguro, pedirPersistencia,
  registrarUrlImagem, salvarBackupDB, salvarImagemDB, salvarLousaDB, type Backup,
} from './utils/db';
import { assinarEstado, avisar, criarItem, criarLousaVazia, enquadrar, gerarId, getEstado, setDoc, setLousa, setUI, substituirLousa, textoDoItem, verTudo } from './store';
import { blobParaBase64, processarImagem } from './utils/seguranca';
import { uniaoRetangulos, bboxItemGirado } from './utils/geometria';
import { agendarEnvio, enviarImagemNuvem, enviarPendenteAgora, excluirLousaNuvem, iniciarNuvem } from './nuvem';
import { validarLousa } from './dados/validacao';
import { Relatorio } from './dados/relatorio';
import { imagensDaLousa } from './dados/tipos';
import { analisarArquivo, prepararMescla, resolverColisoesImagens, type AnaliseImportacao } from './dados/importacao';
import { gerarCSVCartoes, gerarTexto, lousaParaAutoria, montarEnvelope, OPCOES_PADRAO, serializar, verificarIdaEVolta, type OpcoesExportacao } from './dados/exportacao';

let temporizador: number | null = null;
let ultimaSalva: Lousa | null = null;
let ultimaAgendada: Lousa | null = null;
let persistenciaPedida = false;
let canal: BroadcastChannel | null = null;
let iniciado = false;
const ID_ABA = gerarId();

export async function inicializar() {
  if (iniciado) return; // idempotente (StrictMode monta efeitos duas vezes em desenvolvimento)
  iniciado = true;
  try {
    await abrirDB();
  } catch {
    setUI({ armazenamentoIndisponivel: true, salvando: 'indisponivel', carregado: true });
    avisar('O navegador bloqueou o armazenamento local. Se a nuvem estiver conectada, as lousas serão salvas nela; senão, EXPORTE antes de fechar.', undefined, 'erro', 12000);
    assinarEstado(() => { const { lousa: l } = getEstado(); if (l === ultimaAgendada) return; ultimaAgendada = l; if (temporizador) window.clearTimeout(temporizador); temporizador = window.setTimeout(() => agendarEnvio(getEstado().lousa), 800); });
    iniciarNuvem({ aoAtualizarLista: () => atualizarListaLousas(), aoCarregarRemota: (l) => { ultimaSalva = l; } });
    return;
  }
  try {
    const ativa = await lerMeta<string>('ativa');
    const lista = await listarLousasDB();
    const l = (ativa && lista.find((x) => x.id === ativa)) ?? lista.sort((a, b) => b.alteradoEm - a.alteradoEm)[0];
    // preservarTempo: abrir não é alterar (antes o alteradoEm virava "agora" a cada abertura e podia vencer a nuvem indevidamente)
    if (l) { substituirLousa(validarLousa(l, criarLousaVazia(), { preservarTempo: true })); ultimaSalva = getEstado().lousa; }
    atualizarListaLousas(lista);
    let lembrete = (await lerMeta<number>('ultimoBackupLembrete')) ?? 0;
    if (!lembrete) { lembrete = Date.now(); gravarMeta('ultimoBackupLembrete', lembrete).catch(() => {}); }
    setUI({ carregado: true, salvando: 'ok', ultimoBackupLembrete: lembrete });
    if (lista.length && Date.now() - lembrete > 7 * 86_400_000 && Object.keys(getEstado().lousa.doc.itens).length > 10) {
      avisar('Faz mais de 7 dias sem backup. Exporte um arquivo .json para não perder seus estudos.', { rotulo: 'Exportar agora', fn: () => { exportarJSON(); } }, 'info', 10000);
      gravarMeta('ultimoBackupLembrete', Date.now()).catch(() => {});
    }
  } catch (e) {
    console.error(e); setUI({ carregado: true, salvando: 'erro' });
  }
  // Salvamento automático: 1 s depois da última mudança
  assinarEstado(() => {
    const { lousa: l, ui } = getEstado();
    if (l === ultimaSalva || l === ultimaAgendada) return;
    ultimaAgendada = l;
    if (temporizador) window.clearTimeout(temporizador);
    temporizador = window.setTimeout(() => salvarAgora(), 1000);
    if (ui.salvando !== 'salvando') setUI({ salvando: 'salvando' });
  });
  const forcar = () => { if (getEstado().lousa !== ultimaSalva) salvarAgora(); };
  window.addEventListener('pagehide', forcar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') forcar(); });
  try {
    canal = new BroadcastChannel('lousa-estudos');
    canal.onmessage = (ev) => { if (ev.data?.tipo === 'ola' && ev.data.id !== ID_ABA) { setUI({ outraAba: true }); canal?.postMessage({ tipo: 'presente', id: ID_ABA }); } if (ev.data?.tipo === 'presente' && ev.data.id !== ID_ABA) setUI({ outraAba: true }); };
    canal.postMessage({ tipo: 'ola', id: ID_ABA });
  } catch { /* sem BroadcastChannel */ }
  atualizarEspaco();
  window.setInterval(() => { const l = getEstado().lousa; if (Object.keys(l.doc.itens).length && l !== ultimoBackup) criarBackup('automático'); }, 10 * 60_000);
  iniciarNuvem({ aoAtualizarLista: () => atualizarListaLousas(), aoCarregarRemota: (l) => { ultimaSalva = l; } });
  window.addEventListener('pagehide', () => { enviarPendenteAgora(); });
}

let ultimoBackup: Lousa | null = null;
export async function salvarAgora() {
  const { lousa, ui } = getEstado();
  if (ui.armazenamentoIndisponivel) return;
  const vazia = !Object.keys(lousa.doc.itens).length && !Object.keys(lousa.doc.regioes).length && !lousa.edital.length && !lousa.questoes.length;
  if (vazia && ultimaSalva === null && !ui.lousas.some((x) => x.id === lousa.id)) { setUI({ salvando: 'ok' }); return; }
  try {
    await salvarLousaDB(lousa);
    ultimaSalva = lousa;
    await gravarMeta('ativa', lousa.id);
    setUI({ salvando: 'ok' });
    agendarEnvio(lousa);
    if (!persistenciaPedida && Object.keys(lousa.doc.itens).length >= 3 && navigator.userActivation?.hasBeenActive !== false) { persistenciaPedida = true; pedirPersistencia().catch(() => {}); }
    atualizarListaLousas();
  } catch (e) {
    setUI({ salvando: 'erro' });
    if (ehErroDeCota(e)) avisar('O espaço do navegador acabou. Exporte a lousa em .json e remova imagens grandes.', { rotulo: 'Exportar', fn: () => { exportarJSON(); } }, 'erro', 12000);
    else avisar('Não foi possível salvar agora. Tente exportar um backup.', undefined, 'erro');
  }
}
export async function atualizarEspaco() { const e = await estimarEspaco(); setUI({ espaco: e }); }
export async function atualizarListaLousas(lista?: Lousa[]) {
  try {
    let ls: Lousa[] = [];
    try { ls = lista ?? (await listarLousasDB()); } catch { ls = []; }
    const locais = ls.map((l) => ({ id: l.id, nome: l.nome, alteradoEm: l.alteradoEm, arquivada: l.arquivada, qtdItens: Object.keys(l.doc?.itens ?? {}).length, origem: 'local' as const }));
    const { listarLousasNuvem } = await import('./nuvem');
    const remotas = await listarLousasNuvem();
    const ids = new Set(locais.map((l) => l.id)); const soNuvem = remotas.filter((r) => !ids.has(r.id)).map((r) => ({ id: r.id, nome: r.nome, alteradoEm: Number(r.alteradoEm), arquivada: r.arquivada, qtdItens: r.qtdItens, origem: 'nuvem' as const }));
    const idsRemotos = new Set(remotas.map((r) => r.id));
    const todas = [...locais.map((l) => ({ ...l, origem: idsRemotos.has(l.id) ? ('ambos' as const) : ('local' as const) })), ...soNuvem];
    setUI({ lousas: todas.sort((a, b) => b.alteradoEm - a.alteradoEm) });
  } catch { /* */ }
}

// ---------- Várias lousas ----------
export async function trocarLousa(id: string) {
  if (getEstado().lousa !== ultimaSalva) await salvarAgora();
  let l = await carregarLousaDB(id).catch(() => undefined);
  if (!l) { const { baixarLousaNuvem } = await import('./nuvem'); const remota = await baixarLousaNuvem(id); if (remota) { l = remota; await salvarLousaDB(remota).catch(() => {}); } }
  if (!l) { avisar('Lousa não encontrada.'); return; }
  substituirLousa(validarLousa(l, criarLousaVazia(), { preservarTempo: true })); ultimaSalva = getEstado().lousa; await gravarMeta('ativa', id).catch(() => {});
}
export async function novaLousa(nome: string) {
  if (getEstado().lousa !== ultimaSalva) await salvarAgora();
  const l = criarLousaVazia(nome || 'Nova lousa'); substituirLousa(l); ultimaSalva = null; await salvarAgora();
}
export async function excluirLousa(id: string) {
  await excluirLousaDB(id).catch(() => {}); excluirLousaNuvem(id); const { lousa, ui } = getEstado();
  if (lousa.id === id) { const outra = ui.lousas.find((l) => l.id !== id); if (outra) await trocarLousa(outra.id); else await novaLousa('Minha lousa'); }
  atualizarListaLousas(); avisar('Lousa excluída');
}
export async function duplicarLousa(id: string) {
  const l = id === getEstado().lousa.id ? getEstado().lousa : await carregarLousaDB(id); if (!l) return;
  const nova: Lousa = { ...l, id: gerarId(), nome: `${l.nome} (cópia)`, criadoEm: Date.now(), alteradoEm: Date.now() };
  await salvarLousaDB(nova); atualizarListaLousas(); avisar('Lousa duplicada');
}
export async function renomearLousaPorId(id: string, nome: string) {
  if (id === getEstado().lousa.id) { substituirLousaParcial({ nome }); return; }
  const l = await carregarLousaDB(id); if (l) { await salvarLousaDB({ ...l, nome, alteradoEm: Date.now() }); atualizarListaLousas(); }
}
export async function arquivarLousa(id: string, arquivada: boolean) {
  if (id === getEstado().lousa.id) { substituirLousaParcial({ arquivada }); return; }
  const l = await carregarLousaDB(id); if (l) { await salvarLousaDB({ ...l, arquivada }); atualizarListaLousas(); }
}
function substituirLousaParcial(p: Partial<Lousa>) { const { lousa } = getEstado(); substituirLousa({ ...lousa, ...p, alteradoEm: Date.now() }); }

// ---------- Backups internos ----------
export async function criarBackup(origem = 'manual') {
  const l = getEstado().lousa; ultimoBackup = l;
  try {
    const b: Backup = { id: gerarId(), lousaId: l.id, nome: `${l.nome} · ${origem} · ${new Date().toLocaleString('pt-BR')}`, data: Date.now(), lousa: l };
    await salvarBackupDB(b);
    const todos = (await listarBackupsDB()).filter((x) => x.lousaId === l.id).sort((a, c) => c.data - a.data);
    for (const velho of todos.slice(10)) await excluirBackupDB(velho.id);
    if (origem === 'manual') avisar('Backup interno criado');
    return true;
  } catch (e) { if (ehErroDeCota(e)) avisar('Sem espaço para backup interno. Exporte um .json.', undefined, 'erro'); return false; }
}
export const listarBackups = () => listarBackupsDB().then((bs) => bs.sort((a, b) => b.data - a.data)).catch(() => [] as Backup[]);
/** Restaura com segurança: salva o estado atual e cria um backup "antes de restaurar" da lousa que será substituída. */
export async function restaurarBackup(id: string) {
  const b = (await listarBackupsDB().catch(() => [] as Backup[])).find((x) => x.id === id);
  if (!b) { avisar('Backup não encontrado.', undefined, 'erro'); return; }
  const rel = new Relatorio(); let l: Lousa;
  try { l = validarLousa(b.lousa, criarLousaVazia(), { rel }); } catch (e) { avisar(`Backup ilegível: ${(e as Error).message}`, undefined, 'erro'); return; }
  if (getEstado().lousa !== ultimaSalva) await salvarAgora();
  if (getEstado().lousa.id === l.id) await criarBackup('antes de restaurar');
  substituirLousa(l); ultimaSalva = null; await salvarAgora();
  avisar(`Backup restaurado${rel.contagem.aviso ? ` (${rel.contagem.aviso} correção(ões) de validação)` : ''}.`, undefined, 'ok');
}

// ---------- Exportar JSON ----------
export interface ResultadoExportacao { nomeArquivo: string; bytes: number; hash: string; lousas: number; itens: number; imagens: number; faltando: string[]; verificado: boolean; problemas: string[] }

/** Backup .json com envelope v2, hash SHA-256 e verificação de ida e volta antes de entregar o arquivo. */
export async function exportarJSON(opcoes: Partial<OpcoesExportacao> & { escopo?: 'atual' | 'todas' } = {}): Promise<ResultadoExportacao | null> {
  const op: OpcoesExportacao = { ...OPCOES_PADRAO, ...opcoes };
  try {
    if (getEstado().lousa !== ultimaSalva && !getEstado().ui.armazenamentoIndisponivel) await salvarAgora();
    const atual = getEstado().lousa; let lousas: Lousa[] = [atual];
    if (opcoes.escopo === 'todas') {
      let todas: Lousa[] = []; try { todas = await listarLousasDB(); } catch { todas = []; }
      const mapa = new Map(todas.map((l) => [l.id, l])); mapa.set(atual.id, atual); // a versão em memória é a mais recente
      lousas = [...mapa.values()].sort((a, b) => b.alteradoEm - a.alteradoEm); op.pacote = true;
    }
    const { envelope, faltando } = await montarEnvelope(lousas, op, (id) => carregarImagemDB(id));
    const texto = serializar(envelope, op.legivel);
    const ver = await verificarIdaEVolta(texto, envelope);
    const nomeArquivo = op.pacote ? `lousas_backup-completo_${dataParaNome()}.json` : `lousa_${nomeArquivoSeguro(atual.nome)}_${dataParaNome()}.json`;
    baixarArquivo(nomeArquivo, texto);
    await gravarMeta('ultimoBackupLembrete', Date.now()).catch(() => {}); setUI({ ultimoBackupLembrete: Date.now() });
    if (!ver.ok) avisar(`Atenção: a verificação do arquivo exportado falhou (${ver.problemas.join('; ')}). Crie também um backup interno.`, undefined, 'erro', 12000);
    else avisar(faltando.length ? `.json exportado e verificado, mas ${faltando.length} imagem(ns) não foram encontradas neste navegador.` : 'Arquivo .json exportado e verificado (SHA-256). Guarde-o em local seguro.', undefined, faltando.length ? 'info' : 'ok', 7000);
    return { nomeArquivo, bytes: new Blob([texto]).size, hash: envelope.integridade?.hash ?? '', lousas: lousas.length, itens: envelope.resumo.itens, imagens: envelope.resumo.imagens, faltando, verificado: ver.ok, problemas: ver.problemas };
  } catch (e) {
    avisar(`Falha ao exportar: ${(e as Error).message}`, undefined, 'erro', 9000); return null;
  }
}
/** JSON simplificado (formato de autoria): só o que difere do padrão, ideal para editar à mão e importar de volta. */
export async function exportarAutoriaJSON(incluirImagens = false) {
  const l = getEstado().lousa; const imagens: Record<string, string> = {};
  if (incluirImagens) for (const id of imagensDaLousa(l)) { try { const b = await carregarImagemDB(id); if (b) imagens[id] = await blobParaBase64(b); } catch { /* sem imagem */ } }
  baixarArquivo(`lousa_${nomeArquivoSeguro(l.nome)}_simplificado.json`, serializar(lousaParaAutoria(l, imagens), true));
  avisar('JSON simplificado exportado: edite à mão e importe de volta quando quiser.', undefined, 'ok');
}

// ---------- Importar JSON (fase 2: aplicar uma análise já revisada) ----------
export type ModoImportacao = 'nova' | 'substituir' | 'mesclar';
export interface ResultadoImportacao { modo: ModoImportacao; lousas: number; itens: number; imagens: number; imagensRemapeadas: number; backupCriado: boolean; nomes: string[] }

export async function importarAnalise(analise: AnaliseImportacao, modo: ModoImportacao, indices?: number[]): Promise<ResultadoImportacao> {
  if (!analise.ok || !analise.lousas.length) throw new Error(analise.erroFatal ?? 'Não há nada para importar.');
  let selecionadas = indices?.length ? indices.map((i) => analise.lousas[i]).filter((l): l is Lousa => !!l) : analise.lousas;
  if (!selecionadas.length) throw new Error('Selecione ao menos uma lousa.');
  if (modo !== 'nova' && selecionadas.length > 1) throw new Error('Para substituir ou mesclar, escolha uma única lousa.');
  if (modo === 'nova' && selecionadas.length > 1 && getEstado().ui.armazenamentoIndisponivel) throw new Error('O armazenamento do navegador está bloqueado: importe uma lousa por vez.');
  // 1) Imagens (sem sobrescrever imagens diferentes de outras lousas)
  const usadas = new Set<string>(); for (const l of selecionadas) for (const id of imagensDaLousa(l)) usadas.add(id);
  const col = await resolverColisoesImagens(selecionadas, analise.imagens.filter((i) => usadas.has(i.id)));
  selecionadas = col.lousas;
  for (const img of col.imagens) {
    try { await salvarImagemDB(img.id, img.blob); } catch (e) { if (ehErroDeCota(e)) throw new Error('Sem espaço no navegador para as imagens. Libere espaço e tente de novo.'); }
    registrarUrlImagem(img.id, img.blob); enviarImagemNuvem(img.id, img.blob);
  }
  // 2) Garante que nada da lousa atual se perca
  if (getEstado().lousa !== ultimaSalva) await salvarAgora();
  let backupCriado = false;
  if (modo !== 'nova' && Object.keys(getEstado().lousa.doc.itens).length + Object.keys(getEstado().lousa.doc.regioes).length > 0) backupCriado = await criarBackup(modo === 'substituir' ? 'antes de substituir por importação' : 'antes de mesclar importação');
  const nomes: string[] = []; let itens = 0;
  if (modo === 'mesclar') {
    const atual = getEstado().lousa; const m = prepararMescla(atual, selecionadas[0]);
    setDoc(() => m.doc); // entra no histórico: Ctrl+Z desfaz a mesclagem inteira
    setLousa(() => ({ edital: m.edital, questoes: m.questoes, legenda: m.legenda }));
    itens = m.contagem.itens; nomes.push(selecionadas[0].nome);
    const novos = Object.keys(m.doc.itens).filter((id) => !atual.doc.itens[id]).map((id) => bboxItemGirado(m.doc.itens[id]));
    if (novos.length) window.setTimeout(() => enquadrar(uniaoRetangulos(novos), 80, 1), 60);
  } else if (modo === 'substituir') {
    const nova: Lousa = { ...selecionadas[0], id: getEstado().lousa.id, alteradoEm: Date.now() };
    substituirLousa(nova); ultimaSalva = null; await salvarAgora();
    nomes.push(nova.nome); itens = Object.keys(nova.doc.itens).length;
  } else {
    const nomesExistentes = new Set(getEstado().ui.lousas.map((l) => l.nome));
    const novas = selecionadas.map((l) => ({ ...l, id: gerarId(), nome: nomesExistentes.has(l.nome) ? `${l.nome} (importada)`.slice(0, 80) : l.nome, alteradoEm: Date.now() }));
    for (const l of novas.slice(1)) { try { await salvarLousaDB(l); } catch (e) { throw new Error(ehErroDeCota(e) ? 'Sem espaço no navegador para todas as lousas do pacote.' : `Falha ao gravar "${l.nome}".`); } }
    substituirLousa(novas[0]); ultimaSalva = null; await salvarAgora();
    nomes.push(...novas.map((l) => l.nome)); itens = novas.reduce((s, l) => s + Object.keys(l.doc.itens).length, 0);
  }
  if (analise.enquadrar && modo !== 'mesclar') window.setTimeout(() => verTudo(), 80);
  atualizarListaLousas();
  return { modo, lousas: selecionadas.length, itens, imagens: col.imagens.length + col.reaproveitadas, imagensRemapeadas: col.remapeadas, backupCriado, nomes };
}
/** Atalho compatível com a API antiga: analisa e aplica direto (sem tela de revisão). */
export async function importarJSON(arquivo: File, modo: ModoImportacao = 'nova') {
  const a = await analisarArquivo(arquivo); if (!a.ok) throw new Error(a.erroFatal ?? 'Arquivo inválido.');
  const r = await importarAnalise(a, modo);
  avisar(`Importação concluída: ${r.itens} itens em ${r.lousas} lousa(s).`, undefined, 'ok');
  return r;
}

// ---------- Exportar texto / CSV ----------
export function exportarTexto(formato: 'md' | 'txt') {
  const l = getEstado().lousa;
  baixarArquivo(`lousa_${nomeArquivoSeguro(l.nome)}.${formato}`, gerarTexto(l, formato), formato === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8');
}
export function exportarCSVCartoes() {
  const l = getEstado().lousa;
  baixarArquivo(`cartoes_${nomeArquivoSeguro(l.nome)}.csv`, gerarCSVCartoes(l), 'text/csv;charset=utf-8');
}

// ---------- Exportar imagem (PNG) e PDF ----------
export async function exportarPNG(mundo: HTMLElement, escala: 1 | 2 = 1, regiaoId?: string | null): Promise<string | null> {
  const l = getEstado().lousa;
  let caixa = regiaoId && l.doc.regioes[regiaoId] ? l.doc.regioes[regiaoId].bbox : null;
  if (!caixa) { const cs = [...Object.values(l.doc.itens).filter((i) => !i.oculto).map(bboxItemGirado), ...Object.values(l.doc.regioes).filter((r) => !r.pai).map((r) => r.bbox)]; if (!cs.length) { avisar('Não há nada para exportar.'); return null; } caixa = uniaoRetangulos(cs); }
  const m = 40; const w = Math.min(caixa.w + 2 * m, 16000 / escala), h = Math.min(caixa.h + 2 * m, 16000 / escala);
  setUI({ arrastando: true });
  await new Promise((r) => setTimeout(r, 50));
  try {
    const url = await toPng(mundo, { width: w, height: h, pixelRatio: escala, backgroundColor: l.config.corFundo, style: { transform: `translate(${-caixa.x + m}px, ${-caixa.y + m}px) scale(1)`, transformOrigin: '0 0' }, filter: (n) => !(n instanceof HTMLElement && n.dataset.naoExportar === '1') });
    return url;
  } catch (e) { console.error(e); avisar('Falha ao gerar a imagem. Tente uma região menor.', undefined, 'erro'); return null; }
  finally { setUI({ arrastando: false }); }
}
export async function baixarPNG(mundo: HTMLElement, escala: 1 | 2 = 1, regiaoId?: string | null) {
  const url = await exportarPNG(mundo, escala, regiaoId); if (!url) return;
  const a = document.createElement('a'); a.href = url; a.download = `lousa_${nomeArquivoSeguro(getEstado().lousa.nome)}_${escala}x.png`; a.click(); avisar('Imagem PNG exportada');
}
export async function imprimirPDF(mundo: HTMLElement, regiaoId?: string | null) {
  const url = await exportarPNG(mundo, 2, regiaoId); if (!url) return;
  const img = document.getElementById('imagem-impressao') as HTMLImageElement | null; if (!img) return;
  img.src = url; img.onload = () => { window.print(); };
}

// ---------- Imagens ----------
export async function criarItemImagem(arquivo: Blob, pos: { x: number; y: number }) {
  try {
    const { blob, w, h } = await processarImagem(arquivo);
    const id = gerarId(); await salvarImagemDB(id, blob).catch(() => {}); registrarUrlImagem(id, blob); enviarImagemNuvem(id, blob);
    const escala = Math.min(1, 420 / Math.max(w, h));
    criarItem({ tipo: 'imagem', x: pos.x, y: pos.y, w: Math.round(w * escala), h: Math.round(h * escala), imagemId: id, cor: 'transparent', angulo: 0 });
  } catch (e) { avisar((e as Error).message || 'Não foi possível adicionar a imagem.', undefined, 'erro'); }
}

export const nomeArquivoLousa = () => nomeArquivoSeguro(getEstado().lousa.nome);
export type { Item };
export { textoDoItem };
