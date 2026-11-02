// ============================================================
// CONECTORES (SVG): desenha as rotas calculadas em utils/conectores.
// Duas camadas: "baixo" (sob os itens) e "cima" (itens sobrepostos,
// rascunho e, se configurado, todos). Setas são polígonos explícitos
// (funcionam com saltos, cores e espessuras), rótulos têm fundo
// legível e as pontas viram alças para religar a outro item.
// ============================================================
import { memo } from 'react';
import type { Conector, Ponto } from '../types';
import { encurtar, pathComSaltos, pathSimples, seta, type Rota, type Salto } from '../utils/conectores';
import { clamp } from '../utils/geometria';

export interface Rascunho { pontos: Ponto[]; alvo: boolean; cor?: string }

interface Props {
  conectores: Record<string, Conector>;
  rotas: Map<string, Rota>;
  saltos: Map<string, Salto[]>;
  camada: 'baixo' | 'cima';
  conectoresAcima: boolean;
  selecionado: string | null;
  sobMouse: string | null;
  recem: string | null;
  destacados: Set<string> | null;      // ids de itens cujas conexões estão em destaque
  opacidadeCamada: (id: string) => number;
  inv: number;                         // 1 / zoom
  mostrarRotulos: boolean;
  rascunho: Rascunho | null;
  reconectando: { id: string; extremo: 'de' | 'para' } | null;
  zoomBaixo: boolean;
}

export const Conectores = memo(function Conectores(p: Props) {
  const { conectores, rotas, saltos, camada, conectoresAcima, selecionado, sobMouse, recem, destacados, opacidadeCamada, inv, mostrarRotulos, rascunho, reconectando, zoomBaixo } = p;
  const escRotulo = clamp(inv, 1, 2.6);
  const lista = Object.values(conectores).filter((c) => { const r = rotas.get(c.id); if (!r) return false; const acima = r.sobreposto || conectoresAcima; return camada === 'cima' ? acima : !acima; });
  if (!lista.length && !(camada === 'cima' && rascunho)) return null;
  return (
    <svg className={`conectores conectores-${camada}`} width={1} height={1} aria-hidden="true">
      {lista.map((c) => {
        const r = rotas.get(c.id)!;
        const sel = selecionado === c.id; const hover = sobMouse === c.id;
        const esmaecido = destacados ? !(destacados.has(c.de) && destacados.has(c.para)) : false;
        const esp = c.espessura; const tamSeta = Math.max(9, esp * 4.2);
        const pontos = reconectando?.id === c.id ? r.pontos : encurtar(r.pontos, c.setaFim ? tamSeta * 0.75 : 0, c.setaInicio ? tamSeta * 0.75 : 0);
        const d = pathComSaltos(pontos, saltos.get(c.id), Math.max(5, esp * 2.6));
        const cor = sel ? 'var(--selecao)' : c.cor;
        const classes = ['conector-g', sel ? 'selecionado' : '', hover ? 'sob-mouse' : '', recem === c.id && !c.tracejado ? 'conector-nova' : '', r.sobreposto ? 'sobreposto' : '', reconectando?.id === c.id ? 'religando' : ''].join(' ');
        const rot = c.rotulo && mostrarRotulos && !zoomBaixo ? c.rotulo.slice(0, 60) : '';
        const wRot = rot ? rot.length * 6.4 * escRotulo + 14 * escRotulo : 0, hRot = 19 * escRotulo;
        return (
          <g key={c.id} className={classes} data-conector-id={c.id} opacity={esmaecido ? 0.12 : opacidadeCamada(c.camada)}>
            {/* área de clique generosa */}
            <path d={d} className="conector-hit" stroke="transparent" strokeWidth={Math.max(16, 16 * inv)} fill="none" data-conector-id={c.id} />
            {/* halo (legibilidade sobre fundos e outros itens) */}
            {(r.sobreposto || conectoresAcima || sel || hover) && <path d={d} className="conector-halo" fill="none" strokeWidth={esp + 4} />}
            <path d={d} className="conector-linha" pathLength={1} stroke={cor} strokeWidth={esp} strokeDasharray={c.tracejado ? `${(esp * 4) / Math.max(1, r.comprimento)} ${(esp * 3) / Math.max(1, r.comprimento)}` : undefined} data-conector-id={c.id} fill="none" />
            {c.setaFim && <path d={seta(r.pontos, tamSeta)} fill={cor} stroke="none" className="conector-seta" />}
            {c.setaInicio && <path d={seta(r.pontos, tamSeta, true)} fill={cor} stroke="none" className="conector-seta" />}
            {rot && (
              <g transform={`translate(${r.meio.x} ${r.meio.y})`} className="conector-rotulo-g" data-conector-id={c.id}>
                <rect x={-wRot / 2} y={-hRot / 2} width={wRot} height={hRot} rx={hRot / 2} className="conector-rotulo-fundo" stroke={cor} strokeWidth={Math.min(1.2 * escRotulo, 2)} />
                <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={12 * escRotulo} className="conector-rotulo" fill={sel ? 'var(--selecao)' : c.cor}>{rot}</text>
              </g>
            )}
            {sel && !reconectando && (
              <>
                <circle cx={r.pontos[0].x} cy={r.pontos[0].y} r={7 * inv} className="extremo-conector" data-extremo="de" data-conector-id={c.id} strokeWidth={2 * inv}><title>Arraste para religar a origem a outro item</title></circle>
                <circle cx={r.pontos[r.pontos.length - 1].x} cy={r.pontos[r.pontos.length - 1].y} r={7 * inv} className="extremo-conector" data-extremo="para" data-conector-id={c.id} strokeWidth={2 * inv}><title>Arraste para religar o destino a outro item</title></circle>
              </>
            )}
          </g>
        );
      })}
      {camada === 'cima' && rascunho && rascunho.pontos.length > 1 && (
        <g className="conector-rascunho">
          <path d={pathSimples(rascunho.pontos)} fill="none" stroke={rascunho.cor ?? 'var(--selecao)'} strokeWidth={2.5 * inv} strokeDasharray={`${7 * inv} ${5 * inv}`} strokeLinecap="round" />
          <path d={seta(rascunho.pontos, 11 * inv)} fill={rascunho.cor ?? 'var(--selecao)'} />
          <circle cx={rascunho.pontos[rascunho.pontos.length - 1].x} cy={rascunho.pontos[rascunho.pontos.length - 1].y} r={(rascunho.alvo ? 8 : 5) * inv} fill={rascunho.alvo ? 'var(--selecao)' : '#fff'} stroke="var(--selecao)" strokeWidth={2 * inv} />
        </g>
      )}
    </svg>
  );
});
