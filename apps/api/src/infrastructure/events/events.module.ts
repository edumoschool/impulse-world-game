import { Global, Module } from '@nestjs/common';
import { EventDispatcher } from './event-consumer.js';
import { BullEventPublisher, EventPublisher } from './event-publisher.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxWriter } from './outbox-writer.js';

@Global()
@Module({
  providers: [
    OutboxWriter,
    OutboxRelay,
    EventDispatcher,
    { provide: EventPublisher, useClass: BullEventPublisher },
  ],
  exports: [OutboxWriter, OutboxRelay, EventDispatcher, EventPublisher],
})
export class EventsModule {}
