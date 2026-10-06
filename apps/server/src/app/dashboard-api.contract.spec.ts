import { readFileSync } from 'fs';
import { join } from 'path';

type ExpectedRoute = {
  method: 'Get' | 'Post' | 'Patch' | 'Delete';
  path: string;
  permission?: string;
  isPublic?: boolean;
};

const CONTROLLERS = [
  'auth/auth.controller.ts',
  'course/course.controller.ts',
  'enter-first/enter-first.controller.ts',
  'compliance/compliance.controller.ts',
  'refund/refund.controller.ts',
  'email/email.controller.ts',
  'audit-log/audit-log.controller.ts',
  'org-settings/org-settings.controller.ts',
  'user/admin-user.controller.ts',
];

const DASHBOARD_ROUTES: ExpectedRoute[] = [
  { method: 'Post', path: 'auth/login', isPublic: true },
  { method: 'Post', path: 'auth/refresh', isPublic: true },
  { method: 'Get', path: 'auth/me' },
  { method: 'Post', path: 'auth/logout' },
  { method: 'Get', path: 'admin/courses', permission: 'LIST course' },
  { method: 'Post', path: 'admin/courses', permission: 'CREATE course' },
  {
    method: 'Post',
    path: 'admin/courses/reorder',
    permission: 'UPDATE course',
  },
  {
    method: 'Post',
    path: 'admin/courses/clear-all',
    permission: 'MANAGE all',
  },
  { method: 'Get', path: 'admin/courses/:id', permission: 'READ course' },
  { method: 'Patch', path: 'admin/courses/:id', permission: 'UPDATE course' },
  {
    method: 'Post',
    path: 'admin/courses/:id/archive',
    permission: 'UPDATE course',
  },
  { method: 'Delete', path: 'admin/courses/:id', permission: 'DELETE course' },
  {
    method: 'Get',
    path: 'admin/enter-first/enrollments',
    permission: 'LIST enter_first',
  },
  {
    method: 'Post',
    path: 'admin/enter-first/enrollments/clear-all',
    permission: 'MANAGE all',
  },
  {
    method: 'Get',
    path: 'admin/enter-first/enrollments/:id',
    permission: 'READ enter_first',
  },
  {
    method: 'Delete',
    path: 'admin/enter-first/enrollments/:id',
    permission: 'MANAGE all',
  },
  {
    method: 'Get',
    path: 'admin/compliance/summary',
    permission: 'READ compliance',
  },
  {
    method: 'Get',
    path: 'admin/compliance/timeline',
    permission: 'READ compliance',
  },
  {
    method: 'Get',
    path: 'admin/compliance/exceptions',
    permission: 'READ compliance',
  },
  {
    method: 'Get',
    path: 'admin/compliance/tests',
    permission: 'READ compliance',
  },
  {
    method: 'Get',
    path: 'admin/compliance/export',
    permission: 'READ compliance',
  },
  {
    method: 'Post',
    path: 'admin/compliance/enrollments/:id/reverify',
    permission: 'UPDATE enter_first',
  },
  {
    method: 'Post',
    path: 'admin/compliance/enrollments/:id/resend-confirmation',
    permission: 'UPDATE enter_first',
  },
  {
    method: 'Get',
    path: 'admin/compliance/data-requests',
    permission: 'LIST compliance',
  },
  {
    method: 'Post',
    path: 'admin/compliance/data-requests',
    permission: 'CREATE compliance',
  },
  {
    method: 'Post',
    path: 'admin/compliance/data-requests/:id/export',
    permission: 'UPDATE compliance',
  },
  {
    method: 'Post',
    path: 'admin/compliance/data-requests/:id/anonymise',
    permission: 'UPDATE compliance',
  },
  { method: 'Get', path: 'admin/refunds', permission: 'LIST refund' },
  { method: 'Post', path: 'admin/refunds', permission: 'CREATE refund' },
  { method: 'Get', path: 'admin/refunds/:id', permission: 'READ refund' },
  {
    method: 'Post',
    path: 'admin/refunds/:id/approve',
    permission: 'UPDATE refund',
  },
  {
    method: 'Post',
    path: 'admin/refunds/:id/reject',
    permission: 'UPDATE refund',
  },
  {
    method: 'Post',
    path: 'admin/refunds/:id/process',
    permission: 'UPDATE refund',
  },
  { method: 'Get', path: 'admin/emails/templates', permission: 'LIST email' },
  {
    method: 'Post',
    path: 'admin/emails/templates',
    permission: 'CREATE email',
  },
  {
    method: 'Patch',
    path: 'admin/emails/templates/:id',
    permission: 'UPDATE email',
  },
  {
    method: 'Delete',
    path: 'admin/emails/templates/:id',
    permission: 'DELETE email',
  },
  {
    method: 'Post',
    path: 'admin/emails/audience/preview',
    permission: 'READ email',
  },
  {
    method: 'Post',
    path: 'admin/emails/test-send',
    permission: 'CREATE email',
  },
  { method: 'Post', path: 'admin/emails/send', permission: 'CREATE email' },
  { method: 'Get', path: 'admin/emails/campaigns', permission: 'LIST email' },
  {
    method: 'Post',
    path: 'admin/emails/campaigns',
    permission: 'CREATE email',
  },
  {
    method: 'Get',
    path: 'admin/emails/campaigns/:id',
    permission: 'READ email',
  },
  {
    method: 'Post',
    path: 'admin/emails/campaigns/:id/pause',
    permission: 'UPDATE email',
  },
  {
    method: 'Post',
    path: 'admin/emails/campaigns/:id/resume',
    permission: 'UPDATE email',
  },
  {
    method: 'Post',
    path: 'admin/emails/campaigns/:id/cancel',
    permission: 'UPDATE email',
  },
  {
    method: 'Post',
    path: 'admin/emails/campaigns/:id/retry-failed',
    permission: 'UPDATE email',
  },
  { method: 'Get', path: 'admin/emails/messages', permission: 'LIST email' },
  {
    method: 'Get',
    path: 'admin/emails/suppressions',
    permission: 'LIST email',
  },
  { method: 'Post', path: 'admin/emails/images', permission: 'CREATE email' },
  {
    method: 'Post',
    path: 'admin/emails/attachments',
    permission: 'CREATE email',
  },
  { method: 'Get', path: 'admin/audit-logs', permission: 'LIST audit' },
  {
    method: 'Get',
    path: 'admin/settings/organization',
    permission: 'READ compliance',
  },
  {
    method: 'Patch',
    path: 'admin/settings/organization',
    permission: 'MANAGE settings',
  },
  { method: 'Delete', path: 'admin/users/:id', permission: 'MANAGE all' },
];

