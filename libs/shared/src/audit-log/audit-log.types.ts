export enum AuditLogType {
  ACCESS = 'access',
  MUTATION = 'mutation',
  PAYMENT = 'payment',
}

export enum AccessAuditAction {
  LOGIN = 'LOGIN',
  LOGIN_DENIED = 'LOGIN_DENIED',
  LOGOUT = 'LOGOUT',
  REFRESH = 'REFRESH',
  OTP_REQUEST = 'OTP_REQUEST',
  ACCESS_DENIED = 'ACCESS_DENIED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
}

export enum PaymentAuditAction {
  CREATED = 'PAYMENT_CREATED',
  SUCCESS = 'PAYMENT_SUCCESS',
  FAILED = 'PAYMENT_FAILED',
  REFUNDED = 'PAYMENT_REFUNDED',
  CANCELLED = 'PAYMENT_CANCELLED',
}

export type AuditLogEntry = {
  type: AuditLogType;
  action: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  decision?: 'allow' | 'deny';
  reason?: string;
  metadata?: Record<string, unknown>;
};
