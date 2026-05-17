import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateAccessToken, verifyPassword, hashPassword } from '../../src/services/auth.service';

describe('Auth Service', () => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-at-least-32-characters-long!!';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword('mypassword123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('mypassword123');
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('should produce different hashes for same password', async () => {
      const hash1 = await hashPassword('mypassword123');
      const hash2 = await hashPassword('mypassword123');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const hash = await hashPassword('correct');
      const result = await verifyPassword('correct', hash);
      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await hashPassword('correct');
      const result = await verifyPassword('wrong', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT', () => {
      const token = generateAccessToken('user-123');
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });
  });
});
