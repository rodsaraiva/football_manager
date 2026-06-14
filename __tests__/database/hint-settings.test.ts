import { createTestDb, createTestDbHandle } from './test-helpers';
import { isHintSeen, markHintSeen } from '@/database/queries/settings';

describe('contextual hint persistence', () => {
  it('começa não-visto, fica visto após marcar', async () => {
    const raw = createTestDb();
    const db = createTestDbHandle(raw);
    expect(await isHintSeen(db, 'tactics')).toBe(false);
    await markHintSeen(db, 'tactics');
    expect(await isHintSeen(db, 'tactics')).toBe(true);
    expect(await isHintSeen(db, 'transfers')).toBe(false); // por tela
    raw.close();
  });
});
