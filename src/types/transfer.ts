export type TransferType = 'transfer' | 'loan' | 'free' | 'release';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered';

export interface Transfer {
  id: number;
  playerId: number;
  season: number;
  fromClubId: number;
  toClubId: number;
  fee: number;
  wageOffered: number;
  type: TransferType;
  loanEnd: number | null;
}

export interface TransferOffer {
  id: number;
  playerId: number;
  offeringClubId: number;
  sellingClubId: number;
  feeOffered: number;
  wageOffered: number;
  status: OfferStatus;
  responseWeek: number | null;
  offerType: TransferType;
  loanEnd: number | null;
}
