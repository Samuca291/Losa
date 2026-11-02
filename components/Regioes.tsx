// ============================================================
// REGIÕES: camada SVG (formas) + rótulos HTML + divisórias.
// ============================================================
import { memo, useMemo } from 'react';
import type { Regiao } from '../types';
import { caminhoSvg, poligonoDoRetangulo, centroidePoligono } from '../utils/geometria';
import { arrastarDivisoria, atualizarRegiao, profundidadeRegiao, setUI } from '../store';

interface Props {
  regioes: Record<string, Regiao>; selecionada: string | null; isolada: string | null; zoom: number; mostrarRotulos: boolean;
  contagens: Record<string, number>; mostrar: boolean; ocultarTudo: boolean;
}

const dash = (e: Regiao['estilo']['estiloBorda'], esp: number) => (e === 'tracejada' ? `${esp * 4} ${esp * 3}` : e === 'pontilhada' ? `${esp} ${esp * 2}` : undefined);

export const Regioes = memo(function Regioes({ regioes, selecionada, isolada, zoom, mostrarRotulos, contagens, mostrar, ocultarTudo }: Props) {
  const lista = useMemo(() => Object.values(regioes).map((r) => ({ r, prof: profundidadeRegiao(r.id, regioes) })).sort((a, b) => a.prof - b.prof || (a.r.ordem ?? 0) - (b.r.ordem ?? 0)), [regioes]);
  const ocultasPorAncestral = useMemo(() => { const s = new Set<string>(); const marca = (id: string) => { s.add(id); for (const f of regioes[id]?.filhos ?? []) marca(f); }; for (const r of Object.values(regioes)) if (r.oculta || r.recolhida) for (const f of r.filhos) marca(f); return s; }, [regioes]);
  if (!mostrar) return null;
  const inv = 1 / zoom;
  const isoladaSet = isolada ? new Set<string>((() => { const out: string[] = []; const pilha = [isolada]; while (pilha.length) { const a = pilha.pop()!; out.push(a); pilha.push(...(regioes[a]?.filhos ?? [])); } return out; })()) : null;
  const visiveis = lista.filter(({ r }) => !r.oculta && !ocultasPorAncestral.has(r.id));
  return (
    <>
      <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1} style={{ pointerEvents: 'none' }} aria-hidden="true">
        <defs>
          <pattern id="padrao-listras" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="12" fill="rgba(0,0,0,0.07)" /></pattern>
          <pattern id="padrao-pontos" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="1.5" fill="rgba(0,0,0,0.18)" /></pattern>
          <pattern id="padrao-grade" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="rgba(0,0,0,0.1)" /></pattern>
        </defs>
        {visiveis.map(({ r }) => {
          const recolhida = r.recolhida; const poly = recolhida ? poligonoDoRetangulo({ ...r.bbox, h: Math.min(r.bbox.h, 40 * inv) }) : r.pontos ?? null;
          const d = poly ? caminhoSvg(poly) : undefined; const esm = isoladaSet && !isoladaSet.has(r.id);
          const sel = selecionada === r.id; const esp = r.estilo.espessuraBorda * (sel ? 1.6 : 1);
          const comum = { fill: r.estilo.cor, fillOpacity: esm ? 0.04 : r.estilo.opacidade, stroke: sel ? 'var(--selecao)' : r.estilo.corBorda, strokeWidth: esp, strokeDasharray: dash(r.estilo.estiloBorda, esp), strokeOpacity: esm ? 0.2 : 0.9, style: { pointerEvents: 'none' as const } };
          return (
            <g key={r.id} data-regiao-forma={r.id}>
              {d ? <path d={d} {...comum} /> : <rect x={r.bbox.x} y={r.bbox.y} width={r.bbox.w} height={r.bbox.h} rx={r.estilo.raio} {...comum} />}
              {r.estilo.estiloBorda === 'dupla' && (d ? <path d={d} fill="none" stroke={r.estilo.corBorda} strokeWidth={esp} style={{ transform: 'translate(3px,3px)' }} /> : <rect x={r.bbox.x + 4} y={r.bbox.y + 4} width={r.bbox.w - 8} height={r.bbox.h - 8} rx={r.estilo.raio} fill="none" stroke={r.estilo.corBorda} strokeWidth={esp} />)}
              {r.estilo.padrao !== 'nenhum' && !esm && (d ? <path d={d} fill={`url(#padrao-${r.estilo.padrao})`} stroke="none" /> : <rect x={r.bbox.x} y={r.bbox.y} width={r.bbox.w} height={r.bbox.h} rx={r.estilo.raio} fill={`url(#padrao-${r.estilo.padrao})`} stroke="none" />)}
            </g>
          );
        })}
      </svg>
      {/* Rótulos e divisórias (HTML) */}
      {visiveis.map(({ r, prof }) => {
        const esm = isoladaSet && !isoladaSet.has(r.id); if (esm) return null;
        const centroPoly = r.pontos && !r.layout ? centroidePoligono(r.pontos) : null;
        // Rótulo: região-raiz com filhos fica como cabeçalho acima da caixa; filhos descem conforme a profundidade para não se sobrepor
        const temFilhos = r.filhos.length > 0 && !r.recolhida;
        const yRotulo = prof === 0 && temFilhos ? r.bbox.y - 34 * inv : r.bbox.y + 8 * inv + 28 * inv * Math.max(0, prof - 1);
        const pos = centroPoly ? { x: centroPoly.x, y: r.bbox.y + 8 * inv > centroPoly.y - 12 * inv ? centroPoly.y : r.bbox.y + 10 * inv } : { x: r.bbox.x + 8 * inv, y: yRotulo };
        const dentro = r.pontos && !centroPoly ? false : !!centroPoly;
        const n = contagens[r.id] ?? 0; const numero = r.estilo.numerar && r.pai ? `${(regioes[r.pai]?.filhos.indexOf(r.id) ?? 0) + 1}. ` : '';
        return (
          <div key={r.id} data-nao-exportar={ocultarTudo ? '1' : undefined}>
            {mostrarRotulos && r.estilo.mostrarTitulo && (
              <div className={`rotulo-regiao ${selecionada === r.id ? 'selecionada' : ''}`} data-regiao-id={r.id} role="button" tabIndex={0} aria-label={`Região ${r.nome}, ${n} itens${r.travada ? ', travada' : ''}`}
                style={{ transform: `translate(${pos.x}px, ${pos.y}px) ${dentro ? 'translate(-50%, 0)' : ''} rotate(${r.estilo.rotuloAngulo}deg) scale(${Math.min(inv, 3)})`, transformOrigin: dentro ? '50% 0' : '0 0', fontSize: prof === 0 ? 15 : 13, opacity: 0.95 }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setUI({ regiaoSelecionada: r.id, painel: 'regioes' }); } }}>
                <button type="button" data-interativo="1" className="opacity-60 hover:opacity-100" aria-label={r.recolhida ? 'Expandir região' : 'Recolher região'} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); atualizarRegiao(r.id, { recolhida: !r.recolhida }); }}>{r.recolhida ? '▸' : '▾'}</button>
                {r.estilo.icone && <span aria-hidden="true">{r.estilo.icone}</span>}
                <span>{numero}{r.nome}</span>
                <span className="contagem" aria-hidden="true">{n}</span>
                {r.travada && <span aria-hidden="true" title="Travada">🔒</span>}
                {r.ima && <span aria-hidden="true" title="Ímã ligado">🧲</span>}
              </div>
            )}
            {/* Divisórias arrastáveis */}
            {!r.recolhida && r.layout && r.filhos.length > 1 && r.filhos.slice(0, -1).map((_, i) => {
              const acc = r.layout!.proporcoes.slice(0, i + 1).reduce((a, b) => a + b, 0); const g = 10 * inv;
              const estilo = r.layout!.direcao === 'h' ? { left: r.bbox.x + r.bbox.w * acc - g / 2, top: r.bbox.y, width: g, height: r.bbox.h } : { left: r.bbox.x, top: r.bbox.y + r.bbox.h * acc - g / 2, width: r.bbox.w, height: g };
              return <div key={i} className={`divisoria ${r.layout!.direcao}`} data-divisoria={`${r.id}:${i}`} style={estilo} role="separator" tabIndex={0} aria-label={`Divisória ${i + 1} de ${r.nome}. Use as setas para mover.`} aria-orientation={r.layout!.direcao === 'h' ? 'vertical' : 'horizontal'}
                onKeyDown={(e) => { const passo = e.shiftKey ? 40 : 10; const base = r.layout!.direcao === 'h' ? r.bbox.x + r.bbox.w * acc : r.bbox.y + r.bbox.h * acc; if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); arrastarDivisoria(r.id, i, base - passo); } if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); arrastarDivisoria(r.id, i, base + passo); } }} />;
            })}
            {selecionada === r.id && !r.pai && !r.travada && <div className="alca-regiao" data-alca-regiao={r.id} style={{ left: r.bbox.x + r.bbox.w, top: r.bbox.y + r.bbox.h }} role="button" aria-label="Redimensionar região" tabIndex={-1} />}
          </div>
        );
      })}
    </>
  );
});
