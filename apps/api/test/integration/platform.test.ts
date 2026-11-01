import { randomUUID } from 'node:crypto';
import { ModulesContainer } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import type { DomainEventEnvelope } from '@impulse/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ACCESS_METADATA } from '../../src/common/decorators.js';
import { APP_CONFIG, type AppConfig } from '../../src/config/app-config.js';
import { buildOpenApiDocument } from '../../src/configure-app.js';
import { RateLimiter } from '../../src/infrastructure/cache/rate-limiter.js';
import { RedisService } from '../../src/infrastructure/cache/redis.service.js';
import { TenantCache } from '../../src/infrastructure/cache/tenant-cache.js';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import { TenantDatabase } from '../../src/infrastructure/database/tenant-database.js';
import {
  EventDispatcher,
  type EventConsumer,
} from '../../src/infrastructure/events/event-consumer.js';
import {
  bullConnection,
  DOMAIN_EVENTS_QUEUE,
  EventPublisher,
} from '../../src/infrastructure/events/event-publisher.js';
import { OutboxRelay } from '../../src/infrastructure/events/outbox-relay.js';
import { OutboxWriter } from '../../src/infrastructure/events/outbox-writer.js';
import { createTestApp, dataOf, registerAdult, type TestApp, url } from '../support/test-app.js';

let ctx: TestApp;
let config: AppConfig;

beforeAll(async () => {
  ctx = await createTestApp();
  config = ctx.app.get<AppConfig>(APP_CONFIG);
});
afterAll(() => ctx.close());

describe('route access rules', () => {
  function routes() {
    const found: { name: string; rule: unknown }[] = [];
    const controllers = [...ctx.app.get(ModulesContainer).values()].flatMap((module) => [
      ...module.controllers.values(),
    ]);
    for (const wrapper of controllers) {
      const prototype = (wrapper.metatype as { prototype?: object } | null)?.prototype;
      if (!prototype) {
        continue;
      }
      for (const key of Object.getOwnPropertyNames(prototype)) {
        const method = (prototype as Record<string, unknown>)[key];
        if (key === 'constructor' || typeof method !== 'function') {
          continue;
        }
        if (Reflect.getMetadata('path', method) === undefined) {
          continue;
        }
        found.push({
          name: `${wrapper.name}.${key}`,
          rule:
            (Reflect.getMetadata(ACCESS_METADATA, method) as unknown) ??
            (Reflect.getMetadata(ACCESS_METADATA, wrapper.metatype as object) as unknown),
        });
      }
    }
    return found;
  }

  it('finds the controllers it is meant to check', () => {
    expect(routes().length).toBeGreaterThan(25);
  });

  it('gives every route an explicit access rule', () => {
    expect(routes().filter((route) => !route.rule)).toEqual([]);
  });

  it('keeps the list of public routes short and deliberate', () => {
    const publicRoutes = routes()
      .filter((route) => (route.rule as { type: string }).type === 'public')
      .map((route) => route.name)
      .sort();
    expect(publicRoutes).toEqual([
      'AuthController.forgotPassword',
      'AuthController.login',
      'AuthController.refresh',
      'AuthController.resetPassword',
      'ChildrenController.login',
      'HealthController.live',
      'HealthController.prometheus',
      'HealthController.ready',
      'OnboardingController.register',
    ]);
  });

  it('rejects anonymous access to a protected route', async () => {
    await ctx.http().get(url('/children')).expect(401);
  });
});

