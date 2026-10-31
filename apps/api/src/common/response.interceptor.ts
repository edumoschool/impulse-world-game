import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  type CustomDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiSuccess } from '@impulse/contracts';
import { map, type Observable } from 'rxjs';
import { Paginated } from './paginated.js';
import { currentRequestId } from './request-context.js';

const RAW_RESPONSE = 'impulse:raw-response';

/** Opts a route out of the envelope, for machine formats such as Prometheus metrics. */
export const RawResponse = (): CustomDecorator => SetMetadata(RAW_RESPONSE, true);

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) {
      return next.handle();
    }
    return next.handle().pipe(map((value: unknown) => wrap(value)));
  }
}

function wrap(value: unknown): ApiSuccess<unknown> {
  const meta = { requestId: currentRequestId() };
  if (value instanceof Paginated) {
    const { items, total, page, pageSize } = value;
    return { success: true, data: items, meta: { ...meta, total, page, pageSize } };
  }
  return { success: true, data: value ?? null, meta };
}
