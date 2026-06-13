import {
  pressQuestionKey,
  computePressConference,
  PressMember,
  PressTone,
  PressOutcome,
} from '@/engine/press/press-engine';

const inForm = (morale = 50): PressMember => ({ id: 1, morale, recentAvgRating: 8.0 });
const outOfForm = (morale = 50): PressMember => ({ id: 2, morale, recentAvgRating: 5.0 });

// Sign expectations for the (tone × outcome) morale + confidence matrix.
// '+' positive, '-' negative, '0' neutral (zero).
const MATRIX: Record<PressTone, Record<PressOutcome, { morale: '+' | '-' | '0'; conf: '+' | '-' | '0' }>> = {
  measured: {
    win: { morale: '+', conf: '+' },
    draw: { morale: '+', conf: '+' },
    loss: { morale: '+', conf: '+' },
  },
  confident: {
    win: { morale: '+', conf: '+' },
    draw: { morale: '0', conf: '0' },
    loss: { morale: '-', conf: '-' },
  },
  defiant: {
    win: { morale: '+', conf: '-' },
    draw: { morale: '+', conf: '-' },
    loss: { morale: '+', conf: '-' },
  },
};

const TONES: PressTone[] = ['measured', 'confident', 'defiant'];
const OUTCOMES: PressOutcome[] = ['win', 'draw', 'loss'];

describe('pressQuestionKey', () => {
  it('maps each outcome to its contextual question key', () => {
    expect(pressQuestionKey('win')).toBe('press.q_win');
    expect(pressQuestionKey('draw')).toBe('press.q_draw');
    expect(pressQuestionKey('loss')).toBe('press.q_loss');
  });
});

describe('computePressConference — trade-off matrix', () => {
  for (const tone of TONES) {
    for (const outcome of OUTCOMES) {
      const expected = MATRIX[tone][outcome];

      it(`${tone} on ${outcome}: morale ${expected.morale}, confidence ${expected.conf}`, () => {
        // Use a neutral-form member so the base sign is what we read (no clamp at bounds).
        const member: PressMember = { id: 7, morale: 50, recentAvgRating: 6.5 };
        const out = computePressConference([member], tone, outcome);
        const eff = out.results[0].nextMorale - member.morale;

        if (expected.morale === '+') expect(eff).toBeGreaterThan(0);
        else if (expected.morale === '-') expect(eff).toBeLessThan(0);
        else expect(eff).toBe(0);

        if (expected.conf === '+') expect(out.confidenceDelta).toBeGreaterThan(0);
        else if (expected.conf === '-') expect(out.confidenceDelta).toBeLessThan(0);
        else expect(out.confidenceDelta).toBe(0);
      });
    }
  }

  it('keeps confidenceDelta within a modest [-4, 4] band for every cell', () => {
    for (const tone of TONES) {
      for (const outcome of OUTCOMES) {
        const out = computePressConference([inForm()], tone, outcome);
        expect(out.confidenceDelta).toBeGreaterThanOrEqual(-4);
        expect(out.confidenceDelta).toBeLessThanOrEqual(4);
      }
    }
  });

  it('emits a headline key per (tone × outcome) cell', () => {
    for (const tone of TONES) {
      for (const outcome of OUTCOMES) {
        const out = computePressConference([inForm()], tone, outcome);
        expect(out.headlineKey).toBe(`press.headline_${tone}_${outcome}`);
      }
    }
  });
});

describe('computePressConference — summary counts', () => {
  it('counts improved / worsened / unchanged from post-clamp effective change', () => {
    const roster: PressMember[] = [inForm(), outOfForm(), { id: 3, morale: 60, recentAvgRating: 7.0 }];
    const out = computePressConference(roster, 'measured', 'win');
    const total = out.summary.improved + out.summary.worsened + out.summary.unchanged;
    expect(total).toBe(roster.length);
    // measured/win lifts everyone → all improved
    expect(out.summary.improved).toBe(roster.length);
    expect(out.summary.worsened).toBe(0);
  });

  it('confident on a loss worsens morale for the squad', () => {
    const out = computePressConference([inForm(), outOfForm()], 'confident', 'loss');
    expect(out.summary.worsened).toBeGreaterThan(0);
    expect(out.summary.improved).toBe(0);
  });
});

describe('computePressConference — clamping', () => {
  it('does not push morale above 100', () => {
    const out = computePressConference([{ id: 1, morale: 99, recentAvgRating: 5.0 }], 'confident', 'win');
    expect(out.results[0].nextMorale).toBeLessThanOrEqual(100);
  });

  it('does not push morale below 1', () => {
    const out = computePressConference([{ id: 1, morale: 2, recentAvgRating: 8.0 }], 'confident', 'loss');
    expect(out.results[0].nextMorale).toBeGreaterThanOrEqual(1);
  });

  it('counts a member already at the ceiling as unchanged when delta is positive', () => {
    const out = computePressConference([{ id: 1, morale: 100, recentAvgRating: 5.0 }], 'measured', 'win');
    expect(out.summary.unchanged).toBe(1);
    expect(out.summary.improved).toBe(0);
  });
});

describe('computePressConference — form modulation', () => {
  it('a positive backing is bigger for an out-of-form player than an in-form one', () => {
    // defiant/loss = backing the players; struggling players feel it more.
    const out = computePressConference([inForm(50), outOfForm(50)], 'defiant', 'loss');
    const inF = out.results.find((r) => r.id === 1)!;
    const outF = out.results.find((r) => r.id === 2)!;
    expect(outF.nextMorale - 50).toBeGreaterThan(inF.nextMorale - 50);
  });

  it('a negative outcome stings an in-form player more than an out-of-form one', () => {
    // confident/loss = looks arrogant; the in-form (proud) player resents it more.
    const out = computePressConference([inForm(60), outOfForm(60)], 'confident', 'loss');
    const inF = out.results.find((r) => r.id === 1)!;
    const outF = out.results.find((r) => r.id === 2)!;
    expect(inF.nextMorale - 60).toBeLessThan(outF.nextMorale - 60);
  });
});