describe('HTTP conventions', () => {
  it('wraps success in the standard envelope with a request id', async () => {
    const response = await ctx.http().get(url('/health/live')).expect(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
  });

  it('wraps errors the same way', async () => {
    const response = await ctx.http().get(url('/no/such/route')).expect(404);
    expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('describes validation failures without echoing input', async () => {
    const response = await ctx
      .http()
      .post(url('/auth/login'))
      .send({ email: 'not-an-email', password: 'secret-value-here' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(response.body)).not.toContain('secret-value-here');
  });

  it('answers malformed JSON with 400, not 500', async () => {
    await ctx
      .http()
      .post(url('/auth/login'))
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
  });

  it('refuses a body over the size limit', async () => {
    await ctx
      .http()
      .post(url('/auth/login'))
      .send({ email: 'a@example.test', password: 'x'.repeat(2 * 1024 * 1024) })
      .expect(413);
  });

  it('sets security headers and hides the framework', async () => {
    const response = await ctx.http().get(url('/health/live')).expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows credentialed CORS only from the web origin', async () => {
    const allowed = await ctx
      .http()
      .options(url('/auth/login'))
      .set('Origin', config.WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe(config.WEB_ORIGIN);

    const denied = await ctx
      .http()
      .options(url('/auth/login'))
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('paginates list responses', async () => {
    const adult = await registerAdult(ctx);
    const response = await ctx
      .http()
      .get(url('/audit-logs?pageSize=1'))
      .set({ Authorization: `Bearer ${adult.accessToken}` })
      .expect(200);
    expect(dataOf<unknown[]>(response)).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 1 });
    expect(response.body.meta.total).toBeGreaterThanOrEqual(1);
  });
});

describe('OpenAPI', () => {
  it('documents the API from the shared schemas', () => {
    const document = buildOpenApiDocument(ctx.app);
    const login = document.paths['/api/v1/auth/login']?.post;
    expect(login).toBeDefined();
    expect(JSON.stringify(login?.requestBody)).toContain('password');
    expect(Object.keys(document.paths).length).toBeGreaterThan(15);
  });
});

describe('health and metrics', () => {
  it('reports ready when dependencies respond', async () => {
    await ctx.http().get(url('/health/ready')).expect(200);
  });

  it('protects metrics with a token', async () => {
    await ctx.http().get(url('/metrics')).expect(401);
    await ctx.http().get(url('/metrics')).set('Authorization', 'Bearer wrong').expect(401);
  });

  it('exposes metrics, using route templates so that no ids reach labels', async () => {
    const adult = await registerAdult(ctx);
    await ctx
      .http()
      .get(url(`/children/${randomUUID()}`))
      .set({ Authorization: `Bearer ${adult.accessToken}` })
      .expect(404);
    const metrics = await ctx
      .http()
      .get(url('/metrics'))
      .set('Authorization', `Bearer ${config.METRICS_TOKEN}`)
      .expect(200);
    expect(metrics.text).toContain('http_request_duration_seconds');
    expect(metrics.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
  });
});

describe('rate limiter on Redis', () => {
  it('blocks past the limit, then reports when to retry', async () => {
    // Other tests raise limits through the multiplier, so this one uses the real limit.
    const limiter = new RateLimiter(ctx.app.get(RedisService), {
      ...config,
      RATE_LIMIT_MULTIPLIER: 1,
    });
    const key = `test:${randomUUID()}`;
    expect((await limiter.hit(key, 2, 60)).allowed).toBe(true);
    expect((await limiter.hit(key, 2, 60)).allowed).toBe(true);

    const blocked = await limiter.hit(key, 2, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts atomically under concurrency', async () => {
    const limiter = ctx.app.get(RateLimiter);
    const key = `test:${randomUUID()}`;
    await Promise.all(Array.from({ length: 50 }, () => limiter.hit(key, 1, 60)));
    const redis = ctx.app.get(RedisService);
    expect(await redis.client.get(`ratelimit:${key}`)).toBe('50');
  });

  it('expires the window', async () => {
    const limiter = ctx.app.get(RateLimiter);
    const redis = ctx.app.get(RedisService);
    const key = `test:${randomUUID()}`;
    await limiter.hit(key, 1, 1);
    await vi.waitFor(async () => expect(await redis.client.exists(`ratelimit:${key}`)).toBe(0), {
      timeout: 5000,
      interval: 100,
    });
  });
});

describe('tenant cache', () => {
  it('keeps the same logical key separate between tenants', async () => {
    const cache = ctx.app.get(TenantCache);
    const [first, second] = [randomUUID(), randomUUID()];
    await cache.set(first, ['profile'], { owner: 'first' }, 60);
    await cache.set(second, ['profile'], { owner: 'second' }, 60);
    expect(await cache.get(first, ['profile'])).toEqual({ owner: 'first' });
    expect(await cache.get(second, ['profile'])).toEqual({ owner: 'second' });
  });
});

describe('transactional outbox', () => {
  const newEvent = (tenantId: string | null = null) => ({
    type: 'tenant.created' as const,
    aggregateId: randomUUID(),
    tenantId,
    payload: { tenantId: randomUUID(), kind: 'FAMILY' },
  });

  async function appendEvent(aggregateTenant: string | null = null) {
    const event = newEvent(aggregateTenant);
    await ctx.app
      .get(TenantDatabase)
      .run({ tenantId: aggregateTenant }, (tx) => ctx.app.get(OutboxWriter).append(tx, event));
    return event;
  }

  it('discards the event when the transaction rolls back', async () => {
    const event = newEvent();
    await expect(
      ctx.app.get(TenantDatabase).run({}, async (tx) => {
        await ctx.app.get(OutboxWriter).append(tx, event);
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow();
    const stored = await ctx.app
      .get(SystemDatabase)
      .client.outboxEvent.count({ where: { aggregateId: event.aggregateId } });
    expect(stored).toBe(0);
  });

  it('rejects a payload that breaks the contract', async () => {
    await expect(
      ctx.app.get(TenantDatabase).run({}, (tx) =>
        ctx.app.get(OutboxWriter).append(tx, {
          type: 'child.authorized',
          aggregateId: randomUUID(),
          tenantId: null,
          payload: { childId: 'not-a-uuid', consentId: 'nope' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('keeps a row unpublished when the publisher fails, then retries it', async () => {
    const event = await appendEvent();
    const system = ctx.app.get(SystemDatabase);
    const failing = new (class extends EventPublisher {
      async publish(): Promise<void> {
        throw new Error('queue down');
      }
    })();
    await expect(new OutboxRelay(system, failing).drain()).rejects.toThrow('queue down');
    const row = await system.client.outboxEvent.findFirstOrThrow({
      where: { aggregateId: event.aggregateId },
    });
    expect(row.publishedAt).toBeNull();

    // The relay publishes oldest first, one batch per call. Earlier test files leave a varying
    // backlog, so drain until it is empty rather than assume one batch reaches this event.
    while ((await ctx.app.get(OutboxRelay).drain(1000)) > 0) {
      // keep draining
    }
    const published = await system.client.outboxEvent.findFirstOrThrow({
      where: { aggregateId: event.aggregateId },
    });
    expect(published.publishedAt).not.toBeNull();
  });

  it('never publishes one event twice from concurrent relays', async () => {
    const events = await Promise.all(Array.from({ length: 20 }, () => appendEvent()));
    const system = ctx.app.get(SystemDatabase);
    const published: string[] = [];
    const recording = new (class extends EventPublisher {
      async publish(batch: DomainEventEnvelope[]): Promise<void> {
        published.push(...batch.map((event) => event.aggregateId));
      }
    })();
    const relay = new OutboxRelay(system, recording);
    await Promise.all(Array.from({ length: 4 }, () => relay.drain(1000)));

    const ours = published.filter((id) => events.some((event) => event.aggregateId === id));
    expect(ours).toHaveLength(new Set(ours).size);
  });

  it('delivers through a real queue to a worker', async () => {
    // Jobs left by earlier runs are consumed first, so start this test's Redis database clean.
    const connection = bullConnection(config.REDIS_URL);
    const queue = new Queue(DOMAIN_EVENTS_QUEUE, { connection });
    await queue.obliterate({ force: true });
    await queue.close();

    const event = await appendEvent();
    let worker: Worker | undefined;
    const received = new Promise<DomainEventEnvelope>((resolve) => {
      worker = new Worker(
        DOMAIN_EVENTS_QUEUE,
        async (job) => {
          const data = job.data as DomainEventEnvelope;
          if (data.aggregateId === event.aggregateId) {
            resolve(data);
          }
        },
        { connection, concurrency: 20 },
      );
    });
    try {
      while ((await ctx.app.get(OutboxRelay).drain(1000)) > 0);
      await expect(received).resolves.toMatchObject({
        type: 'tenant.created',
        aggregateId: event.aggregateId,
        version: 1,
      });
    } finally {
      await worker?.close();
    }
  });

  describe('idempotent consumers', () => {
    const consumerFor = (handle: EventConsumer['handle']): EventConsumer => ({
      name: `test-consumer-${randomUUID()}`,
      eventTypes: ['tenant.created'],
      handle,
    });

    const envelope = (tenantId: string | null = null): DomainEventEnvelope => ({
      id: randomUUID(),
      type: 'tenant.created',
      version: 1,
      aggregateId: randomUUID(),
      tenantId,
      occurredAt: new Date().toISOString(),
      correlationId: 'test',
      payload: { tenantId: randomUUID(), kind: 'FAMILY' },
    });

    it('applies an event once, however many times it is delivered', async () => {
      const handle = vi.fn(async () => {});
      const dispatcher = new EventDispatcher(ctx.app.get(TenantDatabase), [consumerFor(handle)]);
      const event = envelope();
      await dispatcher.dispatch(event);
      await dispatcher.dispatch(event);
      await dispatcher.dispatch(event);
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it('allows a retry after a failure, since the claim rolls back with the work', async () => {
      const handle = vi
        .fn<EventConsumer['handle']>()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(undefined);
      const dispatcher = new EventDispatcher(ctx.app.get(TenantDatabase), [consumerFor(handle)]);
      const event = envelope();
      await expect(dispatcher.dispatch(event)).rejects.toThrow('transient');
      await dispatcher.dispatch(event);
      expect(handle).toHaveBeenCalledTimes(2);
    });

    it('runs each consumer in the tenant context carried by the event', async () => {
      const adult = await registerAdult(ctx);
      let seen: string | undefined;
      const dispatcher = new EventDispatcher(ctx.app.get(TenantDatabase), [
        consumerFor(async (_event, tx) => {
          const [row] = await tx.$queryRaw<{ tenant: string }[]>`
            SELECT app_current_tenant()::text AS tenant`;
          seen = row?.tenant;
        }),
      ]);
      await dispatcher.dispatch(envelope(adult.tenantId));
      expect(seen).toBe(adult.tenantId);
    });

    it('rejects a malformed envelope', async () => {
      const dispatcher = new EventDispatcher(ctx.app.get(TenantDatabase), []);
      await expect(dispatcher.dispatch({ id: 'nonsense' })).rejects.toThrow();
    });
  });
});
