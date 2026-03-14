import { describe, expect, test } from 'vitest';
import { normalizePropertyName } from './custom-properties.repository.models';

describe('custom-properties repository models', () => {
  describe('normalizePropertyName', () => {
    test('trim and lowercase the name, for consistent search and comparison', () => {
      expect(normalizePropertyName('  Hello World  ')).toBe('hello world');
    });
  });
});
