import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { Tx } from '../../../infrastructure/database/tenant-database.js';
import { hashToken } from '../../identity/index.js';

export interface AcceptedInvitation {
  id: string;
  tenantId: string;
  organizationId: string;
  roleKey: string;
  guardianChildId: string | null;
  relationship: string | null;
}

@Injectable()
export class InvitationAcceptance {
  /**
   * Single use through a compare-and-set on `acceptedAt`. Must run in the tenant named by the
   * token, so a token aimed at the wrong tenant simply finds nothing. The invitation is bound to
   * the invited address, so a leaked token is useless to any other account.
   */
  async claim(
    tx: Tx,
    invitation: { secret: string; userId: string; userEmail: string },
  ): Promise<AcceptedInvitation> {
    const invalid = new AppError(
      ERROR_CODES.INVITATION_INVALID,
      400,
      'This invitation is invalid or has expired',
    );
    const stored = await tx.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(invitation.secret) },
    });
    if (
      !stored ||
      stored.acceptedAt ||
      stored.expiresAt <= new Date() ||
      stored.email !== invitation.userEmail
    ) {
      throw invalid;
    }

    const claimed = await tx.organizationInvitation.updateMany({
      where: { id: stored.id, acceptedAt: null },
      data: { acceptedAt: new Date(), acceptedBy: invitation.userId },
    });
    if (claimed.count === 0) {
      throw invalid;
    }
    return stored;
  }
}
