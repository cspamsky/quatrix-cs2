import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { lockService } from '../LockService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_LOCK_DIR = path.join(__dirname, '../../__test_locks__');

describe('LockService', () => {
  beforeEach(async () => {
    // Create test lock directory
    await fs.mkdir(TEST_LOCK_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test locks
    try {
      await fs.rm(TEST_LOCK_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('acquireInstanceLock', () => {
    it('should successfully acquire a lock for a new instance', async () => {
      const result = await lockService.acquireInstanceLock('test-instance-1', 'RUN');

      expect(result).toBe(true);
    });

    it('should fail to acquire lock if already locked', async () => {
      // First lock should succeed
      const firstLock = await lockService.acquireInstanceLock('test-instance-2', 'RUN');
      expect(firstLock).toBe(true);

      // Second lock should fail
      const secondLock = await lockService.acquireInstanceLock('test-instance-2', 'UPDATE');
      expect(secondLock).toBe(false);
    });
  });

  describe('releaseInstanceLock', () => {
    it('should successfully release an acquired lock', async () => {
      await lockService.acquireInstanceLock('test-instance-3', 'RUN');
      await lockService.releaseInstanceLock('test-instance-3');

      // Should be able to acquire again after release
      const result = await lockService.acquireInstanceLock('test-instance-3', 'UPDATE');
      expect(result).toBe(true);
    });

    it('should not throw error when releasing non-existent lock', async () => {
      await expect(lockService.releaseInstanceLock('non-existent')).resolves.not.toThrow();
    });
  });

  describe('acquireCoreLock', () => {
    it('should successfully acquire core lock', async () => {
      const result = await lockService.acquireCoreLock();
      expect(result).toBe(true);

      // Clean up
      await lockService.releaseCoreLock();
    });

    it('should fail to acquire if already locked', async () => {
      const firstLock = await lockService.acquireCoreLock();
      expect(firstLock).toBe(true);

      const secondLock = await lockService.acquireCoreLock();
      expect(secondLock).toBe(false);

      // Clean up
      await lockService.releaseCoreLock();
    });
  });

  describe('releaseCoreLock', () => {
    it('should successfully release core lock', async () => {
      await lockService.acquireCoreLock();
      await lockService.releaseCoreLock();

      // Should be able to acquire again
      const result = await lockService.acquireCoreLock();
      expect(result).toBe(true);

      // Clean up
      await lockService.releaseCoreLock();
    });
  });
});
