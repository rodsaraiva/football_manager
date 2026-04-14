import { Transfer, TransferOffer, TransferType, OfferStatus } from '@/types';
import { DbHandle } from './players';

interface TransferRow {
  id: number;
  player_id: number;
  season: number;
  from_club_id: number | null;
  to_club_id: number | null;
  fee: number;
  wage_offered: number;
  type: string;
  loan_end: number | null;
}

interface TransferOfferRow {
  id: number;
  player_id: number;
  offering_club_id: number;
  selling_club_id: number;
  fee_offered: number;
  wage_offered: number;
  status: string;
  response_week: number | null;
}

function rowToTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    playerId: row.player_id,
    season: row.season,
    fromClubId: row.from_club_id as number,
    toClubId: row.to_club_id as number,
    fee: row.fee,
    wageOffered: row.wage_offered,
    type: row.type as TransferType,
    loanEnd: row.loan_end,
  };
}

function rowToTransferOffer(row: TransferOfferRow): TransferOffer {
  return {
    id: row.id,
    playerId: row.player_id,
    offeringClubId: row.offering_club_id,
    sellingClubId: row.selling_club_id,
    feeOffered: row.fee_offered,
    wageOffered: row.wage_offered,
    status: row.status as OfferStatus,
    responseWeek: row.response_week,
  };
}

export interface CreateTransferInput {
  playerId: number;
  season: number;
  fromClubId?: number | null;
  toClubId?: number | null;
  fee: number;
  wageOffered: number;
  type: TransferType;
  loanEnd?: number | null;
}

export async function createTransfer(db: DbHandle, input: CreateTransferInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO transfers (player_id, season, from_club_id, to_club_id, fee, wage_offered, type, loan_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.playerId,
      input.season,
      input.fromClubId ?? null,
      input.toClubId ?? null,
      input.fee,
      input.wageOffered,
      input.type,
      input.loanEnd ?? null,
    ) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getTransfersBySeason(db: DbHandle, season: number): Promise<Transfer[]> {
  const rows = await db
    .prepare('SELECT * FROM transfers WHERE season = ?')
    .all(season) as TransferRow[];
  return rows.map(rowToTransfer);
}

export interface CreateOfferInput {
  playerId: number;
  offeringClubId: number;
  sellingClubId: number;
  feeOffered: number;
  wageOffered: number;
}

export async function createOffer(db: DbHandle, input: CreateOfferInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO transfer_offers (player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
    )
    .run(
      input.playerId,
      input.offeringClubId,
      input.sellingClubId,
      input.feeOffered,
      input.wageOffered,
    ) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getPendingOffers(db: DbHandle): Promise<TransferOffer[]> {
  const rows = await db
    .prepare("SELECT * FROM transfer_offers WHERE status = 'pending'")
    .all() as TransferOfferRow[];
  return rows.map(rowToTransferOffer);
}

export async function getOffersByOfferingClub(db: DbHandle, clubId: number): Promise<TransferOffer[]> {
  const rows = await db
    .prepare('SELECT * FROM transfer_offers WHERE offering_club_id = ? ORDER BY id DESC')
    .all(clubId) as TransferOfferRow[];
  return rows.map(rowToTransferOffer);
}

export async function getOffersBySellingClub(db: DbHandle, clubId: number): Promise<TransferOffer[]> {
  const rows = await db
    .prepare('SELECT * FROM transfer_offers WHERE selling_club_id = ? ORDER BY id DESC')
    .all(clubId) as TransferOfferRow[];
  return rows.map(rowToTransferOffer);
}

export async function getOfferById(db: DbHandle, offerId: number): Promise<TransferOffer | null> {
  const row = await db
    .prepare('SELECT * FROM transfer_offers WHERE id = ?')
    .get(offerId) as TransferOfferRow | undefined;
  return row ? rowToTransferOffer(row) : null;
}

export async function updateOfferStatus(
  db: DbHandle,
  offerId: number,
  status: OfferStatus,
  responseWeek?: number,
): Promise<void> {
  await db.prepare('UPDATE transfer_offers SET status = ?, response_week = ? WHERE id = ?').run(
    status,
    responseWeek ?? null,
    offerId,
  );
}

export async function updateOfferFee(
  db: DbHandle,
  offerId: number,
  feeOffered: number,
): Promise<void> {
  await db.prepare('UPDATE transfer_offers SET fee_offered = ? WHERE id = ?').run(
    feeOffered,
    offerId,
  );
}

export async function deleteOffer(db: DbHandle, offerId: number): Promise<void> {
  await db.prepare('DELETE FROM transfer_offers WHERE id = ?').run(offerId);
}
