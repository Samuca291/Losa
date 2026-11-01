# Lousa Digital de Estudos

Mural infinito com post-its para organizar a matéria do concurso — **Next.js (App Router) + Drizzle**, local-first.

## Armazenamento (três camadas, sem configuração obrigatória)
| Camada | Quando | Onde |
| --- | --- | --- |
| **Navegador (sempre)** | Fonte primária, funciona offline | IndexedDB |
| **Servidor com banco local embutido** | Quando `DATABASE_URL` **não** está definido | PGlite (Postgres em WASM) gravando em `.data/lousa-pglite` |
| **Nuvem (PostgreSQL)** | Quando `DATABASE_URL` está definido | Tabelas `lousas` e `imagens` (`src/db/schema.ts`) |

- Conflitos são resolvidos pelo `alteradoEm` mais recente. Se a API não responder em 4 s, o app segue 100 % local e tenta reconectar a cada minuto (indicador na barra de status mostra *Nuvem*, *Servidor local* ou *Local*).
- Liga/desliga em **Dados → Nuvem**; "Sincronizar agora" força a comparação local × servidor.
- `npx drizzle-kit push` cria as tabelas no PostgreSQL (o servidor também as cria sozinho na primeira chamada a `/api/sync`).

## Conectores inteligentes
- **Âncoras laterais** que deslizam para alinhar (linhas retas quando os itens estão alinhados).
- **Desvio de obstáculos**: a linha contorna post-its no caminho (rota ortogonal com cantos arredondados).
- **Saltos** ("pontes") onde uma linha cruza outra.
- **Itens sobrepostos** ganham um arco-ponte desenhado por cima, em vez de uma linha escondida.
- **Religar** arrastando a ponta de um conector selecionado; **rótulo inline** com duplo clique ou `F2`.
- **Clique-a-clique**: clique na bolinha **+** e depois no destino (ou `L` com um item selecionado).
- Tudo configurável em **Configurações → Conectores**, com pré-visualização ao vivo.

## Interações principais
| Ação | Como |
| --- | --- |
| Criar post-it | **Duplo clique** em qualquer área vazia, `N`, ou colar texto |
| Editar post-it | **Duplo clique** no post-it (Esc ou Ctrl+Enter conclui) |
| Formatar texto | Barra flutuante: cor e realce por trecho, tamanho, sub/sobrescrito, código, títulos, citação, listas, recuo, alinhamento, símbolos, lacunas `{{…}}`, data, maiúsculas |
| Atalhos Markdown | `- `, `1. `, `# `, `> `, `[] ` + espaço |
| Conectar | Arraste ou clique a bolinha **+**; `Alt`+arrastar; `L` |
| Dividir a lousa | Menu **Dividir** (grade, Cornell, mapa mental, polígono livre…) |
| Atalhos | `?` |

## Estrutura
- `src/lousa/` — aplicação (store, componentes, persistência, `nuvem.ts`).
- `src/lousa/utils/conectores.ts` — motor de roteamento das linhas (puro, testável).
- `src/lousa/components/Conectores.tsx` · `BarraFormatacao.tsx` · `PainelConfig.tsx`.
- `src/db/index.ts` — conexão preguiçosa: PostgreSQL → PGlite local → modo só-navegador.
- `src/app/api/` — `sync`, `lousas`, `lousas/[id]`, `imagens/[id]`, `health`.
