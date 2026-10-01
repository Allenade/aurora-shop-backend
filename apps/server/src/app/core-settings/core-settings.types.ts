export type CoreSettingsValue = {
  retentionEnrollmentDays: number;
  retentionAuditDays: number;
  retentionEmailDays: number;
  dataRequestDueDays: number;
  legalEntityName: string;
  rcNumber: string;
  taxId: string;
  termsVersion: string;
  termsUrl: string;
  privacyVersion: string;
  privacyUrl: string;
};

export const DEFAULT_CORE_SETTINGS: CoreSettingsValue = {
  retentionEnrollmentDays: 1095,
  retentionAuditDays: 365,
  retentionEmailDays: 180,
  dataRequestDueDays: 30,
  legalEntityName: '',
  rcNumber: '',
  taxId: '',
  termsVersion: '1.0',
  termsUrl: '',
  privacyVersion: '1.0',
  privacyUrl: '',
};
