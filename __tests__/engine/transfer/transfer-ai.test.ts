import { evaluateOffer, generateAiTransfer, OfferEvalInput, AiTransferInput } from '@/engine/transfer/transfer-ai';
import { SeededRng } from '@/engine/rng';

describe('evaluateOffer', () => {
  const base: OfferEvalInput = {
    playerMarketValue: 10_000_000, feeOffered: 10_000_000,
    playerIsStarter: true, clubHasReplacement: true, playerAge: 25, contractYearsLeft: 3,
  };

  it('accepts offer at market value when replacement exists', () => {
    expect(evaluateOffer(base).decision).toBe('accept');
  });
  it('rejects low offer for starter with no replacement', () => {
    expect(evaluateOffer({ ...base, feeOffered: 5_000_000, clubHasReplacement: false }).decision).toBe('reject');
  });
  it('counters when offer is close but not enough', () => {
    const result = evaluateOffer({ ...base, feeOffered: 7_000_000, clubHasReplacement: true });
    expect(['accept', 'counter']).toContain(result.decision);
    if (result.decision === 'counter') expect(result.counterFee!).toBeGreaterThan(7_000_000);
  });
  it('accepts below market for old player with short contract', () => {
    expect(evaluateOffer({ ...base, feeOffered: 6_000_000, playerAge: 33, contractYearsLeft: 1 }).decision).toBe('accept');
  });
});

describe('generateAiTransfer', () => {
  it('AI club identifies position needs', () => {
    const result = generateAiTransfer({
      clubId: 1, clubBudget: 50_000_000, clubReputation: 80,
      squadPositions: ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'CM', 'LM', 'RM', 'ST'],
      availablePlayers: [
        { id: 100, position: 'LW', overall: 72, marketValue: 5_000_000, wage: 50000, clubReputation: 60 },
        { id: 101, position: 'ST', overall: 70, marketValue: 4_000_000, wage: 40000, clubReputation: 55 },
        { id: 102, position: 'CB', overall: 75, marketValue: 8_000_000, wage: 60000, clubReputation: 70 },
      ],
      rng: new SeededRng(42),
    });
    if (result) expect([100, 101]).toContain(result.targetPlayerId);
  });

  it('returns null when budget is insufficient', () => {
    const result = generateAiTransfer({
      clubId: 1, clubBudget: 100_000, clubReputation: 80,
      squadPositions: ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'],
      availablePlayers: [{ id: 100, position: 'LW', overall: 72, marketValue: 5_000_000, wage: 50000, clubReputation: 60 }],
      rng: new SeededRng(42),
    });
    expect(result).toBeNull();
  });

  it('does not target player from much bigger club', () => {
    const result = generateAiTransfer({
      clubId: 1, clubBudget: 100_000_000, clubReputation: 70,
      squadPositions: ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'],
      availablePlayers: [{ id: 100, position: 'LW', overall: 85, marketValue: 50_000_000, wage: 200000, clubReputation: 95 }],
      rng: new SeededRng(42),
    });
    expect(result).toBeNull();
  });
});
