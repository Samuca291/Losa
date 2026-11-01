// ============================================================
// PERSISTÊNCIA: liga o store ao IndexedDB, backups, exportações.
// ============================================================
import { toPng } from 'html-to-image';
import type { Item, Lousa } from './types';
import { ROTULOS_STATUS } from './types';
import {
  abrirDB, baixarArquivo, carregarImagemDB, carregarLousaDB, dataParaNome, ehErroDeCota, estimarEspaco, excluirBackupDB,
  excluirLousaDB, gravarMeta, lerMeta, listarBackupsDB, listarLousasDB, nomeArquivoSeguro, pedirPersistencia,
  registrarUrlImagem, salvarBackupDB, salvarImagemDB, salvarLousaDB, type Backup,
} from './utils/db';
import { assinarEstado, avisar, criarItem, criarLousaVazia, gerarId, getEstado, setUI, substituirLousa, textoDoItem, caminhoRegiao } from './store';
import { base64ParaBlob, blobParaBase64, htmlParaTexto, processarImagem, validarLousa } from './utils/seguranca';
import { uniaoRetangulos, bboxItemGirado } from './utils/geometria';
import { agendarEnvio, enviarImagemNuvem, enviarPendenteAgora, excluirLousaNuvem, iniciarNuvem } from './nuvem';

let temporizador: number | null = null;
let ultimaSalva: Lousa | null = null;
let ultimaAgendada: Lousa | null = null;
let persistenciaPedida = false;
let canal: BroadcastChannel | null = null;
const ID_ABA = gerarId();

