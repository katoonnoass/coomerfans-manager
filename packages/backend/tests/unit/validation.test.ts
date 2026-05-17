import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '@coomerfans/shared';

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should accept valid login', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: '123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should accept valid registration', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        username: 'testuser',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject short username', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        username: 'ab',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject username with special chars', () => {
      const result = registerSchema.safeParse({
        email: 'user@example.com',
        username: 'bad user!',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });
  });
});
