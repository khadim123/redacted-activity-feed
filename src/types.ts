export interface RawEvent {
  id: string;
  org_id: string;
  user_id: string;
  app: string;
  ts: string;
  label: string;
  text: string;
}

export interface StoredEvent extends RawEvent {
  redactions: number;
}