export async function inicializar() {
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
    if (l) { substituirLousa(validarLousa(l, criarLousaVazia())); ultimaSalva = getEstado().lousa; }
    atualizarListaLousas(lista);
    let lembrete = (await lerMeta<number>('ultimoBackupLembrete')) ?? 0;
    if (!lembrete) { lembrete = Date.now(); gravarMeta('ultimoBackupLembrete', lembrete).catch(() => {}); } // primeiro uso: começa a contar agora
    setUI({ carregado: true, salvando: 'ok', ultimoBackupLembrete: lembrete });
    if (lista.length && Date.now() - lembrete > 7 * 86_400_000 && Object.keys(getEstado().lousa.doc.itens).length > 10) {
      avisar('Faz mais de 7 dias sem backup. Exporte um arquivo .json para não perder seus estudos.', { rotulo: 'Exportar agora', fn: () => exportarJSON() }, 'info', 10000);
      gravarMeta('ultimoBackupLembrete', Date.now()).catch(() => {});
    }
  } catch (e) {
    console.error(e); setUI({ carregado: true, salvando: 'erro' });
  }
  // Salvamento automático: 1 s depois da última mudança
  assinarEstado(() => {
    const { lousa: l, ui } = getEstado();
    if (l === ultimaSalva || l === ultimaAgendada) return; // evita reentrância: setUI abaixo emite de novo
    ultimaAgendada = l;
    if (temporizador) window.clearTimeout(temporizador);
    temporizador = window.setTimeout(() => salvarAgora(), 1000);
    if (ui.salvando !== 'salvando') setUI({ salvando: 'salvando' });
  });
  const forcar = () => { if (getEstado().lousa !== ultimaSalva) salvarAgora(); };
  window.addEventListener('pagehide', forcar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') forcar(); });
  // Duas abas ao mesmo tempo
  try {
    canal = new BroadcastChannel('lousa-estudos');
    canal.onmessage = (ev) => { if (ev.data?.tipo === 'ola' && ev.data.id !== ID_ABA) { setUI({ outraAba: true }); canal?.postMessage({ tipo: 'presente', id: ID_ABA }); } if (ev.data?.tipo === 'presente' && ev.data.id !== ID_ABA) setUI({ outraAba: true }); };
    canal.postMessage({ tipo: 'ola', id: ID_ABA });
  } catch { /* sem BroadcastChannel */ }
  atualizarEspaco();
  // Backup automático a cada 10 minutos, se houve mudança
  window.setInterval(() => { const l = getEstado().lousa; if (Object.keys(l.doc.itens).length && l !== ultimoBackup) criarBackup('automático'); }, 10 * 60_000);
  // Nuvem (opcional): espelha no banco quando a API responder
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
    if (ehErroDeCota(e)) avisar('O espaço do navegador acabou. Exporte a lousa em .json e remova imagens grandes.', { rotulo: 'Exportar', fn: () => exportarJSON() }, 'erro', 12000);
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
  substituirLousa(validarLousa(l, criarLousaVazia())); ultimaSalva = getEstado().lousa; await gravarMeta('ativa', id).catch(() => {});
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

// ---------- Backups ----------
export async function criarBackup(origem = 'manual') {
  const l = getEstado().lousa; ultimoBackup = l;
  try {
    const b: Backup = { id: gerarId(), lousaId: l.id, nome: `${l.nome} · ${origem} · ${new Date().toLocaleString('pt-BR')}`, data: Date.now(), lousa: l };
    await salvarBackupDB(b);
    const todos = (await listarBackupsDB()).filter((x) => x.lousaId === l.id).sort((a, c) => c.data - a.data);
    for (const velho of todos.slice(10)) await excluirBackupDB(velho.id);
    if (origem === 'manual') avisar('Backup interno criado');
  } catch (e) { if (ehErroDeCota(e)) avisar('Sem espaço para backup interno. Exporte um .json.', undefined, 'erro'); }
}
export const listarBackups = () => listarBackupsDB().then((bs) => bs.sort((a, b) => b.data - a.data)).catch(() => [] as Backup[]);
export async function restaurarBackup(id: string) { const bs = await listarBackupsDB(); const b = bs.find((x) => x.id === id); if (!b) return; substituirLousa(validarLousa(b.lousa, criarLousaVazia())); avisar('Backup restaurado'); }

// ---------- Exportar / importar JSON ----------
export async function exportarJSON(incluirImagens = true) {
  const l = getEstado().lousa; const imagens: Record<string, string> = {};
  if (incluirImagens) for (const it of Object.values(l.doc.itens)) if (it.imagemId && !imagens[it.imagemId]) { try { const b = await carregarImagemDB(it.imagemId); if (b) imagens[it.imagemId] = await blobParaBase64(b); } catch { /* */ } }
  const envelope = { tipo: 'lousa-estudos', versao: l.versao, exportadoEm: new Date().toISOString(), lousa: l, imagens };
  baixarArquivo(`lousa_${nomeArquivoSeguro(l.nome)}_${dataParaNome()}.json`, JSON.stringify(envelope));
  await gravarMeta('ultimoBackupLembrete', Date.now()).catch(() => {}); setUI({ ultimoBackupLembrete: Date.now() });
  avisar('Arquivo .json exportado. Guarde-o em local seguro.');
}
export async function importarJSON(arquivo: File, modo: 'substituir' | 'nova' = 'nova') {
  if (arquivo.size > 200 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 200 MB).');
  const texto = await arquivo.text(); let raw: unknown;
  try { raw = JSON.parse(texto); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  const base = criarLousaVazia(); const nova = validarLousa(raw, base);
  const env = raw as { imagens?: Record<string, unknown> };
  if (env?.imagens && typeof env.imagens === 'object') {
    let n = 0;
    for (const [id, b64] of Object.entries(env.imagens)) { if (n++ > 2000) break; if (!/^[\w-]{1,64}$/.test(id) || typeof b64 !== 'string') continue; const blob = base64ParaBlob(b64); if (blob) { try { await salvarImagemDB(id, blob); registrarUrlImagem(id, blob); } catch { /* */ } } }
  }
  if (modo === 'nova') { nova.id = gerarId(); if (getEstado().lousa !== ultimaSalva) await salvarAgora(); }
  else nova.id = getEstado().lousa.id;
  substituirLousa(nova); ultimaSalva = null; await salvarAgora();
  avisar(`Lousa "${nova.nome}" importada com ${Object.keys(nova.doc.itens).length} itens.`);
}

// ---------- Exportar texto / CSV ----------
export function exportarTexto(formato: 'md' | 'txt') {
  const l = getEstado().lousa; const porRegiao = new Map<string, Item[]>();
  for (const it of Object.values(l.doc.itens)) { const k = caminhoRegiao(it.regiao, l.doc.regioes).join(' › '); porRegiao.set(k, [...(porRegiao.get(k) ?? []), it]); }
  const linhas: string[] = [formato === 'md' ? `# ${l.nome}` : l.nome.toUpperCase(), ''];
  for (const [reg, itens] of [...porRegiao.entries()].sort()) {
    linhas.push(formato === 'md' ? `## ${reg}` : `=== ${reg} ===`, '');
    for (const it of itens.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const corpo = htmlParaTexto(it.html); const titulo = it.titulo ? `${it.titulo}: ` : '';
      const meta = [it.etiquetas.length ? `#${it.etiquetas.join(' #')}` : '', ROTULOS_STATUS[it.status]].filter(Boolean).join(' · ');
      if (formato === 'md') { linhas.push(`- **${titulo}**${corpo.replace(/\n/g, '\n  ')}${it.verso ? `\n  - Verso: ${htmlParaTexto(it.verso)}` : ''}${it.tarefas ? '\n' + it.tarefas.map((t) => `  - [${t.feito ? 'x' : ' '}] ${t.texto}`).join('\n') : ''}${meta ? `  \n  _${meta}_` : ''}`); }
      else linhas.push(`• ${titulo}${corpo}${it.verso ? `\n  Verso: ${htmlParaTexto(it.verso)}` : ''}${meta ? `\n  (${meta})` : ''}`);
    }
    linhas.push('');
  }
  baixarArquivo(`lousa_${nomeArquivoSeguro(l.nome)}.${formato}`, linhas.join('\n'), 'text/plain;charset=utf-8');
}
export function exportarCSVCartoes() {
  const l = getEstado().lousa; const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const linhas = ['frente;verso;etiquetas;status;proxima_revisao;regiao'];
  for (const it of Object.values(l.doc.itens)) if (it.verso !== undefined || it.revisao.ativa || it.tipo === 'cloze') linhas.push([htmlParaTexto(it.html), htmlParaTexto(it.verso ?? ''), it.etiquetas.join(','), ROTULOS_STATUS[it.status], it.revisao.proxima ? new Date(it.revisao.proxima).toLocaleDateString('pt-BR') : '', caminhoRegiao(it.regiao, l.doc.regioes).join(' › ')].map(esc).join(';'));
  baixarArquivo(`cartoes_${nomeArquivoSeguro(l.nome)}.csv`, '\ufeff' + linhas.join('\n'), 'text/csv;charset=utf-8');
}

// ---------- Exportar imagem (PNG) e PDF ----------
export async function exportarPNG(mundo: HTMLElement, escala: 1 | 2 = 1, regiaoId?: string | null): Promise<string | null> {
  const l = getEstado().lousa;
  let caixa = regiaoId && l.doc.regioes[regiaoId] ? l.doc.regioes[regiaoId].bbox : null;
  if (!caixa) { const cs = [...Object.values(l.doc.itens).filter((i) => !i.oculto).map(bboxItemGirado), ...Object.values(l.doc.regioes).filter((r) => !r.pai).map((r) => r.bbox)]; if (!cs.length) { avisar('Não há nada para exportar.'); return null; } caixa = uniaoRetangulos(cs); }
  const m = 40; const w = Math.min(caixa.w + 2 * m, 16000 / escala), h = Math.min(caixa.h + 2 * m, 16000 / escala);
  setUI({ arrastando: true }); // sinaliza "exportando" para desligar o culling
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
export { textoDoItem };
