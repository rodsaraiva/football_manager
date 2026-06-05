import { createE2EContext, stepWeek, E2EContext, getPlayerClub } from './test-helpers';
import { retirePlayer } from '@/database/queries/players';
import { MAX_PLAYER_AGE, SEASON_END_WEEK } from '@/engine/balance';

function setPlayerAgeAndMorale(ctx: E2EContext, playerId: number, age: number, morale: number): void {
  ctx.rawDb
    .prepare('UPDATE players SET age = ?, morale = ? WHERE id = ?')
    .run(age, morale, playerId);
}

function setPlayerMorale(ctx: E2EContext, playerId: number, morale: number): void {
  ctx.rawDb.prepare('UPDATE players SET morale = ? WHERE id = ?').run(morale, playerId);
}

function setPlayerAge(ctx: E2EContext, playerId: number, age: number): void {
  ctx.rawDb.prepare('UPDATE players SET age = ? WHERE id = ?').run(age, playerId);
}

function pickPlayerInClub(ctx: E2EContext, clubId: number): number {
  const row = ctx.rawDb
    .prepare('SELECT id FROM players WHERE club_id = ? AND is_free_agent = 0 LIMIT 1')
    .get(clubId) as { id: number } | undefined;
  if (!row) throw new Error(`No player found for club ${clubId}`);
  return row.id;
}

function getAnnouncedFlag(ctx: E2EContext, playerId: number): number {
  const row = ctx.rawDb
    .prepare('SELECT will_retire_at_season_end as f FROM players WHERE id = ?')
    .get(playerId) as { f: number } | undefined;
  return row?.f ?? 0;
}

function getStreak(ctx: E2EContext, playerId: number): number {
  const row = ctx.rawDb
    .prepare('SELECT consecutive_low_morale_weeks as s FROM players WHERE id = ?')
    .get(playerId) as { s: number } | undefined;
  return row?.s ?? 0;
}

function setWeek(ctx: E2EContext, week: number): void {
  ctx.week = week;
}

