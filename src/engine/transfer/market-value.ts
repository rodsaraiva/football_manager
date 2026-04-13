export interface MarketValueInput {
  overall: number;
  effectivePotential: number;
  age: number;
  contractYearsLeft: number;
}

export function calculateMarketValue(input: MarketValueInput): number {
  let base = Math.pow(input.overall / 10, 3) * 100000;

  if (input.age <= 21) base *= 1.5;
  else if (input.age <= 25) base *= 1.3;
  else if (input.age <= 28) base *= 1.1;
  else if (input.age <= 30) base *= 0.8;
  else if (input.age <= 33) base *= 0.5;
  else base *= 0.3;

  const potentialGap = Math.max(0, input.effectivePotential - input.overall);
  base *= 1 + potentialGap * 0.03;

  if (input.contractYearsLeft <= 1) base *= 0.6;
  else if (input.contractYearsLeft <= 2) base *= 0.8;

  return Math.round(base / 10000) * 10000;
}
