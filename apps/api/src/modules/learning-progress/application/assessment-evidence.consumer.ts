import { Injectable } from '@nestjs/common';
import type { DomainEventEnvelope, EventPayload } from '@impulse/contracts';
import type { Tx } from '../../../infrastructure/database/tenant-database.js';
import {
  ConsumesEvents,
  type EventConsumer,
} from '../../../infrastructure/events/event-consumer.js';
import { AttemptService } from '../../assessments/index.js';
import { ProgressService } from './progress.service.js';

/**
 * Turns each submitted assessment into skill evidence. It reads the marked attempt from the
 * database rather than trusting the event, and the dispatcher runs it once per event.
 */
@Injectable()
@ConsumesEvents()
export class AssessmentEvidenceConsumer implements EventConsumer {
  readonly name = 'learning-progress.assessment-evidence';
  readonly eventTypes = ['assessment.submitted'] as const;

  constructor(
    private readonly attempts: AttemptService,
    private readonly progress: ProgressService,
  ) {}

  async handle(event: DomainEventEnvelope, tx: Tx): Promise<void> {
    const payload = event.payload as EventPayload<'assessment.submitted'>;
    if (!event.tenantId) {
      throw new Error(`assessment.submitted ${event.id} has no tenant`);
    }
    const attempt = await this.attempts.markedItems(tx, payload.attemptId);
    // The event commits with the submitted attempt, so a missing one means something is wrong.
    // Throwing makes the queue retry, and the failure shows up in the worker's logs.
    if (!attempt) {
      throw new Error(`assessment.submitted ${event.id} names no submitted attempt`);
    }
    await this.progress.recordAttemptEvidence(tx, event.tenantId, attempt);
  }
}
