// ============================================================
// NUVEM (opcional): espelha as lousas do IndexedDB no PostgreSQL
// via /api. Regras:
//  - O IndexedDB é SEMPRE a fonte primária (local-first).
//  - Se a API não responder em 4 s, o app segue 100% local e
//    tenta de novo de tempos em tempos.
//  - Conflito = vence o alteradoEm mais recente.
// ============================================================
import type { Lousa } from './types';
import { avisar, criarLousaVazia, getEstado, setLousa, setUI, substituirLousa } from './store';
import { carregarImagemDB, carregarLousaDB, definirCarregadorRemoto, listarLousasDB, registrarUrlImagem, salvarImagemDB, salvarLousaDB } from './utils/db';
import { base64ParaBlob, blobParaBase64, validarLousa } from './utils/seguranca';

export type StatusNuvem = 'verificando' | 'conectada' | 'offline' | 'desativada' | 'sincronizando' | 'erro';
export interface MetaNuvem { id: string; nome: string; arquivada: boolean; qtdItens: number; criadoEm: number; alteradoEm: number }

let conectada = false;
let timerEnvio: number | null = null;
let pendente: Lousa | null = null;
let ultimaEnviada: Lousa | null = null;
let aoAtualizarLista: (() => void) | null = null;
let aoCarregarRemota: ((l: Lousa) => void) | null = null;

const TEMPO_LIMITE = 4000;
const PERIODO_RECHECAGEM = 60_000;

async function fetchComTempo(url: string, init: RequestInit = {}, ms = TEMPO_LIMITE): Promise<Response> {
  const ctrl = new AbortController(); const t = window.setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' }); } finally { window.clearTimeout(t); }
}

export const nuvemConectada = () => conectada;
export const nuvemAtiva = () => conectada && getEstado().lousa.config.sincronizarNuvem !== false;
const setStatus = (status: StatusNuvem, extra: Partial<{ ultimaSync: number | null; erro: string | null }> = {}) => setUI((u) => ({ nuvem: { ...u.nuvem, status, ...extra } }));

/** Verifica se a API/banco respondem. Nunca lança. */
export async function verificarNuvem(silencioso = true): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (getEstado().lousa.config.sincronizarNuvem === false) { conectada = false; setStatus('desativada'); return false; }
  try {
    const r = await fetchComTempo('/api/sync');
    const j = (await r.json()) as { ok?: boolean; total?: number; modo?: 'postgres' | 'local' };
    conectada = !!j.ok;
    setStatus(conectada ? 'conectada' : 'offline', { erro: null });
    setUI((u) => ({ nuvem: { ...u.nuvem, modo: j.modo } }));
    setUI({ nuvemTotal: j.total ?? 0 });
    if (!silencioso) avisar(conectada ? (j.modo === 'local' ? 'Servidor conectado com banco local embutido. Suas lousas serão espelhadas nele.' : 'Nuvem conectada. Suas lousas serão espelhadas no banco.') : 'Nuvem indisponível. Trabalhando só com o armazenamento local.', undefined, conectada ? 'ok' : 'info');
    return conectada;
  } catch {
    conectada = false; setStatus('offline');
    if (!silencioso) avisar('Nuvem indisponível. Trabalhando só com o armazenamento local.');
    return false;
  }
}

