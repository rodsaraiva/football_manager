import { createTestDb } from '../test-helpers';

it('SCHEMA_SQL cria injury_severity e injury_return_fitness (nullable)', () => {
  const db = createTestDb();
  const names = (db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>).map((c) => c.name);
  expect(names).toContain('injury_severity');
  expect(names).toContain('injury_return_fitness');
});
