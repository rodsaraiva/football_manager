/** Can the buyer pay `fee` and still keep at least `minFloor` in the budget?
 *  A zero fee is always affordable. Default floor is 0 (budget may not go negative). */
export function canAffordTransfer(buyerBudget: number, fee: number, minFloor = 0): boolean {
  if (fee <= 0) return true;
  return buyerBudget - fee >= minFloor;
}

/** Does the added weekly wage fit under the wage budget given the current bill?
 *  A wageBudget <= 0 is treated as "no cap" so legacy saves aren't blocked. */
export function canAffordWage(currentWageBill: number, wageBudget: number, addedWage: number): boolean {
  if (wageBudget <= 0) return true;
  return currentWageBill + addedWage <= wageBudget;
}
