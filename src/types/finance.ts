export type FinanceType = 'ticket' | 'tv' | 'sponsor' | 'transfer_in' | 'transfer_out' | 'wages' | 'maintenance' | 'bonus' | 'upgrade';

export interface ClubFinance {
  clubId: number;
  season: number;
  week: number;
  type: FinanceType;
  amount: number;
  description: string;
}
