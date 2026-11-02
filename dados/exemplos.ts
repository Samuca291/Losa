// ============================================================
// DADOS · EXEMPLOS DO GUIA DO JSON
// Escritos como objetos (JSON válido por construção) e TESTADOS:
// a suíte importa cada exemplo e exige zero erros e zero avisos.
// ============================================================

/** PNG 1×1 transparente, usado nos exemplos de imagem embutida. */
export const PNG_MINIMO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export interface ExemploJSON { id: string; titulo: string; icone: string; descricao: string; valor: unknown }

export const EXEMPLOS: ExemploJSON[] = [
  {
    id: 'esqueleto', icone: '🏗️', titulo: 'Esqueleto com todos os blocos', descricao: 'Modelo para copiar e adaptar: configuração, camadas, região, itens, conector, edital, questões e legenda.',
    valor: {
      formato: 'lousa-estudos/autoria', nome: 'Nome da lousa',
      config: { tema: 'claro' }, visualizacao: { minimapa: true }, estudo: { metaDiaria: 10 },
      camadas: ['Leis'], regioes: [{ nome: 'Área 1', x: 0, y: 0, w: 900, h: 600 }],
      itens: [{ id: 'a', texto: 'Primeiro item', regiao: 'Área 1' }, { id: 'b', texto: 'Segundo item', regiao: 'Área 1', camada: 'Leis' }],
      conectores: [{ de: 'a', para: 'b', rotulo: 'leva a' }],
      edital: { 'Português': ['Crase'] }, questoes: [{ data: '2026-03-01', disciplina: 'Português', assunto: 'Crase', acertos: 7, total: 10 }],
      legenda: { amarelo: 'Conceito' },
    },
  },
  {
    id: 'minimo', icone: '🌱', titulo: 'O menor JSON possível', descricao: 'Um único post-it. Sem id, sem posição, sem cor: tudo recebe um padrão sensato.',
    valor: { nome: 'Meu primeiro JSON', itens: [{ texto: 'Olá, lousa! Este post-it veio de um arquivo JSON.' }] },
  },
  {
    id: 'lista', icone: '📋', titulo: 'Lista de textos', descricao: 'Um array de textos vira um post-it por linha, organizados em grade.',
    valor: ['Princípio da legalidade', 'Princípio da impessoalidade', 'Princípio da moralidade', 'Princípio da publicidade', 'Princípio da eficiência'],
  },
  {
    id: 'flashcards', icone: '🃏', titulo: 'Flashcards com revisão espaçada', descricao: 'Frente e verso, etiquetas, status e revisão ativada com "revisao": true.',
    valor: {
      nome: 'Constitucional — flashcards',
      itens: [
        { frente: 'Quais são os remédios constitucionais?', verso: 'HC, HD, MS, MI, ação popular e ação civil pública (esta última não é remédio em sentido estrito).', cor: 'azul', etiquetas: ['constitucional', 'remédios'], revisao: true },
        { frente: 'Prazo do mandado de segurança', verso: '120 dias da ciência do ato impugnado (Lei 12.016/2009, art. 23).', cor: 'laranja', etiquetas: 'constitucional, prazo', revisao: true },
        { titulo: 'Súmula Vinculante 13', frente: 'O que a SV 13 proíbe?', versoTexto: 'Nepotismo: nomear cônjuge, companheiro ou parente até o 3º grau\npara cargo em comissão ou função gratificada.', cor: 'lavanda', status: 'Estudando' },
      ],
    },
  },
  {
    id: 'mapa', icone: '🧠', titulo: 'Mapa mental com conectores', descricao: 'Ids escolhidos por você ligam os itens. Conectores aceitam objeto ou a forma curta ["de", "para", "rótulo"].',
    valor: {
      nome: 'Atos administrativos',
      itens: [
        { id: 'centro', tipo: 'titulo', texto: 'Atos administrativos', x: 380, y: 260 },
        { id: 'comp', texto: 'Competência', cor: 'verde', x: 80, y: 60 },
        { id: 'fin', texto: 'Finalidade', cor: 'verde', x: 360, y: 20 },
        { id: 'forma', texto: 'Forma', cor: 'verde', x: 660, y: 60 },
        { id: 'motivo', texto: 'Motivo', cor: 'amarelo', x: 160, y: 440 },
        { id: 'objeto', texto: 'Objeto', cor: 'amarelo', x: 560, y: 440 },
      ],
      conectores: [
        { de: 'centro', para: 'comp', rotulo: 'vinculado' },
        { de: 'centro', para: 'fin', rotulo: 'vinculado' },
        { de: 'centro', para: 'forma', rotulo: 'vinculado' },
        ['centro', 'motivo', 'discricionário'],
        { de: 'centro', para: 'objeto', rotulo: 'discricionário', tracejado: true, cor: '#dc2626' },
      ],
    },
  },
  {
    id: 'kanban', icone: '📌', titulo: 'Quadro Kanban com divisão automática', descricao: '"divisao": "kanban" cria as 4 colunas; os itens entram na coluna pelo NOME e são posicionados sozinhos.',
    valor: {
      nome: 'Plano da semana',
      regioes: [{ id: 'quadro', nome: 'Quadro', x: 0, y: 0, w: 1200, h: 700, divisao: 'kanban' }],
      itens: [
        { texto: 'Crase', regiao: 'A estudar' },
        { texto: 'Concordância verbal', regiao: 'A estudar', cor: 'rosa' },
        { texto: 'Licitações — Lei 14.133', regiao: 'Estudando', cor: 'azul' },
        { texto: 'Direitos fundamentais', regiao: 'Quadro / Revisar', cor: 'laranja' },
        { texto: 'Atos administrativos', regiao: 'Dominado', cor: 'verde', status: 'dominado' },
      ],
    },
  },
  {
    id: 'regioes', icone: '🗂️', titulo: 'Regiões aninhadas, camadas e estilo', descricao: 'Filhas declaradas dentro da mãe são distribuídas sozinhas; camadas novas são criadas por nome.',
    valor: {
      nome: 'Direito Administrativo',
      camadas: [{ nome: 'Leis', visivel: true }, 'Jurisprudência'],
      regioes: [{
        nome: 'Administrativo', x: 0, y: 0, w: 1100, h: 640, cor: 'azul', estilo: { estiloBorda: 'tracejada', icone: '⚖️' },
        filhos: [{ nome: 'Princípios', cor: 'verde' }, { nome: 'Poderes', cor: 'amarelo' }, { nome: 'Atos', cor: 'rosa' }],
      }],
      itens: [
        { texto: 'LIMPE: legalidade, impessoalidade, moralidade, publicidade, eficiência', regiao: 'Princípios', camada: 'Leis' },
        { texto: 'Poder de polícia: atributos DAC (discricionariedade, autoexecutoriedade, coercibilidade)', regiao: 'Administrativo / Poderes' },
        { texto: 'STF: a anulação de ato que gera efeitos favoráveis exige contraditório', regiao: 'Atos', camada: 'Jurisprudência', cor: 'lavanda' },
      ],
    },
  },
  {
    id: 'tipos', icone: '🧩', titulo: 'Um item de cada tipo', descricao: 'Os 15 tipos de item com os campos específicos de cada um.',
    valor: {
      nome: 'Catálogo de tipos',
      itens: [
        { tipo: 'titulo', texto: 'Todos os tipos de item', x: 0, y: 0, w: 560 },
        { tipo: 'postit', texto: 'Post-it comum', x: 0, y: 100 },
        { tipo: 'texto', html: 'Texto <b>livre</b>, sem fundo', x: 240, y: 100 },
        { tipo: 'caixa', html: '<h3>Caixa</h3><ul><li>com lista</li><li>e título</li></ul>', x: 520, y: 100 },
        { tipo: 'tarefas', titulo: 'Checklist', tarefas: ['[x] Ler a lei seca', '[ ] Fazer 30 questões', { texto: 'Revisar erros', feito: false }], x: 0, y: 340 },
        { tipo: 'tabela', tabela: [['Recurso', 'Prazo'], ['Apelação', '15 dias'], ['Embargos', '5 dias']], x: 260, y: 340 },
        { tipo: 'link', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm', titulo: 'Constituição Federal', x: 620, y: 340 },
        { tipo: 'cloze', texto: 'A capital do Brasil é {{Brasília}} e foi inaugurada em {{1960}}.', x: 0, y: 560 },
        { tipo: 'forma', forma: 'estrela', cor: 'amarelo', x: 320, y: 560 },
        { tipo: 'contador', titulo: 'Questões hoje', valor: 12, x: 540, y: 560 },
        { tipo: 'fita', x: 40, y: 90 },
        { tipo: 'pino', x: 100, y: 330 },
        { tipo: 'carimbo', carimbo: 'cai muito', x: 700, y: 580 },
        { tipo: 'desenho', x: 860, y: 100, w: 200, h: 120, tracos: [{ cor: '#2563eb', espessura: 4, pontos: [{ x: 10, y: 100 }, { x: 60, y: 20 }, { x: 110, y: 90 }, { x: 190, y: 15 }] }] },
        { tipo: 'imagem', imagem: PNG_MINIMO, x: 860, y: 260, w: 120, h: 120, titulo: 'Imagem embutida' },
      ],
    },
  },
  {
    id: 'erros', icone: '❌', titulo: 'Caderno de erros', descricao: 'Itens com "erro" alimentam o caderno de erros e as estatísticas.',
    valor: {
      nome: 'Caderno de erros',
      itens: [{
        titulo: 'Erro de questão', cor: 'pessego', camada: 'erros', etiquetas: ['erro', 'administrativo'],
        texto: 'Achei que a autoexecutoriedade estava presente em todos os atos.',
        erro: { disciplina: 'Administrativo', assunto: 'Atributos do ato', banca: 'CEBRASPE', ano: '2024', oQueErrei: 'Generalizei a autoexecutoriedade', motivo: 'confundi', respostaCerta: 'Nem todo ato é autoexecutório (ex.: multa)', fonte: 'Q123456' },
      }],
    },
  },
  {
    id: 'estudo', icone: '🎯', titulo: 'Edital, questões e metas', descricao: 'Edital no atalho { "Disciplina": ["tópicos"] }, histórico de questões e configurações de estudo.',
    valor: {
      nome: 'Concurso TRT',
      estudo: { nomeProva: 'TRT — Analista', dataProva: '2026-08-30', metaDiaria: 20, intervalos: [1, 3, 7, 15, 30] },
      edital: { 'Português': ['Crase', 'Concordância', 'Regência'], 'Direito do Trabalho': ['Contrato de trabalho', 'Jornada', 'Férias'] },
      questoes: [
        { data: '2026-03-02', disciplina: 'Português', assunto: 'Crase', acertos: 8, total: 10 },
        { data: '2026-03-03', disciplina: 'Direito do Trabalho', assunto: 'Jornada', acertos: 14, total: 20 },
      ],
      legenda: { vermelho: 'Exceção', verde: 'Regra geral', amarelo: 'Conceito' },
    },
  },
  {
    id: 'aparencia', icone: '🎨', titulo: 'Aparência e comportamento', descricao: 'Configurações da lousa: tema, fundo, conectores e visualização.',
    valor: {
      nome: 'Lousa escura',
      config: { tema: 'escuro', fundo: 'quadriculado', corFundo: '#1b1f2a', tamanhoGrade: 24, estiloConector: 'angulo', corConector: '#a5b4fc', anguloAleatorio: false, tamanhoPostit: 'pequeno' },
      visualizacao: { minimapa: false, reguas: true },
      itens: [{ texto: 'Tema escuro, fundo quadriculado e post-its pequenos.' }, { texto: 'Conectores em ângulo.' }],
    },
  },
];

export const exemploJSON = (id: string, legivel = true) => { const e = EXEMPLOS.find((x) => x.id === id); return e ? JSON.stringify(e.valor, null, legivel ? 2 : undefined) : ''; };
