// ============================================================
// TIPOS E CONSTANTES DA LOUSA DIGITAL DE ESTUDOS
// Todo o estado é um objeto JSON serializável. Coordenadas são
// SEMPRE do mundo (lousa), nunca da tela.
// ============================================================

export const VERSAO_FORMATO = 1;

export type Ponto = { x: number; y: number };
export type Retangulo = { x: number; y: number; w: number; h: number };

export type TipoItem =
  | 'postit' | 'texto' | 'titulo' | 'caixa' | 'tarefas' | 'tabela' | 'imagem' | 'link'
  | 'desenho' | 'forma' | 'cloze' | 'contador' | 'fita' | 'pino' | 'carimbo';

export type StatusEstudo = 'nao-visto' | 'estudando' | 'revisar' | 'dominado';

export const ROTULOS_STATUS: Record<StatusEstudo, string> = {
  'nao-visto': 'Não visto',
  estudando: 'Estudando',
  revisar: 'Revisar',
  dominado: 'Dominado',
};

export interface Revisao {
  ativa: boolean;
  indice: number;            // posição na sequência de intervalos
  proxima: number | null;    // timestamp da próxima revisão
  historico: { data: number; acertou: boolean }[];
}

export interface DadosErro {
  disciplina: string;
  assunto: string;
  banca: string;
  ano: string;
  oQueErrei: string;
  motivo: 'nao-sabia' | 'confundi' | 'li-errado' | 'falta-atencao' | 'chute';
  respostaCerta: string;
  fonte: string;
}

export const ROTULOS_MOTIVO: Record<DadosErro['motivo'], string> = {
  'nao-sabia': 'Não sabia',
  confundi: 'Confundi',
  'li-errado': 'Li errado',
  'falta-atencao': 'Falta de atenção',
  chute: 'Chute',
};

export interface Traco {
  pontos: Ponto[];      // relativos ao item (0..w, 0..h)
  cor: string;
  espessura: number;
  marcaTexto: boolean;
}

export interface Item {
  id: string;
  tipo: TipoItem;
  x: number; y: number; w: number; h: number;
  angulo: number;
  z: number;
  camada: string;
  regiao: string | null;
  grupo: string | null;
  travado: boolean;
  oculto: boolean;
  fixado: boolean;
  criadoEm: number;
  alteradoEm: number;
  // Aparência
  cor: string;
  corTexto?: string;
  fonte: string;
  tamanhoFonte: number;
  autoAjuste: boolean;
  // Estudo / metadados
  titulo: string;
  etiquetas: string[];
  status: StatusEstudo;
  revisao: Revisao;
  modelo?: string;
  erro?: DadosErro;
  // Conteúdo por tipo
  html: string;                       // conteúdo principal (HTML sanitizado)
  verso?: string;                     // verso do cartão (frente e verso)
  virado?: boolean;
  tarefas?: { texto: string; feito: boolean }[];
  tabela?: string[][];
  imagemId?: string;
  opacidade?: number;
  recorte?: Retangulo;                // normalizado 0..1
  url?: string;
  tracos?: Traco[];
  forma?: string;
  valor?: number;
  carimbo?: string;
}

export type EstiloConector = 'reto' | 'curvo' | 'angulo';
export interface Conector {
  id: string;
  de: string;
  para: string;
  estilo: EstiloConector;
  tracejado: boolean;
  rotulo: string;
  setaInicio: boolean;
  setaFim: boolean;
  cor: string;
  espessura: number;
  camada: string;
}

export interface EstiloRegiao {
  cor: string;
  opacidade: number;
  corBorda: string;
  espessuraBorda: number;
  estiloBorda: 'solida' | 'tracejada' | 'pontilhada' | 'dupla';
  raio: number;
  icone: string;
  padrao: 'nenhum' | 'listras' | 'pontos' | 'grade';
  rotuloAngulo: number;
  numerar: boolean;
  mostrarTitulo: boolean;
}

export interface Regiao {
  id: string;
  nome: string;
  pai: string | null;
  filhos: string[];
  bbox: Retangulo;             // caixa no mundo
  pontos: Ponto[] | null;      // polígono no mundo; null = retângulo bbox
  layout: { direcao: 'h' | 'v'; proporcoes: number[] } | null;
  metodo: string;
  estilo: EstiloRegiao;
  recolhida: boolean;
  oculta: boolean;
  travada: boolean;
  ima: boolean;
  itensAcompanham: boolean;
  criadoEm: number;
  ordem?: number;
}

export interface Camada {
  id: string;
  nome: string;
  visivel: boolean;
  travada: boolean;
  opacidade: number;
}

export interface Doc {
  itens: Record<string, Item>;
  conectores: Record<string, Conector>;
  regioes: Record<string, Regiao>;
  camadas: Camada[];
}

export interface Camera { x: number; y: number; zoom: number }

export type ModoVisualizacao = 'tudo' | 'so-lousa' | 'lousa-anotacoes' | 'lousa-postits';