export async function listarLousasNuvem(): Promise<MetaNuvem[]> {
  if (!nuvemAtiva()) return [];
  try { const r = await fetchComTempo('/api/lousas'); const j = (await r.json()) as { ok: boolean; lousas?: MetaNuvem[] }; return j.ok ? (j.lousas ?? []) : []; } catch { return []; }
}
export async function baixarLousaNuvem(id: string): Promise<Lousa | null> {
  if (!nuvemAtiva()) return null;
  try { const r = await fetchComTempo(`/api/lousas/${encodeURIComponent(id)}`, {}, 15000); const j = (await r.json()) as { ok: boolean; lousa?: unknown }; return j.ok && j.lousa ? validarLousa(j.lousa, criarLousaVazia()) : null; } catch { return null; }
}
export async function enviarLousaNuvem(l: Lousa, forcar = false): Promise<boolean> {
  if (!nuvemAtiva()) return false;
  try {
    setStatus('sincronizando');
    const r = await fetchComTempo(`/api/lousas/${encodeURIComponent(l.id)}${forcar ? '?forcar=1' : ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(l) }, 20000);
    const j = (await r.json()) as { ok: boolean; conflito?: boolean; alteradoEm?: number };
    if (!j.ok) { setStatus('erro', { erro: 'Falha ao enviar' }); return false; }
    ultimaEnviada = l; setStatus('conectada', { ultimaSync: Date.now(), erro: null });
    if (j.conflito) avisar('A nuvem tinha uma versão mais nova desta lousa. Abra "Minhas lousas" para comparar.', { rotulo: 'Baixar da nuvem', fn: () => { baixarEAplicar(l.id); } }, 'info', 9000);
    return true;
  } catch { conectada = false; setStatus('offline'); return false; }
}
export async function excluirLousaNuvem(id: string) { if (!nuvemAtiva()) return; try { await fetchComTempo(`/api/lousas/${encodeURIComponent(id)}`, { method: 'DELETE' }); aoAtualizarLista?.(); } catch { /* offline */ } }

/** Agenda o envio da lousa atual (debounce) — chamado depois de cada salvamento local. */
export function agendarEnvio(l: Lousa) {
  if (!nuvemAtiva() || l === ultimaEnviada) return;
  pendente = l;
  if (timerEnvio) window.clearTimeout(timerEnvio);
  timerEnvio = window.setTimeout(async () => { timerEnvio = null; const p = pendente; pendente = null; if (p) { await enviarLousaNuvem(p); aoAtualizarLista?.(); } }, 2500);
}
export async function enviarPendenteAgora() { if (timerEnvio) { window.clearTimeout(timerEnvio); timerEnvio = null; } const p = pendente ?? getEstado().lousa; pendente = null; if (nuvemAtiva()) await enviarLousaNuvem(p); }

/** Baixa da nuvem e aplica/salva localmente (botão "Baixar da nuvem"). */
export async function baixarEAplicar(id: string) {
  const l = await baixarLousaNuvem(id); if (!l) { avisar('Não foi possível baixar da nuvem.', undefined, 'erro'); return; }
  await salvarLousaDB(l).catch(() => {});
  if (getEstado().lousa.id === id) { substituirLousa(l); ultimaEnviada = l; }
  aoCarregarRemota?.(l); aoAtualizarLista?.(); avisar(`"${l.nome}" baixada da nuvem.`, undefined, 'ok');
}

/** Sincronização completa: compara local × nuvem e iguala pelos carimbos de tempo. */
export async function sincronizarTudo(manual = false): Promise<void> {
  if (!(await verificarNuvem())) { if (manual) avisar('Nuvem indisponível no momento.', undefined, 'erro'); return; }
  setStatus('sincronizando');
  try {
    const [locais, remotas] = await Promise.all([listarLousasDB().catch(() => [] as Lousa[]), listarLousasNuvem()]);
    const mapaLocal = new Map(locais.map((l) => [l.id, l])); const mapaRemoto = new Map(remotas.map((r) => [r.id, r]));
    let enviadas = 0, baixadas = 0;
    const atualId = getEstado().lousa.id;
    // envia o que só existe aqui ou está mais novo aqui
    const paraEnviar: Lousa[] = [];
    for (const l of locais) { const r = mapaRemoto.get(l.id); if (!r || r.alteradoEm < l.alteradoEm) paraEnviar.push(l); }
    if (paraEnviar.length) {
      try { const r = await fetchComTempo('/api/lousas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lousas: paraEnviar }) }, 30000); const j = (await r.json()) as { ok: boolean; gravadas?: number }; if (j.ok) enviadas = j.gravadas ?? 0; } catch { /* segue */ }
    }
    // baixa o que só existe lá ou está mais novo lá
    for (const r of remotas) {
      const l = mapaLocal.get(r.id);
      if (l && l.alteradoEm >= r.alteradoEm) continue;
      const remota = await baixarLousaNuvem(r.id); if (!remota) continue;
      await salvarLousaDB(remota).catch(() => {}); baixadas++;
      if (remota.id === atualId && remota.alteradoEm > getEstado().lousa.alteradoEm) { substituirLousa(remota); ultimaEnviada = remota; }
    }
    // Primeiro acesso neste navegador: nada local e a lousa atual vazia → abre a mais recente da nuvem
    const atual = getEstado().lousa; const atualVazia = !Object.keys(atual.doc.itens).length && !Object.keys(atual.doc.regioes).length;
    if (!locais.length && atualVazia && remotas.length) { const maisRecente = [...remotas].filter((r) => !r.arquivada).sort((a, b) => b.alteradoEm - a.alteradoEm)[0] ?? remotas[0]; const l = (await carregarLousaDB(maisRecente.id).catch(() => null)) ?? (await baixarLousaNuvem(maisRecente.id)); if (l) { substituirLousa(l); ultimaEnviada = l; aoCarregarRemota?.(l); } }
    setStatus('conectada', { ultimaSync: Date.now(), erro: null });
    setUI({ nuvemTotal: Math.max(remotas.length, locais.length) });
    aoAtualizarLista?.();
    if (manual || baixadas) avisar(`Sincronizado: ${enviadas} enviada(s), ${baixadas} baixada(s).`, undefined, 'ok');
  } catch { setStatus('erro', { erro: 'Falha na sincronização' }); if (manual) avisar('Falha ao sincronizar.', undefined, 'erro'); }
}

// ---------- Imagens ----------
export async function enviarImagemNuvem(id: string, blob: Blob) {
  if (!nuvemAtiva()) return;
  try { const base64 = await blobParaBase64(blob); await fetchComTempo(`/api/imagens/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: blob.type, base64 }) }, 30000); } catch { /* offline */ }
}
/** Procura a imagem localmente; se não houver, tenta a nuvem e guarda no IndexedDB. */
export async function obterImagem(id: string): Promise<Blob | null> {
  try { const local = await carregarImagemDB(id); if (local) return local; } catch { /* sem IDB */ }
  if (!nuvemAtiva()) return null;
  try {
    const r = await fetchComTempo(`/api/imagens/${encodeURIComponent(id)}`, {}, 30000); const j = (await r.json()) as { ok: boolean; base64?: string };
    if (!j.ok || !j.base64) return null; const blob = base64ParaBlob(j.base64); if (!blob) return null;
    await salvarImagemDB(id, blob).catch(() => {}); registrarUrlImagem(id, blob); return blob;
  } catch { return null; }
}

