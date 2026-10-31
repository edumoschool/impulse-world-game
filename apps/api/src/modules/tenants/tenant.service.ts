import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Locale } from '@impulse/contracts';
import type { TenantKind } from '../../generated/prisma/client.js';
import { TenantDatabase, type Tx } from '../../infrastructure/database/tenant-database.js';

// No 0/O or 1/I/L, because children type this code by hand.
const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LOGIN_CODE_LENGTH = 8;

export function generateLoginCode(): string {
  return Array.from(
    { length: LOGIN_CODE_LENGTH },
    () => LOGIN_CODE_ALPHABET[randomInt(LOGIN_CODE_ALPHABET.length)],
  ).join('');
}

export interface TenantSummary {
  id: string;
  name: string;
  kind: TenantKind;
  loginCode: string;
  status: string;
}

@Injectable()
export class TenantService {
  constructor(private readonly database: TenantDatabase) {}

  /** A new tenant id, so a caller can open a transaction in the new tenant's context. */
  newTenantId(): string {
    return randomUUID();
  }

  async create(
    tx: Tx,
    tenant: { id: string; name: string; kind: TenantKind; defaultLocale: Locale },
  ): Promise<void> {
    await tx.tenant.create({
      data: {
        id: tenant.id,
        name: tenant.name,
        kind: tenant.kind,
        loginCode: generateLoginCode(),
      },
    });
    await tx.tenantSettings.create({
      data: { tenantId: tenant.id, defaultLocale: tenant.defaultLocale },
    });
  }

  findByLoginCode(loginCode: string): Promise<TenantSummary | null> {
    return this.database.global.tenant.findUnique({
      where: { loginCode: loginCode.trim().toUpperCase() },
    });
  }

  async get(id: string): Promise<TenantSummary | null> {
    return this.database.global.tenant.findUnique({ where: { id } });
  }

  async getMany(ids: string[]): Promise<TenantSummary[]> {
    return this.database.global.tenant.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
