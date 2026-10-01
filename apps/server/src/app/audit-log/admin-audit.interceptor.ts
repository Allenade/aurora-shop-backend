import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditLogType } from '@app/shared';
import { Observable, tap } from 'rxjs';
import { currentRequestContext } from '../../common/request-context';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: { sub?: string };
      params?: { id?: string };
    }>();
    const store = currentRequestContext();
    if (store && request.user?.sub && !store.userId) {
      store.userId = request.user.sub;
    }
    const path = request.originalUrl || request.url || '';
    const isAdminView =
      request.method === 'GET' &&
      path.includes('/admin/') &&
      !!request.user?.sub;

    return next.handle().pipe(
      tap(() => {
        if (!isAdminView) return;
        this.audit.log({
          type: AuditLogType.ACCESS,
          action: 'VIEW',
          userId: request.user?.sub,
          resourceType: resourceFromPath(path),
          resourceId: request.params?.id,
        });
      }),
    );
  }
}

function resourceFromPath(path: string): string {
  if (path.includes('/audit-logs')) return 'audit_log';
  if (path.includes('/courses')) return 'course';
  if (path.includes('/emails')) return 'email';
  if (path.includes('/refunds')) return 'refund';
  if (path.includes('/compliance')) return 'compliance';
  if (path.includes('/settings')) return 'setting';
  if (path.includes('/enter-first')) return 'enter_first_enrollment';
  return 'admin';
}