/** Liga/desliga a sincronização nas configurações. */
export async function definirSincronizacao(ativa: boolean) {
  setLousa((l) => ({ config: { ...l.config, sincronizarNuvem: ativa } }));
  if (ativa) { await verificarNuvem(false); if (conectada) sincronizarTudo(); } else { conectada = false; setStatus('desativada'); }
}

/** Chamado uma vez pela persistência. */
export function iniciarNuvem(cbs: { aoAtualizarLista: () => void; aoCarregarRemota: (l: Lousa) => void }) {
  aoAtualizarLista = cbs.aoAtualizarLista; aoCarregarRemota = cbs.aoCarregarRemota;
  definirCarregadorRemoto(obterImagem);
  sincronizarTudo().catch(() => {});
  window.setInterval(() => { if (!conectada && getEstado().lousa.config.sincronizarNuvem !== false) verificarNuvem().then((ok) => { if (ok) sincronizarTudo(); }); }, PERIODO_RECHECAGEM);
  window.addEventListener('online', () => { verificarNuvem().then((ok) => { if (ok) sincronizarTudo(); }); });
  window.addEventListener('offline', () => { conectada = false; setStatus('offline'); });
}

// utilitário para o diálogo "Minhas lousas": lousa só na nuvem?
export async function lousaExisteLocal(id: string) { try { return !!(await carregarLousaDB(id)); } catch { return false; } }
