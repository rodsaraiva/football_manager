import { Transfer, TransferOffer, TransferType, OfferStatus } from '@/types';
import { DbHandle } from './players';
import { LoanedPlayerRow } from '@/engine/transfer/loan-portfolio';

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
  offer_type: string | null;
  loan_end: number | null;
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
    offerType: ((row.offer_type as TransferType | null) ?? 'transfer'),
    loanEnd: row.loan_end,
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

export async function createTransfer(db: DbHandle, saveId: number, input: CreateTransferInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO transfers (save_id, player_id, season, from_club_id, to_club_id, fee, wage_offered, type, loan_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      saveId,
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

export async function getTransfersBySeason(db: DbHandle, saveId: number, season: number): Promise<Transfer[]> {
  const rows = await db
    .prepare('SELECT * FROM transfers WHERE save_id = ? AND season = ?')
    .all(saveId, season) as TransferRow[];
  return rows.map(rowToTransfer);
}

export async function getTransfersByClub(db: DbHandle, saveId: number, clubId: number): Promise<Transfer[]> {
  const rows = await db
    .prepare('SELECT * FROM transfers WHERE save_id = ? AND (to_club_id = ? OR from_club_id = ?) ORDER BY season DESC, id DESC')
    .all(saveId, clubId, clubId) as TransferRow[];
  return rows.map(rowToTransfer);
}

export interface CreateOfferInput {
  playerId: number;
  offeringClubId: number;
  sellingClubId: number;
  feeOffered: number;
  wageOffered: number;
  offerType?: TransferType; // defaults to 'transfer'
  loanEnd?: number | null;
  createdSeason?: number | null;
  createdWeek?: number | null;
}

export async function createOffer(db: DbHandle, saveId: number, input: CreateOfferInput): Promise<number> {
  const type = input.offerType ?? 'transfer';
  const result = await db
    .prepare(
      `INSERT INTO transfer_offers
         (save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status,
          offer_type, loan_end, created_season, created_week, round_count)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0)`,
    )
    .run(
      saveId,
      input.playerId,
      input.offeringClubId,
      input.sellingClubId,
      input.feeOffered,
      input.wageOffered,
      type,
      input.loanEnd ?? null,
      input.createdSeason ?? null,
      input.createdWeek ?? null,
    ) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getPendingOffers(db: DbHandle, saveId: number): Promise<TransferOffer[]> {
  const rows = await db
    .prepare("SELECT * FROM transfer_offers WHERE save_id = ? AND status = 'pending'")
    .all(saveId) as TransferOfferRow[];
  return rows.map(rowToTransferOffer);
}

export async function getOffersByOfferingClub(db: DbHandle, saveId: number, clubId: number): Promise<TransferOffer[]> {
  const rows = await db
    .prepare('SELECT * FROM transfer_offers WHERE save_id = ? AND offering_club_id = ? ORDER BY id DESC')
    .all(saveId, clubId) as TransferOfferRow[];
  return rows.map(rowToTransferOffer);
}

export async function getOffersBySellingClub(db: DbHandle, saveId: number, clubId: number): Promise<TransferOffer[]> {
  const rows = await db
    .prepare('SELECT * FROM transfer_offers WHERE save_id = ? AND selling_club_id = ? ORDER BY id DESC')
    .all(saveId, clubId) as TransferOfferRow[];
  return rows.map(rowToTransferOffer);
}

export async function getOfferById(db: DbHandle, saveId: number, offerId: number): Promise<TransferOffer | null> {
  const row = await db
    .prepare('SELECT * FROM transfer_offers WHERE save_id = ? AND id = ?')
    .get(saveId, offerId) as TransferOfferRow | undefined;
  return row ? rowToTransferOffer(row) : null;
}

export async function updateOfferStatus(
  db: DbHandle,
  saveId: number,
  offerId: number,
  status: OfferStatus,
  responseWeek?: number,
): Promise<void> {
  await db.prepare('UPDATE transfer_offers SET status = ?, response_week = ? WHERE save_id = ? AND id = ?').run(
    status,
    responseWeek ?? null,
    saveId,
    offerId,
  );
}

export async function updateOfferFee(
  db: DbHandle,
  saveId: number,
  offerId: number,
  feeOffered: number,
): Promise<void> {
  await db.prepare('UPDATE transfer_offers SET fee_offered = ? WHERE save_id = ? AND id = ?').run(
    feeOffered,
    saveId,
    offerId,
  );
}

export async function deleteOffer(db: DbHandle, saveId: number, offerId: number): Promise<void> {
  await db.prepare('DELETE FROM transfer_offers WHERE save_id = ? AND id = ?').run(saveId, offerId);
}

// ─── C8-d: loan portfolio (active loans out + early recall) ──────────────────

/**
 * Empréstimos ativos cujo clube-pai é `parentClubId` e que ainda NÃO voltaram
 * (jogador atualmente em outro clube). Agrega stats de player_stats como proxy
 * de desempenho. Save-isolado.
 */
export async function getActiveLoansByParent(
  db: DbHandle, saveId: number, parentClubId: number,
): Promise<LoanedPlayerRow[]> {
  const rows = (await db.prepare(
    `SELECT t.player_id AS playerId, p.name AS name, p.club_id AS loanClubId,
            c.name AS loanClubName, t.loan_end AS loanEnd
     FROM transfers t
     JOIN players p ON p.save_id = t.save_id AND p.id = t.player_id
     LEFT JOIN clubs c ON c.save_id = t.save_id AND c.id = p.club_id
     WHERE t.save_id = ? AND t.type = 'loan' AND t.loan_end IS NOT NULL
       AND t.from_club_id = ? AND p.club_id != ?`,
  ).all(saveId, parentClubId, parentClubId)) as Array<{
    playerId: number; name: string; loanClubId: number; loanClubName: string | null; loanEnd: number;
  }>;

  const out: LoanedPlayerRow[] = [];
  for (const r of rows) {
    const stat = (await db.prepare(
      `SELECT COALESCE(SUM(appearances),0) AS appearances,
              COALESCE(SUM(minutes_played),0) AS minutesPlayed,
              CASE WHEN SUM(minutes_played) > 0
                   THEN SUM(avg_rating * minutes_played) / SUM(minutes_played) ELSE 0 END AS avgRating
       FROM player_stats WHERE save_id = ? AND player_id = ?`,
    ).get(saveId, r.playerId)) as { appearances: number; minutesPlayed: number; avgRating: number };
    out.push({
      playerId: r.playerId, name: r.name, loanClubId: r.loanClubId,
      loanClubName: r.loanClubName ?? '', loanEnd: r.loanEnd,
      appearances: stat.appearances, avgRating: Math.round(stat.avgRating * 10) / 10, minutesPlayed: stat.minutesPlayed,
    });
  }
  return out;
}

/** Encerra um empréstimo antes do prazo — devolve o jogador ao clube-pai. */
export async function recallLoan(
  db: DbHandle, saveId: number, playerId: number, parentClubId: number,
): Promise<void> {
  await db.prepare('UPDATE players SET club_id = ?, loan_wage = NULL WHERE save_id = ? AND id = ?')
    .run(parentClubId, saveId, playerId);
  await db.prepare("UPDATE transfers SET loan_end = NULL WHERE save_id = ? AND player_id = ? AND type = 'loan' AND loan_end IS NOT NULL")
    .run(saveId, playerId);
}
