import { generateSeedData, SeedData } from '../../scripts/generate-seed-data';

describe('generateSeedData', () => {
  let data: SeedData;

  beforeAll(() => {
    data = generateSeedData(12345);
  });

  it('generates 5 countries', () => {
    expect(data.countries).toHaveLength(5);
  });

  it('generates 5 leagues', () => {
    expect(data.leagues).toHaveLength(5);
  });

  it('generates 96 clubs', () => {
    expect(data.clubs).toHaveLength(96);
  });

  it('generates ~25 players per club', () => {
    const totalPlayers = data.players.length;
    expect(totalPlayers).toBeGreaterThanOrEqual(96 * 23);
    expect(totalPlayers).toBeLessThanOrEqual(96 * 27);
  });

  it('each player has matching attributes', () => {
    for (const player of data.players) {
      const attrs = data.playerAttributes.find((a) => a.playerId === player.id);
      expect(attrs).toBeDefined();
    }
  });

  it('all attributes are between 1 and 99', () => {
    for (const attrs of data.playerAttributes) {
      const values = Object.entries(attrs)
        .filter(([k]) => k !== 'playerId')
        .map(([, v]) => v as number);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });

  it('top clubs have higher average overalls', () => {
    const topClub = data.clubs.find((c) => c.reputation >= 90)!;
    const weakClub = data.clubs.find((c) => c.reputation <= 55)!;

    const avgForClub = (clubId: number) => {
      const players = data.players.filter((p) => p.clubId === clubId);
      const attrs = players.map((p) => data.playerAttributes.find((a) => a.playerId === p.id)!);
      const overalls = attrs.map((a) => {
        const vals = Object.entries(a).filter(([k]) => k !== 'playerId').map(([, v]) => v as number);
        return vals.reduce((s, v) => s + v, 0) / vals.length;
      });
      return overalls.reduce((s, v) => s + v, 0) / overalls.length;
    };

    expect(avgForClub(topClub.id)).toBeGreaterThan(avgForClub(weakClub.id));
  });

  it('each club has realistic position distribution', () => {
    for (const club of data.clubs) {
      const players = data.players.filter((p) => p.clubId === club.id);
      const gks = players.filter((p) => p.position === 'GK');
      const defs = players.filter((p) => ['CB', 'LB', 'RB'].includes(p.position));
      const mids = players.filter((p) => ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p.position));
      const fwds = players.filter((p) => ['LW', 'RW', 'ST'].includes(p.position));

      expect(gks.length).toBeGreaterThanOrEqual(2);
      expect(gks.length).toBeLessThanOrEqual(3);
      expect(defs.length).toBeGreaterThanOrEqual(5);
      expect(defs.length).toBeLessThanOrEqual(8);
      expect(mids.length).toBeGreaterThanOrEqual(5);
      expect(mids.length).toBeLessThanOrEqual(9);
      expect(fwds.length).toBeGreaterThanOrEqual(3);
      expect(fwds.length).toBeLessThanOrEqual(6);
    }
  });

  it('player ages follow realistic distribution (16-36)', () => {
    for (const player of data.players) {
      expect(player.age).toBeGreaterThanOrEqual(16);
      expect(player.age).toBeLessThanOrEqual(36);
    }
  });

  it('is deterministic — same seed produces same data', () => {
    const data2 = generateSeedData(12345);
    expect(data.players.length).toBe(data2.players.length);
    expect(data.players[0].name).toBe(data2.players[0].name);
    expect(data.players[data.players.length - 1].name).toBe(data2.players[data2.players.length - 1].name);
  });

  it('generates staff for each club', () => {
    for (const club of data.clubs) {
      const clubStaff = data.staff.filter((s) => s.clubId === club.id);
      expect(clubStaff.length).toBeGreaterThanOrEqual(3);
      expect(clubStaff.length).toBeLessThanOrEqual(5);
    }
  });

  it('generates a default tactic for each club', () => {
    for (const club of data.clubs) {
      const tactic = data.tactics.find((t) => t.clubId === club.id);
      expect(tactic).toBeDefined();
      expect(tactic!.isActive).toBe(true);
    }
  });
});
