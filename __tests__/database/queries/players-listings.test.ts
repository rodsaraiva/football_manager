import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import {
  setTransferListing,
  setLoanListing,
  getListedPlayers,
  getPlayerById,
} from '../../../src/database/queries/players';

describe('player listings', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('defaults both flags to false and both nullable fields to null', async () => {
    const p = await getPlayerById(db, 1, 1);
    expect(p).not.toBeNull();
    expect(p!.isTransferListed).toBe(false);
    expect(p!.isLoanListed).toBe(false);
    expect(p!.askingPrice).toBeNull();
    expect(p!.loanWageShare).toBeNull();
  });

  it('sets transfer listing with an asking price', async () => {
    await setTransferListing(db, 1, 1, true, 5_000_000);
    const p = await getPlayerById(db, 1, 1);
    expect(p!.isTransferListed).toBe(true);
    expect(p!.askingPrice).toBe(5_000_000);
    expect(p!.isLoanListed).toBe(false);
  });

  it('sets transfer listing without a price (open offers)', async () => {
    await setTransferListing(db, 1, 1, true, null);
    const p = await getPlayerById(db, 1, 1);
    expect(p!.isTransferListed).toBe(true);
    expect(p!.askingPrice).toBeNull();
  });

  it('clears the asking price when un-listing from transfer', async () => {
    await setTransferListing(db, 1, 1, true, 5_000_000);
    await setTransferListing(db, 1, 1, false, null);
    const p = await getPlayerById(db, 1, 1);
    expect(p!.isTransferListed).toBe(false);
    expect(p!.askingPrice).toBeNull();
  });

  it('sets loan listing with a wage share', async () => {
    await setLoanListing(db, 1, 1, true, 0.5);
    const p = await getPlayerById(db, 1, 1);
    expect(p!.isLoanListed).toBe(true);
    expect(p!.loanWageShare).toBeCloseTo(0.5);
  });

  it('setting loan listing does not affect transfer listing', async () => {
    await setTransferListing(db, 1, 1, true, 3_000_000);
    await setLoanListing(db, 1, 1, true, 0.4);
    const p = await getPlayerById(db, 1, 1);
    expect(p!.isTransferListed).toBe(true);
    expect(p!.askingPrice).toBe(3_000_000);
    expect(p!.isLoanListed).toBe(true);
    expect(p!.loanWageShare).toBeCloseTo(0.4);
  });

  it('getListedPlayers filters by mode', async () => {
    await setTransferListing(db, 1, 1, true, 2_000_000);
    await setLoanListing(db, 1, 2, true, 0.5);

    const t = await getListedPlayers(db, 1, 'transfer');
    expect(t.map((p) => p.id)).toContain(1);
    expect(t.map((p) => p.id)).not.toContain(2);

    const l = await getListedPlayers(db, 1, 'loan');
    expect(l.map((p) => p.id)).toContain(2);
    expect(l.map((p) => p.id)).not.toContain(1);

    const any = await getListedPlayers(db, 1, 'any');
    expect(any.map((p) => p.id)).toEqual(expect.arrayContaining([1, 2]));
  });
});
