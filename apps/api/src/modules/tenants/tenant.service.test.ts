import { describe, expect, it } from 'vitest';
import { generateLoginCode } from './tenant.service.js';

describe('generateLoginCode', () => {
  it('avoids characters children confuse when typing', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateLoginCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    }
  });
});
