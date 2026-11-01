// ============================================================
// ÍCONES SVG (traço 1.8, 24x24) — consistentes em todos os sistemas.
// ============================================================
import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({ width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p });

export const IcSelecionar = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 3l14 8-6.5 1.5L10 19z" /></svg>;
export const IcMao = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11V4.5a1.5 1.5 0 013 0V12M14 11.5V6.5a1.5 1.5 0 013 0V13M17 12.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1.5a6 6 0 01-4.8-2.4L3.4 15.5a1.6 1.6 0 012.5-2L8 15.5" /></svg>;
export const IcPostit = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 4h14a1 1 0 011 1v9l-5 5H5a1 1 0 01-1-1V5a1 1 0 011-1z" /><path d="M15 19v-4a1 1 0 011-1h4" /><path d="M8 9h8M8 12.5h5" /></svg>;
export const IcTexto = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></svg>;
export const IcLapis = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z" /><path d="M13.5 7.5l3 3" /></svg>;
export const IcMarcador = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 11l-6 6 3 3 6-6M9 11l7.5-7.5a2 2 0 013 3L12 14M9 11l3 3M3 21h7" /></svg>;
export const IcBorracha = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M7 21h10M4.5 15.5l9-9a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8l-7 7H8.3l-3.8-3.8a1 1 0 010-1.4z" /><path d="M9 11l4 4" /></svg>;
export const IcConector = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="5" cy="18" r="2.2" /><circle cx="19" cy="6" r="2.2" /><path d="M6.6 16.4C9 13 12 11 17.4 7.6" /><path d="M14 7h3.8V10.8" /></svg>;
export const IcForma = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="3" width="9" height="9" rx="1.5" /><circle cx="16.5" cy="16.5" r="4.5" /></svg>;
export const IcRegiao = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" strokeDasharray="3 2.5" /><path d="M3 10h18M11 10v10" /></svg>;
export const IcDesfazer = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>;
export const IcRefazer = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></svg>;
export const IcBusca = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></svg>;
export const IcMais = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const IcMenos = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12h14" /></svg>;
export const IcEnquadrar = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>;
export const IcOlho = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IcOlhoFechado = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 3l18 18M10.6 10.6A3 3 0 0013.4 13.4M6.5 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1M9.5 5.8A9 9 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-2.7 3.4" /></svg>;
export const IcEstudo = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M2.5 9L12 4.5 21.5 9 12 13.5z" /><path d="M6 11.2V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.8M21.5 9v5" /></svg>;
export const IcProp = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>;
export const IcCamadas = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3.5l9 4.5-9 4.5L3 8z" /><path d="M3 12.5l9 4.5 9-4.5M3 16.5L12 21l9-4.5" /></svg>;
export const IcDados = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
export const IcConfig = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
export const IcExportar = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 15V4M8 8l4-4 4 4" /><path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" /></svg>;
export const IcRegioes = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h18M12 3v9M12 12v9" /></svg>;
export const IcComando = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 17l6-5-6-5M12 19h8" /></svg>;
export const IcAjuda = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17h.01" /></svg>;
export const IcNuvem = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0118 9.5a4 4 0 01-.5 8.5H7z" /></svg>;
export const IcNuvemOff = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 3l18 18M9.5 18H7a4.5 4.5 0 01-1.7-8.7M18 18l-.5-.01M11 6.2A6 6 0 0118 9.5a4 4 0 012.6 6.6" /></svg>;
export const IcCheck = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IcFechar = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IcLousas = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4M7 9h5M7 12h8" /></svg>;
export const IcDividir = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M9 12h12" /></svg>;
export const IcInserir = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></svg>;
export const IcModelos = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 3v3h6V3M8 11h8M8 15h5" /></svg>;
export const IcSol = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>;
export const IcLua = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></svg>;
export const IcSync = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M20 11A8 8 0 006 6.3M4 13a8 8 0 0014 4.7" /><path d="M20 4v7h-7M4 20v-7h7" /></svg>;
export const IcLink = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>;
export const IcFoco = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>;
