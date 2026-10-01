export type OrganizationSettings = {
  retentionAbandonedDays: number;
  retentionPaidDays: number;
  legalEntityName: string;
  rcNumber: string;
  taxId: string;
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string;
  privacyUrl: string;
  marketingPolicyUrl: string;
};

export const ORGANIZATION_SETTING_KEY = 'organization';

export const ORGANIZATION_SETTING_DEFAULTS: OrganizationSettings = {
  retentionAbandonedDays: 90,
  retentionPaidDays: 2555,
  legalEntityName: '',
  rcNumber: '',
  taxId: '',
  termsVersion: '',
  privacyVersion: '',
  termsUrl: '',
  privacyUrl: '',
  marketingPolicyUrl: '',
};
