import type { TextDescriptor } from '@/i18n/translate';

export type InboxCategory =
  | 'board' | 'contract' | 'loan' | 'sponsor' | 'scout' | 'injury' | 'transfer';

export type InboxActionKind =
  | 'none'
  | 'offer_response'
  | 'job_offer_response'
  | 'contract_renew'
  | 'acknowledge';

export type InboxActionChoice = 'accept' | 'reject' | 'counter' | 'open' | 'ack';

export type InboxRefKind = 'transfer_offer' | 'job_offer' | 'player' | 'none';

export interface InboxMessage {
  id: number;
  threadId: number;
  season: number;
  week: number;
  title: TextDescriptor;
  body: TextDescriptor;
  icon: string;
  fromSelf: boolean;
}

export interface InboxThread {
  id: number;
  category: InboxCategory;
  refKind: InboxRefKind;
  refId: number | null;
  actionKind: InboxActionKind;
  status: 'open' | 'resolved' | 'expired';
  deadlineSeason: number | null;
  deadlineWeek: number | null;
  read: boolean;
  lastSeason: number;
  lastWeek: number;
}

export interface InboxThreadView extends InboxThread {
  messages: InboxMessage[];
}
