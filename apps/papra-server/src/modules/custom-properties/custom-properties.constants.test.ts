import { describe, expect, test } from 'vitest';
import { CUSTOM_PROPERTY_KEY_REGEX } from './custom-properties.constants';

describe('custom-properties constants', () => {
  describe('custom property key regex', () => {
    test('a property key can only contain lowercase letters, numbers and hyphens', () => {
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('valid-key-123')).toBe(true);
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('InvalidKey')).toBe(false);
    });

    test('a property key must start with a letter', () => {
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('1invalid')).toBe(false);
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('-invalid')).toBe(false);
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('valid')).toBe(true);
    });

    test('a property key must end with a letter or number', () => {
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('invalid-')).toBe(false);
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('valid-123')).toBe(true);
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('valid-key')).toBe(true);
    });

    test('no consecutive hyphens allowed', () => {
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('invalid--key')).toBe(false);
    });

    test('a property key must be at least 2 characters long', () => {
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('a')).toBe(false);
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('ab')).toBe(true);
    });

    test('no spaces or special characters allowed', () => {
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('invalid key')).toBe(false);
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('invalid_key')).toBe(false);
    });

    test('no diacritics allowed', () => {
      expect(CUSTOM_PROPERTY_KEY_REGEX.test('inválid')).toBe(false);
    });
  });
});
