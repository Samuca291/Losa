// ============================================================
// ARMAZENAMENTO: IndexedDB (não localStorage: pequeno e síncrono).
// Lousas em JSON, imagens como Blob, metadados à parte.
// ============================================================
import type { Lousa } from '../types';

const NOME_DB = 'lousa-estudos';
const VERSAO_DB = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

export function abrirDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((ok, erro) => {
    if (typeof indexedDB === 'undefined') { erro(new Error('IndexedDB indisponível')); return; }
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(NOME_DB, VERSAO_DB); } catch (e) { erro(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lousas')) db.createObjectStore('lousas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('imagens')) db.createObjectStore('imagens');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error ?? new Error('Falha ao abrir o banco'));
    req.onblocked = () => erro(new Error('Banco bloqueado por outra aba'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx<T>(store: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest): Promise<T> {
  return abrirDB().then((db) => new Promise<T>((ok, erro) => {
    const t = db.transaction(store, modo);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => erro(req.error);
    t.onabort = () => erro(t.error ?? new Error('Transação abortada'));
  }));
}

export const ehErroDeCota = (e: unknown) => !!e && typeof e === 'object' && ((e as DOMException).name === 'QuotaExceededError' || (e as DOMException).name === 'NS_ERROR_DOM_QUOTA_REACHED');

// ---- Lousas ----
export const salvarLousaDB = (l: Lousa) => tx<IDBValidKey>('lousas', 'readwrite', (s) => s.put(l));
export const carregarLousaDB = (id: string) => tx<Lousa | undefined>('lousas', 'readonly', (s) => s.get(id));
export const listarLousasDB = () => tx<Lousa[]>('lousas', 'readonly', (s) => s.getAll());
export const excluirLousaDB = (id: string) => tx<undefined>('lousas', 'readwrite', (s) => s.delete(id));

// ---- Imagens (Blob) ----
export const salvarImagemDB = (id: string, blob: Blob) => tx<IDBValidKey>('imagens', 'readwrite', (s) => s.put(blob, id));
export const carregarImagemDB = (id: string) => tx<Blob | undefined>('imagens', 'readonly', (s) => s.get(id));
export const excluirImagemDB = (id: string) => tx<undefined>('imagens', 'readwrite', (s) => s.delete(id));
export const listarChavesImagens = () => tx<IDBValidKey[]>('imagens', 'readonly', (s) => s.getAllKeys());

// ---- Meta ----
export const lerMeta = <T,>(chave: string) => tx<T | undefined>('meta', 'readonly', (s) => s.get(chave));
export const gravarMeta = (chave: string, valor: unknown) => tx<IDBValidKey>('meta', 'readwrite', (s) => s.put(valor, chave));

// ---- Backups automáticos ----
export interface Backup { id: string; lousaId: string; nome: string; data: number; lousa: Lousa }
export const salvarBackupDB = (b: Backup) => tx<IDBValidKey>('backups', 'readwrite', (s) => s.put(b));
export const listarBackupsDB = () => tx<Backup[]>('backups', 'readonly', (s) => s.getAll());
export const excluirBackupDB = (id: string) => tx<undefined>('backups', 'readwrite', (s) => s.delete(id));

// ---- Espaço ----
export async function estimarEspaco(): Promise<{ usado: number; cota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usado: e.usage ?? 0, cota: e.quota ?? 0 };
  } catch { return null; }
}
export async function pedirPersistencia(): Promise<boolean> {
  try { if (navigator.storage?.persist) { if (await navigator.storage.persisted()) return true; return await navigator.storage.persist(); } } catch { /* ignorar */ }
  return false;
}
export const formatarBytes = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

// ---- Cache de URLs de imagens (revogadas ao sair) ----
const urlsImagens = new Map<string, string>();
let carregadorRemoto: ((id: string) => Promise<Blob | null>) | null = null;
/** Permite à camada de nuvem oferecer imagens que não existem localmente. */
export const definirCarregadorRemoto = (fn: (id: string) => Promise<Blob | null>) => { carregadorRemoto = fn; };
export async function urlDaImagem(id: string): Promise<string | null> {
  const cache = urlsImagens.get(id); if (cache) return cache;
  let blob: Blob | undefined | null = null;
  try { blob = await carregarImagemDB(id); } catch { blob = null; }
  if (!blob && carregadorRemoto) { try { blob = await carregadorRemoto(id); } catch { blob = null; } }
  if (!blob) return null;
  const url = URL.createObjectURL(blob); urlsImagens.set(id, url); return url;
}
export function registrarUrlImagem(id: string, blob: Blob): string {
  const antiga = urlsImagens.get(id); if (antiga) URL.revokeObjectURL(antiga);
  const url = URL.createObjectURL(blob); urlsImagens.set(id, url); return url;
}
export function liberarImagem(id: string) { const u = urlsImagens.get(id); if (u) { URL.revokeObjectURL(u); urlsImagens.delete(id); } }

// ---- Download de arquivos ----
export function baixarArquivo(nome: string, conteudo: Blob | string, tipo = 'application/json') {
  const blob = typeof conteudo === 'string' ? new Blob([conteudo], { type: tipo }) : conteudo;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const nomeArquivoSeguro = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'lousa';
export const dataParaNome = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
