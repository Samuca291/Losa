// @vitest-environment jsdom
// Teste de fumaça da interface de dados: renderiza o guia inteiro, os diálogos e o painel
// de configurações e confere textos-chave (pega erros de execução em qualquer seção).
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GuiaJSON } from '../GuiaJSON';
import { DialogoExportar, DialogoImportar } from '../DialogosDados';
import { PainelConfig } from '../PainelConfig';
import { EXEMPLOS } from '../../dados/exemplos';

describe('Interface de dados', () => {
  it('guia renderiza as 22 seções, tabelas geradas dos esquemas e todas as receitas', () => {
    const html = renderToString(<GuiaJSON />);
    expect((html.match(/class="guia-secao"/g) ?? []).length).toBe(22);
    for (const t of ['Seu primeiro JSON em 2 minutos', 'Os 15 tipos de item', 'Divisão automática', 'Integridade (SHA-256)', 'Validador ao vivo', 'Testes de integridade', 'escalaInterface', 'tamanhoGrade', 'opacidadeEsmaecer', 'pomodoroFoco', 'mapa-mental']) expect(html).toContain(t);
    for (const e of EXEMPLOS) expect(html).toContain(`${e.id}.json`);
  });
  it('assistente de importação e central de exportação renderizam', () => {
    const imp = renderToString(<DialogoImportar />);
    expect(imp).toContain('Arraste um arquivo .json');
    const exp = renderToString(<DialogoExportar mundoRef={{ current: null }} />);
    for (const t of ['Backup completo (.json)', 'Todas as lousas', 'JSON simplificado', 'CSV dos cartões']) expect(exp).toContain(t);
  });
  it('configurações têm a parte dedicada ao JSON', () => {
    const html = renderToString(<PainelConfig />);
    for (const t of ['Dados em JSON · guia completo', 'Validador ao vivo', 'Testes de integridade', 'Abrir guia']) expect(html).toContain(t);
  });
});
