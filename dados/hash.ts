// ============================================================
// DADOS · SHA-256 (integridade dos backups)
// Usa a Web Crypto quando disponível (rápida) e cai para uma
// implementação própria em JS (mesmo resultado) em contextos não
// seguros (http://, file://), onde crypto.subtle não existe.
// ============================================================

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Implementação de referência (FIPS 180-4) em JavaScript puro. */
export function sha256JS(msg: Uint8Array): string {
  const l = msg.length; const nBlocos = Math.ceil((l + 9) / 64);
  const buf = new Uint8Array(nBlocos * 64); buf.set(msg); buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 8, Math.floor(l / 0x20000000)); dv.setUint32(buf.length - 4, (l << 3) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      W[i] = (W[i - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + W[i - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32); const dvo = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) dvo.setUint32(i * 4, H[i]);
  return hex(out);
}

/** SHA-256 em hexadecimal de um texto (UTF-8) ou de bytes. */
export async function sha256Hex(entrada: string | Uint8Array): Promise<string> {
  const bytes = typeof entrada === 'string' ? new TextEncoder().encode(entrada) : entrada;
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle?.digest) return hex(new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource)));
  } catch { /* contexto não seguro: segue para a versão em JS */ }
  return sha256JS(bytes);
}

/** Lê os bytes de um Blob (com alternativa para ambientes sem Blob.arrayBuffer). */
export async function bytesDoBlob(b: Blob): Promise<Uint8Array> {
  if (typeof b.arrayBuffer === 'function') return new Uint8Array(await b.arrayBuffer());
  return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(new Uint8Array(r.result as ArrayBuffer)); r.onerror = () => erro(r.error); r.readAsArrayBuffer(b); });
}
