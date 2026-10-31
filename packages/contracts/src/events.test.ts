import { describe, expect, it } from 'vitest';
import { EVENT_PAYLOADS, parseEventPayload } from './events.js';

describe('event catalogue', () => {
  it('rejects a payload that does not match its schema', () => {
    expect(() => parseEventPayload('child.authorized', { childId: 'not-a-uuid' })).toThrow();
  });

  it('strips fields not in the schema, so personal data cannot pass through', () => {
    const payload = parseEventPayload('user.created', {
      userId: '0194f7a0-7c3e-7b1a-8a2e-111111111111',
      kind: 'CHILD',
      displayName: 'A real name',
    });
    expect(payload).not.toHaveProperty('displayName');
  });

  it('declares no payload field that looks like personal data', () => {
    const forbidden = /name|email|phone|address|username|birth/i;
    for (const [type, schema] of Object.entries(EVENT_PAYLOADS)) {
      for (const field of Object.keys(schema.shape)) {
        expect(field, `${type}.${field}`).not.toMatch(forbidden);
      }
    }
  });
});
