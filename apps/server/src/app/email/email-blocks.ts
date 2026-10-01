export type EmailBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' }
  | { type: 'columns'; columns: Array<{ text: string }> }
  | {
      type: 'attachment';
      filename: string;
      url?: string;
      contentBase64?: string;
    };

export type EmailKind = 'transactional' | 'marketing';

export const PLACEHOLDER_KEYS = [
  'firstName',
  'track',
  'amount',
  'reference',
  'cutoffDate',
  'payLink',
] as const;
