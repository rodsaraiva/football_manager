export interface ClubAmbitionInput {
  reputation: number;    // 1..100
  divisionLevel: number; // 1 = topo
}

/**
 * Fome de contratar: um clube de reputação alta numa divisão baixa "merece mais" do que
 * tem hoje, então busca técnico com agressividade (→ 1). Um clube cuja reputação combina
 * com a divisão fica perto de 0.5. Puro e determinístico; sem rng.
 */
export function computeClubAmbition(input: ClubAmbitionInput): number {
  const rep = Math.min(100, Math.max(1, input.reputation));
  const div = Math.max(1, input.divisionLevel);
  // "merecimento" de divisão a partir da reputação: rep 100 → div 1, rep ~0 → div ~5.
  const expectedDivision = 1 + ((100 - rep) / 100) * 4; // 1..5
  const gap = div - expectedDivision;                   // >0 quando está ABAIXO (divisão pior) do que merece
  // gap ∈ [-4, +4] → escalar para 0..1 centrado em 0.5.
  return Math.min(1, Math.max(0, 0.5 + gap / 8));
}
