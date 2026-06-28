import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  openThread, appendMessage, getThreadView,
  getThreads, markThreadRead, setThreadStatus,
  countUnreadThreads, countActionableThreads, getExpiredActionableThreads,
} from '@/database/queries/inbox';
import type { TKey } from '@/i18n/translate';

const k = (s: string) => s as TKey;

describe('inbox queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => { rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb); });
  afterEach(() => rawDb.close());

  it('openThread cria thread + 1ª mensagem; getThreadView reconstrói descritores i18n', async () => {
    const id = await openThread(
      db, TEST_SAVE_ID,
      { category: 'transfer', refKind: 'transfer_offer', refId: 42, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), titleVars: { player: 'Silva' }, bodyKey: k('inbox.offer_received_body'), bodyVars: { fee: '$5.0M', club: 'ABC' }, icon: '💰' },
    );
    const view = await getThreadView(db, TEST_SAVE_ID, id);
    expect(view).not.toBeNull();
    expect(view!.category).toBe('transfer');
    expect(view!.refKind).toBe('transfer_offer');
    expect(view!.refId).toBe(42);
    expect(view!.actionKind).toBe('offer_response');
    expect(view!.status).toBe('open');
    expect(view!.deadlineWeek).toBe(8);
    expect(view!.read).toBe(false);
    expect(view!.lastWeek).toBe(5);
    expect(view!.messages).toHaveLength(1);
    expect(view!.messages[0].title.key).toBe('inbox.offer_received_title');
    expect(view!.messages[0].title.vars).toEqual({ player: 'Silva' });
    expect(view!.messages[0].body.vars).toEqual({ fee: '$5.0M', club: 'ABC' });
    expect(view!.messages[0].fromSelf).toBe(false);
  });

  it('appendMessage anexa, atualiza last_* e zera read', async () => {
    const id = await openThread(db, TEST_SAVE_ID, { category: 'transfer' },
      { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    await appendMessage(db, TEST_SAVE_ID, id,
      { season: 1, week: 7, titleKey: k('inbox.offer_response_title'), bodyKey: k('inbox.offer_response_body'), icon: '✅', fromSelf: true });
    const view = await getThreadView(db, TEST_SAVE_ID, id);
    expect(view!.messages).toHaveLength(2);
    expect(view!.messages[1].fromSelf).toBe(true);
    expect(view!.lastWeek).toBe(7);
    expect(view!.read).toBe(false);
  });

  it('getThreadView devolve null para id inexistente / save alheio', async () => {
    const id = await openThread(db, TEST_SAVE_ID, { category: 'board' },
      { season: 1, week: 1, titleKey: k('inbox.board_title'), bodyKey: k('inbox.board_body'), icon: '🏛️' });
    expect(await getThreadView(db, 999999, id)).toBeNull();
    expect(await getThreadView(db, TEST_SAVE_ID, 999999)).toBeNull();
  });

  it('getThreads ordena open antes de resolved, depois deadline asc', async () => {
    const a = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 12 },
      { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    const b = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    const c = await openThread(db, TEST_SAVE_ID, { category: 'loan' },
      { season: 1, week: 5, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
    await setThreadStatus(db, TEST_SAVE_ID, c, 'resolved');
    const ids = (await getThreads(db, TEST_SAVE_ID)).map((t) => t.id);
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a)); // deadline 8 antes de 12
    expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(c)); // open antes de resolved
  });

  it('markThreadRead marca só a thread alvo; counts refletem', async () => {
    const a = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
      { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    const b = await openThread(db, TEST_SAVE_ID, { category: 'loan' },
      { season: 1, week: 1, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
    expect(await countUnreadThreads(db, TEST_SAVE_ID)).toBe(2);
    await markThreadRead(db, TEST_SAVE_ID, a);
    expect(await countUnreadThreads(db, TEST_SAVE_ID)).toBe(1);
    expect((await getThreadView(db, TEST_SAVE_ID, b))!.read).toBe(false);
  });

  it('countActionableThreads conta só open + action!=none', async () => {
    await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
      { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    await openThread(db, TEST_SAVE_ID, { category: 'loan', actionKind: 'none' },
      { season: 1, week: 1, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
    const resolved = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
      { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    await setThreadStatus(db, TEST_SAVE_ID, resolved, 'resolved');
    expect(await countActionableThreads(db, TEST_SAVE_ID)).toBe(1);
  });

  it('getExpiredActionableThreads pega só vencidas (week==deadline conta)', async () => {
    const expired = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 9 },
      { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    await openThread(db, TEST_SAVE_ID, { category: 'loan', actionKind: 'none', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 1, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
    const ids = (await getExpiredActionableThreads(db, TEST_SAVE_ID, 1, 6)).map((t) => t.id);
    expect(ids).toEqual([expired]); // week==deadline vencido; deadline 9 e a informativa fora
  });

  it('counts são save-isolados', async () => {
    await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
      { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    expect(await countUnreadThreads(db, 999999)).toBe(0);
    expect(await countActionableThreads(db, 999999)).toBe(0);
  });
});