describe('E2E · retirement', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await createE2EContext();
  });

  afterEach(() => {
    ctx.rawDb.close();
  });

  it('35a, moral baixa sustentada na janela: anunciado durante janela e aposentado no fim', async () => {
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAgeAndMorale(ctx, playerId, 35, 30);

    // Pular direto pra semana anterior à janela. Janela = [26..36] (SEASON_END=46, 20..10 antes).
    setWeek(ctx, 23);

    let announcedWeek = -1;
    let isEnd = false;
    let guard = 0;
    let seasonEndResult: Awaited<ReturnType<typeof stepWeek>> | null = null;
    while (!isEnd && guard < 60) {
      const weekBefore = ctx.week;
      // Re-fixa morale antes do step: o engine pode mover morale ao longo
      // da temporada (treino, resultados) e isso mascararia o streak.
      setPlayerMorale(ctx, playerId, 30);
      const r = await stepWeek(ctx, 321 + guard);
      if (r.newlyAnnouncedRetirementIds.includes(playerId) && announcedWeek < 0) {
        announcedWeek = weekBefore;
        // Causalidade: flag deve estar setada imediatamente após o trigger.
        expect(getAnnouncedFlag(ctx, playerId)).toBe(1);
      }
      if (r.isSeasonEnd) seasonEndResult = r;
      isEnd = r.isSeasonEnd;
      guard++;
    }
    expect(isEnd).toBe(true);
    expect(announcedWeek).toBeGreaterThanOrEqual(SEASON_END_WEEK - 20);
    expect(announcedWeek).toBeLessThanOrEqual(SEASON_END_WEEK - 10);
    expect(seasonEndResult?.retiringPlayerIds).toContain(playerId);
    expect(getPlayerClub(ctx, playerId)).toBeNull();
  }, 60_000);

  it('streak reseta quando moral volta alta: não anuncia', async () => {
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAgeAndMorale(ctx, playerId, 35, 30);

    // Arrancar dentro da janela com 2 semanas de streak, mas na 3ª moral sobe.
    setWeek(ctx, 26);
    setPlayerMorale(ctx, playerId, 30);
    await stepWeek(ctx, 10);
    setPlayerMorale(ctx, playerId, 30);
    await stepWeek(ctx, 11);
    setPlayerMorale(ctx, playerId, 80);
    const r3 = await stepWeek(ctx, 12);
    expect(r3.newlyAnnouncedRetirementIds).not.toContain(playerId);
    expect(getAnnouncedFlag(ctx, playerId)).toBe(0);
    expect(getStreak(ctx, playerId)).toBe(0);
  }, 30_000);

  it('moral baixa antes da janela: não dispara (streak acumula mas sem anúncio)', async () => {
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAgeAndMorale(ctx, playerId, 35, 30);

    setWeek(ctx, 10);
    for (let i = 0; i < 5; i++) {
      setPlayerMorale(ctx, playerId, 30);
      const r = await stepWeek(ctx, 200 + i);
      expect(r.newlyAnnouncedRetirementIds).not.toContain(playerId);
    }
    expect(getAnnouncedFlag(ctx, playerId)).toBe(0);
    expect(getStreak(ctx, playerId)).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('moral baixa após a janela: não dispara', async () => {
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAgeAndMorale(ctx, playerId, 35, 80); // começa alta

    setWeek(ctx, 37); // logo depois da janela (36 é último dia)
    setPlayerMorale(ctx, playerId, 30);
    for (let i = 0; i < 5; i++) {
      setPlayerMorale(ctx, playerId, 30);
      const r = await stepWeek(ctx, 400 + i);
      expect(r.newlyAnnouncedRetirementIds).not.toContain(playerId);
    }
    expect(getAnnouncedFlag(ctx, playerId)).toBe(0);
  }, 30_000);

  it('streak oscilante (baixa 2 → alta 1 → baixa 2) não persiste: não dispara', async () => {
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAgeAndMorale(ctx, playerId, 35, 30);

    setWeek(ctx, 26);
    const seq = [30, 30, 80, 30, 30];
    for (let i = 0; i < seq.length; i++) {
      setPlayerMorale(ctx, playerId, seq[i]);
      const r = await stepWeek(ctx, 700 + i);
      expect(r.newlyAnnouncedRetirementIds).not.toContain(playerId);
    }
    expect(getAnnouncedFlag(ctx, playerId)).toBe(0);
    // Após a oscilação, streak reflete as últimas 2 baixas consecutivas.
    expect(getStreak(ctx, playerId)).toBe(2);
  }, 30_000);

  it('jogador do clube IA com 41 anos aposenta ao fim da temporada (P1 compulsório global)', async () => {
    // Pega um jogador de clube != playerClubId.
    const row = ctx.rawDb
      .prepare('SELECT id, club_id FROM players WHERE club_id != ? AND is_free_agent = 0 LIMIT 1')
      .get(ctx.playerClubId) as { id: number; club_id: number } | undefined;
    if (!row) throw new Error('no AI club player found');
    const aiPlayerId = row.id;
    setPlayerAge(ctx, aiPlayerId, MAX_PLAYER_AGE);

    let isEnd = false;
    let guard = 0;
    while (!isEnd && guard < 60) {
      const r = await stepWeek(ctx, 900 + guard);
      isEnd = r.isSeasonEnd;
      guard++;
    }
    expect(isEnd).toBe(true);
    expect(getPlayerClub(ctx, aiPlayerId)).toBeNull();
  }, 60_000);

  it('jogador do clube do player com 41 anos aposenta (regressão P1)', async () => {
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAgeAndMorale(ctx, playerId, MAX_PLAYER_AGE, 80);

    let isEnd = false;
    let guard = 0;
    while (!isEnd && guard < 60) {
      const r = await stepWeek(ctx, 555 + guard);
      isEnd = r.isSeasonEnd;
      guard++;
    }
    expect(isEnd).toBe(true);
    expect(getPlayerClub(ctx, playerId)).toBeNull();
  }, 60_000);

  it('aposentado não ganha idade na virada de temporada (regressão D1)', async () => {
    // Aposenta explicitamente um jogador e guarda a idade atual.
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAge(ctx, playerId, 32);
    await retirePlayer(ctx.db, ctx.saveId, playerId);
    expect(getPlayerClub(ctx, playerId)).toBeNull();
    const ageBefore = (ctx.rawDb
      .prepare('SELECT age FROM players WHERE id = ?')
      .get(playerId) as { age: number }).age;

    // Simula a rotina de age+1 que roda em handleContinue na virada.
    await ctx.db
      .prepare('UPDATE players SET age = age + 1 WHERE club_id IS NOT NULL OR is_free_agent = 1')
      .run();

    const ageAfter = (ctx.rawDb
      .prepare('SELECT age FROM players WHERE id = ?')
      .get(playerId) as { age: number }).age;
    expect(ageAfter).toBe(ageBefore);
  }, 30_000);

  it('flag will_retire_at_season_end persiste após transferência pra clube da IA (D3)', async () => {
    // 35a morale 30 no clube do player, avança até anúncio.
    const playerId = pickPlayerInClub(ctx, ctx.playerClubId);
    setPlayerAgeAndMorale(ctx, playerId, 35, 30);

    setWeek(ctx, 23);
    let announced = false;
    let guard = 0;
    while (!announced && guard < 40) {
      setPlayerMorale(ctx, playerId, 30);
      const r = await stepWeek(ctx, 1000 + guard);
      if (r.newlyAnnouncedRetirementIds.includes(playerId)) announced = true;
      if (r.isSeasonEnd) break;
      guard++;
    }
    expect(announced).toBe(true);
    expect(getAnnouncedFlag(ctx, playerId)).toBe(1);

    // Transfere o jogador pra um clube da IA (UPDATE direto).
    const aiClub = ctx.rawDb
      .prepare('SELECT id FROM clubs WHERE id != ? LIMIT 1')
      .get(ctx.playerClubId) as { id: number } | undefined;
    if (!aiClub) throw new Error('no AI club available');
    ctx.rawDb
      .prepare('UPDATE players SET club_id = ? WHERE id = ?')
      .run(aiClub.id, playerId);
    expect(getPlayerClub(ctx, playerId)).toBe(aiClub.id);
    // Flag preserved.
    expect(getAnnouncedFlag(ctx, playerId)).toBe(1);

    // Avança até o fim da temporada.
    let isEnd = false;
    let seasonEndResult: Awaited<ReturnType<typeof stepWeek>> | null = null;
    guard = 0;
    while (!isEnd && guard < 60) {
      const r = await stepWeek(ctx, 2000 + guard);
      if (r.isSeasonEnd) seasonEndResult = r;
      isEnd = r.isSeasonEnd;
      guard++;
    }
    expect(isEnd).toBe(true);
    // Aposentado mesmo estando no clube da IA.
    expect(getPlayerClub(ctx, playerId)).toBeNull();
    expect(seasonEndResult?.retiringPlayerIds).toContain(playerId);
  }, 60_000);
});