export interface Filtro {
  cor: string | null;
  etiqueta: string | null;
  regiao: string | null;
  status: StatusEstudo | null;
  texto: string;
  esmaecer: boolean;
}

export interface Visualizacao {
  modo: ModoVisualizacao;
  ocultarTudo: boolean;
  modoFoco: boolean;
  modoProva: boolean;
  tiposOcultos: TipoItem[];
  mostrarConectores: boolean;
  mostrarRegioes: boolean;
  mostrarRotulos: boolean;
  esmaecerOcultos: boolean;
  opacidadeEsmaecer: number;
  filtro: Filtro;
  destacarTipo: TipoItem | null;
  minimapa: boolean;
  legenda: boolean;
  reguas: boolean;
}

export interface VisaoSalva { id: string; nome: string; visualizacao: Visualizacao; camera: Camera }

export interface Config {
  fundo: 'liso' | 'quadriculado' | 'pontilhado' | 'pautado';
  corFundo: string;
  intensidadeFundo: number;
  grade: boolean;
  tamanhoGrade: number;
  guiasInteligentes: boolean;
  anguloAleatorio: boolean;
  itensAcompanhamRegiao: boolean;
  tema: 'claro' | 'escuro' | 'contraste';
  escalaInterface: number;
  animacoes: boolean;
  corretorOrtografico: boolean;
  coresFavoritas: string[];
  fontePadrao: string;
  // --- Novos (v2) ---
  sincronizarNuvem: boolean;          // espelhar no banco quando a API responder
  duploCliqueCria: boolean;           // duplo clique no fundo cria post-it
  portasConexao: boolean;             // mostrar pontos de conexão no item selecionado/sob o mouse
  tamanhoPostit: 'pequeno' | 'medio' | 'grande';
  estiloConector: EstiloConector;
  corConector: string;
  setaConector: boolean;
  autoAjusteAltura: boolean;          // novos post-its crescem com o texto
  zoomSuave: boolean;                 // animar zoom/enquadramento
  temaAuto: boolean;                  // seguir o sistema (claro/escuro)
  // --- Conectores inteligentes (v3) ---
  desviarObstaculos: boolean;         // a linha contorna outros post-its
  saltosLinha: boolean;               // "pontes" onde uma linha cruza outra
  conectoresAcima: boolean;           // desenhar as linhas por cima dos itens
  raioCanto: number;                  // arredondamento dos cantos das rotas
  margemDesvio: number;               // distância mínima da linha até um item
  rotulosConector: boolean;           // mostrar rótulos das linhas
  // --- Edição de texto (v3) ---
  atalhosMarkdown: boolean;           // "- ", "1. ", "# " viram lista/título ao digitar
  sombraPostit: boolean;              // sombra de papel nos post-its
}

export interface Estudo {
  intervalos: number[];       // em dias
  metaDiaria: number;
  revisadosHoje: { dia: string; quantidade: number };
  sequenciaDias: number;
  ultimoDiaMeta: string;
  intercalar: boolean;
  dataProva: string | null;
  nomeProva: string;
  pomodoroFoco: number;
  pomodoroPausa: number;
}

export interface TopicoEdital {
  id: string;
  disciplina: string;
  topico: string;
  status: StatusEstudo;
  dominio: number; // 0..100
}

export interface RegistroQuestoes {
  id: string;
  data: number;
  disciplina: string;
  assunto: string;
  acertos: number;
  total: number;
}

export interface Legenda { cor: string; significado: string }

export interface ModeloDivisaoSalvo { id: string; nome: string; spec: unknown }

export interface Lousa {
  versao: number;
  id: string;
  nome: string;
  doc: Doc;
  camera: Camera;
  config: Config;
  visualizacao: Visualizacao;
  visoesSalvas: VisaoSalva[];
  lixeira: { item: Item; excluidoEm: number }[];
  estudo: Estudo;
  edital: TopicoEdital[];
  questoes: RegistroQuestoes[];
  legenda: Legenda[];
  modelosDivisao: ModeloDivisaoSalvo[];
  arquivada: boolean;
  criadoEm: number;
  alteradoEm: number;
}

// ---------- Paleta de post-its (variáveis CSS em index.css) ----------
export const PALETA: { nome: string; cor: string }[] = [
  { nome: 'Amarelo', cor: '#fff176' },
  { nome: 'Rosa', cor: '#f8bbd0' },
  { nome: 'Azul', cor: '#90caf9' },
  { nome: 'Verde', cor: '#a5d6a7' },
  { nome: 'Laranja', cor: '#ffcc80' },
  { nome: 'Roxo', cor: '#ce93d8' },
  { nome: 'Vermelho', cor: '#ef9a9a' },
  { nome: 'Turquesa', cor: '#80deea' },
  { nome: 'Cinza', cor: '#cfd8dc' },
  { nome: 'Branco', cor: '#ffffff' },
  { nome: 'Lima', cor: '#e6ee9c' },
  { nome: 'Pêssego', cor: '#ffab91' },
  { nome: 'Lavanda', cor: '#d1c4e9' },
  { nome: 'Menta', cor: '#b2dfdb' },
  { nome: 'Preto', cor: '#37474f' },
];

