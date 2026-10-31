import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type AuthResult, type ApiSuccess } from '@impulse/contracts';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp, API_PREFIX } from '../../src/configure-app.js';
import { type EmailMessage, EmailSender } from '../../src/infrastructure/email/email-sender.js';
import { ObjectStorage } from '../../src/infrastructure/storage/object-storage.js';

/** Captures outgoing mail so tests can read tokens. Only the SMTP delivery itself is replaced. */
export class CapturingEmailSender extends EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  async waitFor(to: string): Promise<EmailMessage> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const message = this.sent.findLast((candidate) => candidate.to === to);
      if (message) {
        return message;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`No email arrived for ${to}`);
  }
}

class UnusedObjectStorage extends ObjectStorage {
  put(): Promise<void> {
    throw new Error('Object storage is not used by these tests');
  }
  signedDownloadUrl(): Promise<string> {
    throw new Error('Object storage is not used by these tests');
  }
  delete(): Promise<void> {
    throw new Error('Object storage is not used by these tests');
  }
}

export interface TestApp {
  app: NestExpressApplication;
  email: CapturingEmailSender;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const email = new CapturingEmailSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailSender)
    .useValue(email)
    .overrideProvider(ObjectStorage)
    .useValue(new UnusedObjectStorage())
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();

  return { app, email, http: () => request(app.getHttpServer()), close: () => app.close() };
}

export const url = (path: string) => `/${API_PREFIX}${path}`;

let sequence = 0;

/** Unique per call and per run, so tests never collide on rows left by earlier runs. */
export function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}${Date.now().toString(36)}${sequence}`;
}

export const STRONG_PASSWORD = 'correct horse battery staple';

export interface RegisteredAdult {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
  tenantId: string;
  loginCode: string;
}

export function dataOf<T>(response: { body: unknown }): T {
  return (response.body as ApiSuccess<T>).data;
}

export async function registerAdult(ctx: TestApp, name = 'Test Adult'): Promise<RegisteredAdult> {
  const email = `${unique('adult')}@example.test`;
  const response = await ctx
    .http()
    .post(url('/auth/register'))
    .send({ email, password: STRONG_PASSWORD, displayName: name, transport: 'bearer' })
    .expect(201);
  const result = dataOf<AuthResult>(response);
  return {
    email,
    password: STRONG_PASSWORD,
    accessToken: result.accessToken as string,
    refreshToken: result.refreshToken as string,
    userId: result.user.id,
    tenantId: result.activeTenantId as string,
    loginCode: result.tenants[0]?.loginCode as string,
  };
}

export const CHILD_PASSCODE = 'sunny-otter-42';

export function childPayload(overrides: Record<string, unknown> = {}) {
  return {
    displayName: 'Young Explorer',
    username: unique('kid'),
    passcode: CHILD_PASSCODE,
    birthYear: new Date().getUTCFullYear() - 8,
    consent: { policyVersion: '2026-10', scopes: ['ACCOUNT_ACCESS', 'LEARNING_ANALYTICS'] },
    ...overrides,
  };
}
