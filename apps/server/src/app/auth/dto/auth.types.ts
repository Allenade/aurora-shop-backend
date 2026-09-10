import type { UserType } from '@app/shared';

export type JwtPayload = {
  sub: string;
  email: string;
  type: UserType;
  iat?: number;
  exp?: number;
};

export type SessionRole = { id: string; name: string };
export type SessionPermission = { action: string; resource: string };
export type SessionRule = {
  action: string | string[];
  subject: string | string[];
  conditions?: Record<string, unknown>;
  inverted?: boolean;
};

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  type: UserType;
  avatarUrl?: string | null;
  roles: SessionRole[];
  permissions: SessionPermission[];
  rules: SessionRule[];
};
