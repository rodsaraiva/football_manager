import { buildTransferROIReport, PlayerForROI } from '@/engine/reports/transfer-roi-report';
import { Transfer } from '@/types';
import { PlayerStats, PlayerAttributes } from '@/types/player';

const CLUB = 10;

function mkAttrs(o: Partial<PlayerAttributes> = {}): PlayerAttributes {
  const base = 60;
  return {
    finishing: base, passing: base, crossing: base, dribbling: base, heading: base,
    longShots: base, freeKicks: base, vision: base, composure: base, decisions: base,
    positioning: base, aggression: base, leadership: base, pace: base, stamina: base,
    strength: base, agility: base, jumping: base, ...o,
  };
}
function mkPlayer(id: number, o: Partial<PlayerForROI> = {}): PlayerForROI {
  return {
    id, name: o.name ?? `P${id}`, position: o.position ?? 'ST',
    clubId: o.clubId === undefined ? CLUB : o.clubId,
    marketValue: o.marketValue ?? 1_000_000, attributes: o.attributes ?? mkAttrs(),
  };
}
function mkTransfer(id: number, o: Partial<Transfer> = {}): Transfer {
  return {
    id, playerId: o.playerId ?? id, season: o.season ?? 1,
    fromClubId: o.fromClubId ?? 99, toClubId: o.toClubId ?? CLUB,
    fee: o.fee ?? 500_000, wageOffered: o.wageOffered ?? 1000,
    type: o.type ?? 'transfer', loanEnd: o.loanEnd ?? null,
  };
}
function mkStats(playerId: number, season: number, goals: number, assists: number): PlayerStats {
  return { playerId, season, competitionId: 1, appearances: 10, goals, assists, yellowCards: 0, redCards: 0, avgRating: 7, minutesPlayed: 900 };
}

describe('buildTransferROIReport', () => {
  it('separa signings (toClub = playerClub) de sales (fromClub = playerClub)', () => {
    const transfers = [
      mkTransfer(1, { playerId: 1, toClubId: CLUB, fromClubId: 99 }),    // signing
      mkTransfer(2, { playerId: 2, toClubId: 99, fromClubId: CLUB, fee: 800_000 }), // sale
    ];
    const players = new Map<number, PlayerForROI>([
      [1, mkPlayer(1, { clubId: CLUB, marketValue: 1_200_000 })],
      [2, mkPlayer(2, { clubId: 99 })],
    ]);
    const r = buildTransferROIReport(transfers, CLUB, players, new Map());
    expect(r.signings.map((e) => e.playerId)).toEqual([1]);
    expect(r.sales.map((e) => e.playerId)).toEqual([2]);
  });

  it('valueDelta = marketValue - fee só para quem ainda está no clube', () => {
    const transfers = [mkTransfer(1, { playerId: 1, fee: 500_000 })];
    const players = new Map([[1, mkPlayer(1, { clubId: CLUB, marketValue: 1_200_000 })]]);
    const r = buildTransferROIReport(transfers, CLUB, players, new Map());
    expect(r.signings[0].valueDelta).toBe(700_000);
    expect(r.signings[0].stillAtClub).toBe(true);
  });

  it('jogador que saiu do clube -> stillAtClub false, valueDelta 0', () => {
    const transfers = [mkTransfer(1, { playerId: 1, fee: 500_000 })];
    const players = new Map([[1, mkPlayer(1, { clubId: 77 })]]); // foi pra outro clube depois
    const r = buildTransferROIReport(transfers, CLUB, players, new Map());
    expect(r.signings[0].stillAtClub).toBe(false);
    expect(r.signings[0].valueDelta).toBe(0);
  });

  it('soma goals+assists apenas de temporadas >= season da transferência', () => {
    const transfers = [mkTransfer(1, { playerId: 1, season: 2 })];
    const players = new Map([[1, mkPlayer(1)]]);
    const stats = new Map<number, PlayerStats[]>([[1, [
      mkStats(1, 1, 5, 5),   // antes -> ignorado
      mkStats(1, 2, 3, 2),   // conta
      mkStats(1, 3, 1, 1),   // conta
    ]]]);
    const r = buildTransferROIReport(transfers, CLUB, players, stats);
    expect(r.signings[0].goalsAndAssists).toBe(7);
  });

  it('isLoan reflete type=loan; sem player no mapa usa fallback name', () => {
    const transfers = [mkTransfer(1, { playerId: 1, type: 'loan' })];
    const r = buildTransferROIReport(transfers, CLUB, new Map(), new Map());
    expect(r.signings[0].isLoan).toBe(true);
    expect(r.signings[0].playerName).toBe('Jogador #1');
    expect(r.signings[0].currentOverall).toBe(0);
  });

  it('sem transferências -> listas vazias', () => {
    const r = buildTransferROIReport([], CLUB, new Map(), new Map());
    expect(r).toEqual({ signings: [], sales: [] });
  });
});
