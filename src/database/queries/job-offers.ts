import { DbHandle } from './players';

export type JobOfferStatus = 'pending' | 'accepted' | 'expired';

export interface PendingJobOffer {
  id: number;
  offeringClubId: number;
  clubName: string;
  clubReputation: number;
  leagueName: string;
  divisionLevel: number;
}

interface PendingJobOfferRow {
  id: number;
  offering_club_id: number;
  club_name: string;
  club_reputation: number;
  league_name: string;
  division_level: number;
}

export async function insertJobOffer(
  db: DbHandle,
  saveId: number,
  season: number,
  offeringClubId: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO job_offers (save_id, season, offering_club_id, status) VALUES (?, ?, ?, 'pending')",
    )
    .run(saveId, season, offeringClubId);
}

export async function getPendingJobOffers(
  db: DbHandle,
  saveId: number,
  season: number,
): Promise<PendingJobOffer[]> {
  const rows = (await db
    .prepare(
      `SELECT job_offers.id AS id,
              job_offers.offering_club_id AS offering_club_id,
              clubs.name AS club_name,
              clubs.reputation AS club_reputation,
              leagues.name AS league_name,
              leagues.division_level AS division_level
         FROM job_offers
         JOIN clubs   ON clubs.id = job_offers.offering_club_id AND clubs.save_id = job_offers.save_id
         JOIN leagues ON leagues.id = clubs.league_id
        WHERE job_offers.save_id = ? AND job_offers.season = ? AND job_offers.status = 'pending'
        ORDER BY clubs.reputation DESC, job_offers.offering_club_id ASC`,
    )
    .all(saveId, season)) as PendingJobOfferRow[];
  return rows.map((r) => ({
    id: r.id,
    offeringClubId: r.offering_club_id,
    clubName: r.club_name,
    clubReputation: r.club_reputation,
    leagueName: r.league_name,
    divisionLevel: r.division_level,
  }));
}

export async function setJobOfferStatus(
  db: DbHandle,
  saveId: number,
  season: number,
  offeringClubId: number,
  status: JobOfferStatus,
): Promise<void> {
  await db
    .prepare('UPDATE job_offers SET status = ? WHERE save_id = ? AND season = ? AND offering_club_id = ?')
    .run(status, saveId, season, offeringClubId);
}

/** Expire every still-pending offer for the season (used when declining all / after accepting one). */
export async function expirePendingJobOffers(db: DbHandle, saveId: number, season: number): Promise<void> {
  await db
    .prepare("UPDATE job_offers SET status = 'expired' WHERE save_id = ? AND season = ? AND status = 'pending'")
    .run(saveId, season);
}