export const CORES_REGIAO = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635', '#c084fc', '#38bdf8', '#facc15'];

export const FONTES: { nome: string; css: string }[] = [
  { nome: 'Padrão', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { nome: 'Manuscrita', css: '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive' },
  { nome: 'Serifada', css: 'Georgia, "Times New Roman", serif' },
  { nome: 'Mono', css: 'ui-monospace, "Cascadia Code", Consolas, monospace' },
  { nome: 'Condensada', css: '"Arial Narrow", "Roboto Condensed", sans-serif' },
];

export const TAMANHOS_POSTIT: Record<string, { w: number; h: number }> = {
  pequeno: { w: 140, h: 140 },
  medio: { w: 200, h: 200 },
  grande: { w: 300, h: 260 },
};

export interface ModeloPostit {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  titulo: string;
  html: string;
  etiquetas: string[];
  verso?: string;
  tipo?: TipoItem;
}

export const MODELOS_POSTIT: ModeloPostit[] = [
  { id: 'conceito', nome: 'Conceito', icone: '💡', cor: '#fff176', titulo: 'Conceito', html: '<b>Conceito:</b> <br><br><b>Palavras-chave:</b> ', etiquetas: ['conceito'] },
  { id: 'prazo', nome: 'Prazo', icone: '⏱️', cor: '#ffcc80', titulo: 'Prazo', html: '<b>Prazo:</b> ___ dias<br><b>Conta-se:</b> <br><b>Base legal:</b> art. ', etiquetas: ['prazo'] },
  { id: 'excecao', nome: 'Exceção', icone: '⚠️', cor: '#ef9a9a', titulo: 'Exceção', html: '<b>Regra:</b> <br><b>EXCETO:</b> <br><b>Fundamento:</b> ', etiquetas: ['exceção'] },
  { id: 'sumula', nome: 'Súmula / Jurisprudência', icone: '⚖️', cor: '#d1c4e9', titulo: 'Súmula', html: '<b>Súmula nº</b> ___ (STF/STJ)<br><b>Enunciado:</b> <br><b>Observação:</b> ', etiquetas: ['jurisprudência'] },
  { id: 'artigo', nome: 'Artigo de lei', icone: '📜', cor: '#b2dfdb', titulo: 'Art.', html: '<b>Art. ___ da Lei ___</b><br>"..."<br><b>Palavras que caem:</b> ', etiquetas: ['lei'] },
  { id: 'pegadinha', nome: 'Pegadinha da banca', icone: '🪤', cor: '#f8bbd0', titulo: 'Pegadinha', html: '<b>Banca:</b> <br><b>Como a banca confunde:</b> <br><b>O certo é:</b> ', etiquetas: ['pegadinha'] },
  { id: 'mnemonico', nome: 'Mnemônico', icone: '🧠', cor: '#ce93d8', titulo: 'Mnemônico', html: '<b>Sigla:</b> <br><b>Significa:</b> <br>', etiquetas: ['mnemônico'] },
  { id: 'formula', nome: 'Fórmula', icone: '🧮', cor: '#90caf9', titulo: 'Fórmula', html: '<b>Fórmula:</b> <br><b>Onde:</b> <br><b>Exemplo:</b> ', etiquetas: ['fórmula'] },
  { id: 'data', nome: 'Data', icone: '📅', cor: '#e6ee9c', titulo: 'Data', html: '<b>Data:</b> <br><b>Fato:</b> <br><b>Por que importa:</b> ', etiquetas: ['data'] },
  { id: 'pergunta', nome: 'Pergunta e resposta', icone: '❓', cor: '#80deea', titulo: 'Pergunta', html: 'Pergunta: ', verso: 'Resposta: ', etiquetas: ['flashcard'] },
  { id: 'erro', nome: 'Erro de questão', icone: '❌', cor: '#ffab91', titulo: 'Erro de questão', html: '<b>Questão:</b> <br><b>O que errei:</b> <br><b>Por que errei:</b> <br><b>Resposta certa:</b> <br><b>Base legal:</b> ', etiquetas: ['erro'] },
  { id: 'duvida', nome: 'Dúvida para o professor', icone: '🙋', cor: '#a5d6a7', titulo: 'Dúvida', html: '<b>Dúvida:</b> <br><b>Contexto:</b> <br><b>Resposta:</b> ', etiquetas: ['dúvida'] },
];

export const LIMITES_ZOOM = { min: 0.05, max: 8 };
export const PASSOS_ZOOM = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];
export const ZOOM_SEMANTICO = 0.4;
export const DIAS_LIXEIRA = 30;
