// ============================================================
// DADOS · IMAGENS EMBUTIDAS (data URL base64)
// - Tolera quebras de linha/espaços no base64 (comuns em JSON
//   editado à mão) e ausência de "=" no final.
// - Confere a ASSINATURA real dos bytes (PNG, JPEG, GIF, WebP):
//   o tipo declarado não é confiável; SVG/HTML disfarçados são
//   recusados.
// - Limita o tamanho decodificado por imagem.
// ============================================================
import { LIMITES } from './tipos';

export type MimeImagem = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
export type ImagemDecodificada = { ok: true; blob: Blob; mime: MimeImagem; bytes: number; corrigido?: string } | { ok: false; erro: string };

const PREFIXO = /^data:(image\/(?:png|jpeg|jpg|pjpeg|webp|gif));base64,/i;

/** Detecta o formato pelos primeiros bytes (magic numbers). */
export function detectarTipoImagem(b: Uint8Array): MimeImagem | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export function decodificarImagem(dataUrl: unknown, limiteBytes: number = LIMITES.bytesImagem): ImagemDecodificada {
  if (typeof dataUrl !== 'string') return { ok: false, erro: 'a imagem deve ser um texto "data:image/...;base64,..."' };
  const m = PREFIXO.exec(dataUrl.trimStart());
  if (!m) return { ok: false, erro: /^data:image\/svg/i.test(dataUrl) ? 'SVG não é aceito (pode conter script). Use PNG, JPEG, WebP ou GIF.' : 'formato não aceito: use "data:image/png;base64,...", jpeg, webp ou gif' };
  const declarado = m[1].toLowerCase().replace(/^image\/(jpg|pjpeg)$/, 'image/jpeg') as MimeImagem;
  const corpo = dataUrl.trimStart().slice(m[0].length).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(corpo)) return { ok: false, erro: 'o conteúdo base64 tem caracteres inválidos' };
  if (corpo.length % 4 === 1) return { ok: false, erro: 'o conteúdo base64 está truncado' };
  const estimado = Math.floor((corpo.length * 3) / 4);
  if (estimado > limiteBytes) return { ok: false, erro: `imagem grande demais (${(estimado / 1048576).toFixed(1)} MB; limite ${(limiteBytes / 1048576).toFixed(0)} MB)` };
  let bin: string;
  try { bin = atob(corpo); } catch { return { ok: false, erro: 'não foi possível decodificar o base64' }; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const real = detectarTipoImagem(bytes);
  if (!real) return { ok: false, erro: 'o conteúdo não é uma imagem PNG, JPEG, WebP ou GIF de verdade' };
  return { ok: true, blob: new Blob([bytes], { type: real }), mime: real, bytes: bytes.length, corrigido: real !== declarado ? `tipo declarado ${declarado}, conteúdo real ${real} (corrigido)` : undefined };
}
