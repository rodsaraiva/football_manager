import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from './test-helpers';
import {
  addFinanceEntry,
  getFinancesBySeason,
} from '@/database/queries/finances';
import {
  setRowValidationEnabled,
  isRowValidationEnabled,
} from '@/database/parse-rows';

// Hot-path: a validação Zod do read-path não pode regredir grosseiramente o avanço de
// semana. As leituras de finanças NÃO ficam no loop semanal (rodam no fim de temporada e
// nas telas), então o risco real é pequeno; ainda assim medimos o custo da validação sobre
// uma temporada cheia de lançamentos e garantimos que o escape-hatch (setRowValidationEnabled)
// derruba o overhead a zero sem alterar os dados retornados.

const FINANCE_TYPES = ['tv', 'sponsor', 'ticket', 'wages', 'maintenance'] as const;
const WEEKS = 38;
const ITERATIONS = 200;

async function seedSeasonOfFinances(handle: ReturnType<typeof createTestDbHandle>, clubId: number) {
  for (let week = 1; week <= WEEKS; week++) {
    for (const type of FINANCE_TYPES) {
      await addFinanceEntry(handle, TEST_SAVE_ID, {
        clubId,
        season: 1,
        week,
        type,
        amount: type === 'wages' || type === 'maintenance' ? -10000 : 50000,
        description: `${type} w${week}`,
      });
    }
  }
}

function median(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

describe('finances read-path hot-path (Zod ligado vs escape-hatch)', () => {
  let db: ReturnType<typeof createTestDb>;
  let handle: ReturnType<typeof createTestDbHandle>;
  let clubId: number;

  beforeAll(async () => {
    db = createTestDb();
    seedTestDb(db);
    handle = createTestDbHandle(db);
    const saveRow = db
      .prepare('SELECT player_club_id AS id FROM save_games WHERE id = ?')
      .get(TEST_SAVE_ID) as { id: number };
    clubId = saveRow.id;
    await seedSeasonOfFinances(handle, clubId);
  });

  afterAll(() => {
    setRowValidationEnabled(true); // restaura o default global para os demais testes
    db.close();
  });

  it('escape-hatch retorna exatamente os mesmos dados que a validação ligada', async () => {
    setRowValidationEnabled(true);
    const validated = await getFinancesBySeason(handle, TEST_SAVE_ID, clubId, 1);
    setRowValidationEnabled(false);
    const bypassed = await getFinancesBySeason(handle, TEST_SAVE_ID, clubId, 1);
    setRowValidationEnabled(true);
    expect(bypassed).toEqual(validated);
    expect(validated.length).toBe(WEEKS * FINANCE_TYPES.length);
  });

  it('validar uma temporada cheia não regride de forma grosseira', async () => {
    // warmup (JIT/prepared-statement cache)
    for (let i = 0; i < 20; i++) await getFinancesBySeason(handle, TEST_SAVE_ID, clubId, 1);

    setRowValidationEnabled(true);
    const onSamples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t = performance.now();
      await getFinancesBySeason(handle, TEST_SAVE_ID, clubId, 1);
      onSamples.push(performance.now() - t);
    }

    setRowValidationEnabled(false);
    const offSamples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t = performance.now();
      await getFinancesBySeason(handle, TEST_SAVE_ID, clubId, 1);
      offSamples.push(performance.now() - t);
    }
    setRowValidationEnabled(true);

    const onMed = median(onSamples);
    const offMed = median(offSamples);
    const rows = WEEKS * FINANCE_TYPES.length;
    // eslint-disable-next-line no-console
    console.log(
      `[hot-path] ${rows} linhas/leitura — Zod ON mediana=${onMed.toFixed(3)}ms, ` +
        `OFF mediana=${offMed.toFixed(3)}ms, overhead=${(onMed - offMed).toFixed(3)}ms/leitura`,
    );

    // Teto absoluto generoso: 190 linhas validadas bem abaixo de 8ms na mediana — qualquer
    // valor acima sinalizaria regressão grosseira (não micro-ruído de CI).
    expect(onMed).toBeLessThan(8);
    expect(isRowValidationEnabled()).toBe(true);
  });
});
