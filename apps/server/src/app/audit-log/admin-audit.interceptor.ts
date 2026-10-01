import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditLogType } from '@app/shared';
import { Observable, tap } from 'rxjs';
import { clientIpFromRequest } from '../../common/http/client-ip';
import { AuditLogService } from './audit-log.service';

const WATCHED = [
  '/admin/enter-first',
  '/admin/courses',
  '/admin/emails',
  '/admin/refunds',
  '/admin/compliance',
  '/admin/audit-logs',
  '/admin/settings',
];

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
      user?: { sub?: string };
      headers: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string | null };
    }>();
    const path = req.originalUrl || req.url || '';
    if (!WATCHED.some((prefix) => path.includes(prefix))) return next.handle();
    if (path.includes('/admin/audit-logs') && req.method === 'GET') {
      return next.handle();
    }
    return next.handle().pipe(
      tap(() => {
        const mutating = req.method !== 'GET' && req.method !== 'HEAD';
        this.audit.log({
          type: mutating ? AuditLogType.MUTATION : AuditLogType.ACCESS,
          action: mutating ? 'ADMIN_CHANGE' : 'ADMIN_VIEW',
          userId: req.user?.sub,
          resourceType: resourceFromPath(path),
          ip: clientIpFromRequest(req),
          userAgent: header(req.headers['user-agent']),
          requestId: header(req.headers['x-request-id']),
          metadata: { method: req.method, path: path.split('?')[0] },
        });
      }),
    );
  }
}

function header(value?: string | string[]) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function resourceFromPath(path: string) {
  if (path.includes('/enter-first')) return 'enrollment';
  if (path.includes('/courses')) return 'course';
  if (path.includes('/emails')) return 'email';
  if (path.includes('/refunds')) return 'refund';
  if (path.includes('/compliance')) return 'compliance';
  if (path.includes('/settings')) return 'settings';
  if (path.includes('/audit-logs')) return 'audit';
  return 'admin';
}
