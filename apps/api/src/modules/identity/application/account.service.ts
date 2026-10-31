import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Locale, UserKind } from '@impulse/contracts';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { PasswordHasher } from './password-hasher.js';

export interface NewAccount {
  displayName: string;
  locale: Locale;
  passwordHash: string;
}

export interface AccountSummary {
  id: string;
  kind: UserKind;
  displayName: string;
  locale: Locale;
}

/** Public surface for the `users`, `user_profiles` and `user_credentials` tables. */
@Injectable()
export class AccountService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly hasher: PasswordHasher,
  ) {}

  async createAdult(tx: Tx, account: NewAccount & { email: string }): Promise<string> {
    return this.create(tx, 'ADULT', account.email, account);
  }

  async createChild(tx: Tx, account: NewAccount): Promise<string> {
    return this.create(tx, 'CHILD', null, account);
  }

  hashSecret(secret: string): Promise<string> {
    return this.hasher.hash(secret);
  }

  /** Same work whether or not the user exists, so timing does not reveal accounts. */
  async verifySecret(userId: string | null, secret: string): Promise<boolean> {
    const credential = userId
      ? await this.database.global.userCredential.findUnique({ where: { userId } })
      : null;
    return credential
      ? this.hasher.verify(credential.passwordHash, secret)
      : this.hasher.verifyDummy(secret);
  }

  async findAdultByEmail(email: string): Promise<{ id: string; status: string } | null> {
    return this.database.global.user.findFirst({
      where: { email: normalizeEmail(email), kind: 'ADULT' },
      select: { id: true, status: true },
    });
  }

  async getEmail(userId: string): Promise<string | null> {
    const user = await this.database.global.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  async summarize(userId: string): Promise<AccountSummary> {
    const user = await this.database.global.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    return {
      id: user.id,
      kind: user.kind,
      displayName: user.profile?.displayName ?? '',
      locale: user.locale as Locale,
    };
  }

  async displayNames(userIds: string[]): Promise<Map<string, string>> {
    const profiles = await this.database.global.userProfile.findMany({
      where: { userId: { in: userIds } },
    });
    return new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  }

  private async create(
    tx: Tx,
    kind: UserKind,
    email: string | null,
    account: NewAccount,
  ): Promise<string> {
    const id = randomUUID();
    await tx.user.create({
      data: {
        id,
        kind,
        email: email === null ? null : normalizeEmail(email),
        locale: account.locale,
        profile: { create: { displayName: account.displayName } },
        credential: { create: { passwordHash: account.passwordHash } },
      },
    });
    return id;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
