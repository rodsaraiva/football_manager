import { maybeGenerateComment, CommentContext } from '@/engine/assistant/comment-generator';
import { SeededRng } from '@/engine/rng';
import { AssistantWithQuality } from '@/types/assistant';

const baseAssistant: AssistantWithQuality = {
  id: 1,
  clubId: 1,
  saveId: 1,
  role: 'squad',
  name: 'Alan Bright',
  age: 45,
  archetype: 'analytics',
  seasonsAtClub: 2,
  retirementAge: 65,
  wagePerMonth: 8000,
  willRetireNextSeason: false,
  qualityStars: 2,
};

const baseContext: CommentContext = {
  leaguePosition: 5,
  totalTeams: 20,
  week: 10,
  season: 1,
  budgetBalance: 50000,
  squadAvgAge: 26,
  topYouthPotential: 80,
};

describe('maybeGenerateComment', () => {
  it('returns null when rng chance does not activate', () => {
    // Use a seed that produces a number above 0.15 for the first call
    // We try many seeds until we find one that returns null
    let foundNull = false;
    for (let seed = 0; seed < 100; seed++) {
      const result = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(seed));
      if (result === null) { foundNull = true; break; }
    }
    expect(foundNull).toBe(true);
  });

  it('returns a comment when rng activates', () => {
    let foundComment = false;
    for (let seed = 0; seed < 100; seed++) {
      const result = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(seed));
      if (result !== null) { foundComment = true; break; }
    }
    expect(foundComment).toBe(true);
  });

  it('comment includes assistantId and assistantName', () => {
    let comment = null;
    for (let seed = 0; seed < 200; seed++) {
      comment = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(seed));
      if (comment) break;
    }
    expect(comment).not.toBeNull();
    expect(comment!.assistantId).toBe(1);
    expect(comment!.assistantName).toBe('Alan Bright');
  });

  it('comment text is non-empty', () => {
    let comment = null;
    for (let seed = 0; seed < 200; seed++) {
      comment = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(seed));
      if (comment) break;
    }
    expect(comment!.text.length).toBeGreaterThan(0);
  });

  it('comment role matches assistant role', () => {
    let comment = null;
    for (let seed = 0; seed < 200; seed++) {
      comment = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(seed));
      if (comment) break;
    }
    expect(comment!.role).toBe('squad');
  });

  it('financial assistant generates finance-related comment', () => {
    const financial = { ...baseAssistant, role: 'financial' as const, archetype: 'pragmatic' as const };
    let comment = null;
    for (let seed = 0; seed < 200; seed++) {
      comment = maybeGenerateComment(financial, { ...baseContext, budgetBalance: -10000 }, new SeededRng(seed));
      if (comment) break;
    }
    expect(comment).not.toBeNull();
    expect(comment!.role).toBe('financial');
  });

  it('youth assistant generates youth-related comment', () => {
    const youth = { ...baseAssistant, role: 'youth' as const, archetype: 'developer' as const };
    let comment = null;
    for (let seed = 0; seed < 200; seed++) {
      comment = maybeGenerateComment(youth, baseContext, new SeededRng(seed));
      if (comment) break;
    }
    expect(comment).not.toBeNull();
    expect(comment!.role).toBe('youth');
  });

  it('is deterministic for same seed', () => {
    const a = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(5));
    const b = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(5));
    expect(a?.text).toBe(b?.text);
  });
});
