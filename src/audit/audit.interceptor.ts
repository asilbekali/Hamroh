import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { AuditService } from './audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records every write the API accepts — and every one it refuses.
 *
 * Sitting in front of all controllers means nothing has to remember to log
 * itself, so a new endpoint is covered the day it is added.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthUser }>();
    const method = request.method.toUpperCase();

    if (!MUTATING.has(method)) return next.handle();

    const path = request.originalUrl ?? request.url;

    return from(this.audit.snapshot(method, path)).pipe(
      switchMap((snapshot) =>
        next.handle().pipe(
          tap({
            next: (body) => {
              void this.audit.record({
                method,
                path,
                statusCode: http.getResponse<Response>().statusCode,
                actor: request.user,
                body,
                snapshot,
              });
            },
            error: (error: { status?: number }) => {
              void this.audit.record({
                method,
                path,
                statusCode: error?.status ?? 500,
                actor: request.user,
                snapshot,
              });
            },
          }),
        ),
      ),
    );
  }
}
