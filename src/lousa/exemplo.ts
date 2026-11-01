// ============================================================
// EXEMPLO e TESTE DE CARGA. O programa começa vazio; isto só
// roda quando a pessoa pede.
// ============================================================
import { PALETA, type Item } from './types';
import { agora, aplicarDivisao, avisar, criarConector, criarRegiaoRaiz, getEstado, novoItem, reatribuirRegioes, setDoc, setLousa, verTudo, DIA_MS } from './store';
import { kanban, muralEdital } from './utils/divisoes';
import { textoParaHtml } from './utils/seguranca';

export function carregarExemplo() {
  const raiz = criarRegiaoRaiz({ x: 0, y: 0, w: 1500, h: 900 }, 'Mural do edital · Analista', null, false);
  aplicarDivisao(raiz, muralEdital('Português: Crase, Concordância\nConstitucional: Direitos fundamentais, Remédios constitucionais\nAdministrativo: Atos administrativos, Licitações'));
  const kb = criarRegiaoRaiz({ x: 1560, y: 0, w: 1100, h: 520 }, 'Quadro de progresso', null, false);
  aplicarDivisao(kb, kanban());
  const regioes = getEstado().lousa.doc.regioes;
  const folhas = Object.values(regioes).filter((r) => !r.filhos.length && r.id !== kb.toString());
  const achar = (nome: string) => folhas.find((f) => f.nome.toLowerCase().includes(nome.toLowerCase()));
  const dentro = (nome: string, i: number) => { const r = achar(nome); if (!r) return { x: 100 + i * 220, y: 1000 }; return { x: r.bbox.x + 20 + (i % 2) * 215, y: r.bbox.y + 50 + Math.floor(i / 2) * 215 }; };
  const t = agora();
  const itens: Item[] = [
    novoItem({ tipo: 'postit', ...dentro('crase', 0), cor: '#fff176', titulo: 'Regra geral', html: textoParaHtml('Crase = a + a. Só antes de palavra FEMININA que admite artigo.\n\nTeste: troque por "ao". Se couber, há crase.'), etiquetas: ['Português', 'conceito'], status: 'estudando', w: 200, h: 200 }),
    novoItem({ tipo: 'postit', ...dentro('crase', 1), cor: '#ef9a9a', titulo: 'Exceções', html: '<b>Não há crase:</b><ul><li>antes de verbo</li><li>antes de masculino</li><li>entre palavras repetidas (cara a cara)</li><li>antes de pronome de tratamento (exceto senhora, senhorita, dona)</li></ul>', etiquetas: ['Português', 'exceção'], status: 'revisar', w: 200, h: 200, revisao: { ativa: true, indice: 0, proxima: t - DIA_MS, historico: [] } }),
    novoItem({ tipo: 'postit', ...dentro('concord', 0), cor: '#90caf9', titulo: 'Pegadinha', html: '<b>Banca:</b> FGV<br><b>Confunde:</b> "haver" no sentido de existir é IMPESSOAL.<br><b>Certo:</b> "Havia muitas pessoas" (nunca "haviam").', etiquetas: ['Português', 'pegadinha'], status: 'revisar', w: 200, h: 200, revisao: { ativa: true, indice: 1, proxima: t, historico: [{ data: t - 2 * DIA_MS, acertou: true }] } }),
    novoItem({ tipo: 'postit', ...dentro('direitos fund', 0), cor: '#ce93d8', titulo: 'Mnemônico', html: '<b>Remédios: HD · HC · MI · MS · AP</b><br>Habeas Data, Habeas Corpus, Mandado de Injunção, Mandado de Segurança, Ação Popular.', etiquetas: ['Constitucional', 'mnemônico'], status: 'dominado', w: 200, h: 200 }),
    novoItem({ tipo: 'postit', ...dentro('remédios', 0), cor: '#80deea', titulo: 'Pergunta', html: 'Qual remédio cabe contra falta de norma regulamentadora que inviabiliza direito constitucional?', verso: '<b>Mandado de Injunção</b> (art. 5º, LXXI, CF).', etiquetas: ['Constitucional', 'flashcard'], status: 'revisar', w: 200, h: 200, revisao: { ativa: true, indice: 0, proxima: t, historico: [] } }),
    novoItem({ tipo: 'cloze', ...dentro('remédios', 1), cor: '#e6ee9c', titulo: 'Lacunas', html: 'O habeas corpus é {{gratuito}} e pode ser impetrado por {{qualquer pessoa}}, inclusive sem advogado. Prazo do MS: {{120 dias}}.', etiquetas: ['Constitucional'], status: 'estudando', w: 240, h: 170 }),
    novoItem({ tipo: 'postit', ...dentro('atos adm', 0), cor: '#b2dfdb', titulo: 'Art. 53 Lei 9.784', html: '"A Administração deve <b>anular</b> seus próprios atos quando eivados de vício de legalidade, e pode <b>revogá-los</b> por conveniência ou oportunidade."', etiquetas: ['Administrativo', 'lei'], status: 'estudando', w: 200, h: 200 }),
    novoItem({ tipo: 'postit', ...dentro('atos adm', 1), cor: '#ffcc80', titulo: 'Prazo', html: '<b>Prazo decadencial:</b> 5 anos para anular atos favoráveis ao administrado (art. 54), salvo má-fé.', etiquetas: ['Administrativo', 'prazo'], status: 'revisar', w: 200, h: 200, revisao: { ativa: true, indice: 0, proxima: t + 3 * DIA_MS, historico: [] } }),
    novoItem({ tipo: 'postit', ...dentro('licita', 0), cor: '#ffab91', titulo: 'Erro de questão', html: '<b>Questão:</b> CESPE 2023<br><b>O que errei:</b> confundi dispensa com inexigibilidade.<br><b>Por que errei:</b> confundi<br><b>Resposta certa:</b> inexigibilidade = inviabilidade de competição.<br><b>Base legal:</b> art. 74, Lei 14.133', etiquetas: ['Administrativo', 'erro'], status: 'estudando', w: 220, h: 220, camada: 'erros', modelo: 'erro', erro: { disciplina: 'Administrativo', assunto: 'Licitações', banca: 'CESPE', ano: '2023', oQueErrei: 'Confundi dispensa com inexigibilidade', motivo: 'confundi', respostaCerta: 'Inexigibilidade = inviabilidade de competição', fonte: 'art. 74, Lei 14.133' } }),
    novoItem({ tipo: 'tarefas', ...dentro('licita', 1), cor: '#ffffff', titulo: 'Checklist Lei 14.133', tarefas: [{ texto: 'Ler arts. 1 a 10', feito: true }, { texto: 'Modalidades', feito: true }, { texto: 'Dispensa × inexigibilidade', feito: false }, { texto: '30 questões', feito: false }], etiquetas: ['Administrativo'], w: 220, h: 190, html: '' }),
    novoItem({ tipo: 'titulo', x: 0, y: -100, w: 900, h: 70, html: 'Concurso Analista · Prova em breve', etiquetas: [], cor: 'transparent', tamanhoFonte: 34 }),
    novoItem({ tipo: 'texto', x: 940, y: -90, w: 560, h: 60, html: 'Dica: aperte <b>H</b> para ocultar tudo, <b>?</b> para ver os atalhos e <b>Ctrl+K</b> para a paleta de comandos.', cor: 'transparent' }),
    novoItem({ tipo: 'link', x: 1560, y: 560, w: 280, h: 90, titulo: 'planalto.gov.br', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm', html: '', cor: '#ffffff' }),
    novoItem({ tipo: 'forma', x: 1880, y: 560, w: 200, h: 110, forma: 'seta', cor: '#fbbf24', html: 'Revisar amanhã' }),
    novoItem({ tipo: 'carimbo', x: 2120, y: 570, w: 170, h: 60, carimbo: 'importante', cor: '#dc2626', html: '' }),
    novoItem({ tipo: 'contador', x: 2320, y: 560, w: 130, h: 90, valor: 42, titulo: 'Questões hoje', html: '' }),
    novoItem({ tipo: 'tabela', x: 1560, y: 680, w: 420, h: 150, tabela: [['Critério', 'Anulação', 'Revogação'], ['Motivo', 'Ilegalidade', 'Conveniência'], ['Efeitos', 'Ex tunc', 'Ex nunc'], ['Quem', 'Adm. e Judiciário', 'Só Adm.']], cor: '#ffffff', etiquetas: ['Administrativo'], html: '' }),
  ];
  // itens no quadro de progresso
  const kbFolhas = getEstado().lousa.doc.regioes[kb].filhos.map((id) => getEstado().lousa.doc.regioes[id]);
  itens.push(novoItem({ tipo: 'postit', x: kbFolhas[0].bbox.x + 20, y: kbFolhas[0].bbox.y + 50, cor: '#cfd8dc', html: 'Raciocínio lógico: proposições', etiquetas: ['RLM'], w: 200, h: 120, regiao: kbFolhas[0].id }));
  itens.push(novoItem({ tipo: 'postit', x: kbFolhas[1].bbox.x + 20, y: kbFolhas[1].bbox.y + 50, cor: '#90caf9', html: 'Informática: segurança da informação', etiquetas: ['Informática'], w: 200, h: 120, regiao: kbFolhas[1].id }));
  itens.push(novoItem({ tipo: 'postit', x: kbFolhas[3].bbox.x + 20, y: kbFolhas[3].bbox.y + 50, cor: '#a5d6a7', html: 'Português: acentuação ✔', etiquetas: ['Português'], status: 'dominado', w: 200, h: 120, regiao: kbFolhas[3].id }));
  setDoc((d) => { const novos = { ...d.itens }; itens.forEach((it, i) => { novos[it.id] = { ...it, z: i + 1 }; }); return { ...d, itens: novos }; });
  reatribuirRegioes(itens.map((i) => i.id));
  criarConector(itens[6].id, itens[7].id, { rotulo: 'prazo para', estilo: 'curvo' });
  criarConector(itens[0].id, itens[1].id, { rotulo: 'exceção de', estilo: 'curvo', cor: '#dc2626' });
  setLousa((l) => ({ estudo: { ...l.estudo, dataProva: new Date(Date.now() + 45 * DIA_MS).toISOString().slice(0, 10), nomeProva: 'Analista' }, edital: [
    { id: 'e1', disciplina: 'Português', topico: 'Crase', status: 'estudando', dominio: 60 }, { id: 'e2', disciplina: 'Português', topico: 'Concordância', status: 'revisar', dominio: 75 },
    { id: 'e3', disciplina: 'Constitucional', topico: 'Direitos fundamentais', status: 'dominado', dominio: 90 }, { id: 'e4', disciplina: 'Constitucional', topico: 'Remédios constitucionais', status: 'estudando', dominio: 50 },
    { id: 'e5', disciplina: 'Administrativo', topico: 'Atos administrativos', status: 'estudando', dominio: 40 }, { id: 'e6', disciplina: 'Administrativo', topico: 'Licitações', status: 'nao-visto', dominio: 10 },
  ], questoes: [{ id: 'q1', data: Date.now() - DIA_MS, disciplina: 'Administrativo', assunto: 'Licitações', acertos: 12, total: 20 }, { id: 'q2', data: Date.now(), disciplina: 'Português', assunto: 'Crase', acertos: 9, total: 10 }] }));
  setTimeout(verTudo, 50);
  avisar('Exemplo carregado. Explore à vontade: nada é enviado para a internet.');
}

export function gerarTesteCarga(qtd: number) {
  const textos = ['Art. 5º, CF — direitos e garantias', 'Prazo: 15 dias úteis (CPC)', 'Súmula 473 STF', 'Princípio da legalidade', 'Exceção: flagrante delito', 'Concordância verbal', 'Licitação: pregão', 'Regra geral e exceção', 'Mnemônico LIMPE', 'Revisar amanhã'];
  const itens: Item[] = []; const cols = Math.ceil(Math.sqrt(qtd)); const base = Object.keys(getEstado().lousa.doc.itens).length;
  for (let i = 0; i < qtd; i++) {
    itens.push(novoItem({ tipo: 'postit', x: 3000 + (i % cols) * 230, y: (Math.floor(i / cols)) * 230, w: 200, h: 200, cor: PALETA[i % PALETA.length].cor, html: textoParaHtml(`${textos[i % textos.length]} #${base + i + 1}`), etiquetas: [['Português', 'Constitucional', 'Administrativo', 'RLM'][i % 4]], angulo: Math.random() * 6 - 3, status: (['nao-visto', 'estudando', 'revisar', 'dominado'] as const)[i % 4] }));
  }
  setDoc((d) => { const novos = { ...d.itens }; let z = Object.keys(novos).length + 1; for (const it of itens) novos[it.id] = { ...it, z: z++ }; return { ...d, itens: novos }; });
  avisar(`${qtd} itens de teste criados. Use "Ver tudo" e arraste para medir a fluidez.`);
  setTimeout(verTudo, 50);
}