function joinPath(prefix: string, path: string) {
  return [prefix, path]
    .filter((part) => part && part !== '/')
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function permissionOf(block: string) {
  const match = block.match(
    /RequirePermissions\(\{\s*action:\s*Action\.(\w+),\s*resource:\s*Resource\.(\w+)/,
  );
  if (!match) return undefined;
  return `${match[1].toLowerCase()} ${match[2].toLowerCase()}`;
}

function decoratorCluster(lines: string[], index: number) {
  const cluster: string[] = [];
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor].trim();
    if (!line) continue;
    if (!line.startsWith('@')) break;
    cluster.unshift(lines[cursor]);
  }
  cluster.push(lines[index]);
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor].trim();
    if (!line) continue;
    if (!line.startsWith('@')) break;
    cluster.push(lines[cursor]);
  }
  return cluster.join('\n');
}

function routesIn(source: string) {
  const prefixMatch = source.match(/@Controller\((?:'([^']*)')?\)/);
  const prefix = prefixMatch?.[1] ?? '';
  const lines = source.split('\n');
  const routes: Array<{
    method: string;
    path: string;
    permission?: string;
    isPublic: boolean;
  }> = [];
  lines.forEach((line, index) => {
    const match = line.match(/@(Get|Post|Patch|Delete|Put)\((?:'([^']*)')?\)/);
    if (!match) return;
    const block = decoratorCluster(lines, index);
    routes.push({
      method: match[1],
      path: joinPath(prefix, match[2] ?? ''),
      permission: permissionOf(block),
      isPublic: /@Public\(/.test(block),
    });
  });
  return routes;
}

describe('dashboard API contract', () => {
  const registered = CONTROLLERS.flatMap((file) =>
    routesIn(readFileSync(join(__dirname, file), 'utf8')),
  );

  it('accepts a partial email template update', () => {
    const dto = readFileSync(join(__dirname, 'email/dto/email.dto.ts'), 'utf8');
    const controller = readFileSync(
      join(__dirname, 'email/email.controller.ts'),
      'utf8',
    );
    expect(dto).toContain(
      'export class UpdateTemplateDto extends PartialType(UpsertTemplateDto)',
    );
    expect(controller).toContain('@Body() body: UpdateTemplateDto');
  });

  it.each(DASHBOARD_ROUTES)(
    '$method $path keeps its access rule',
    (expected) => {
      const match = registered.find(
        (route) =>
          route.method === expected.method && route.path === expected.path,
      );
      expect(match).toEqual(
        expect.objectContaining({
          method: expected.method,
          path: expected.path,
          ...(expected.permission
            ? { permission: expected.permission.toLowerCase() }
            : {}),
          ...(expected.isPublic ? { isPublic: true } : {}),
        }),
      );
    },
  );
});
