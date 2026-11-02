// @vitest-environment jsdom
// Executa no Vitest a MESMA suíte que o guia roda no navegador.
//   npx vitest run
import { describe, it } from 'vitest';
import { CASOS } from '../testes';

for (const grupo of [...new Set(CASOS.map((c) => c.grupo))]) {
  describe(grupo, () => {
    for (const c of CASOS.filter((x) => x.grupo === grupo)) it(c.nome, async () => { await c.executar(); }, 20_000);
  });
}
