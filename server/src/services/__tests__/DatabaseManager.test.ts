import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { databaseManager } from '../DatabaseManager.js';

// Mock mysql2/promise with total type bypass
jest.mock('mysql2/promise', () => {
  const mockQuery = jest.fn(() => Promise.resolve([[]]));
  const mockEnd = jest.fn(() => Promise.resolve());

  return {
    createConnection: jest.fn(() =>
      Promise.resolve({
        query: mockQuery,
        end: mockEnd,
      })
    ),
    createPool: jest.fn(() => ({
      getConnection: jest.fn(() =>
        Promise.resolve({
          query: mockQuery,
          release: jest.fn(),
        })
      ),
      query: mockQuery,
      end: mockEnd,
    })),
  } as any;
});

// Mock fs with total type bypass
jest.mock('fs', () => {
  return {
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    promises: {
      readFile: jest.fn(() => Promise.resolve('{}')),
      writeFile: jest.fn(() => Promise.resolve()),
      mkdir: jest.fn(() => Promise.resolve()),
    },
    default: {
      existsSync: jest.fn(() => true),
      mkdirSync: jest.fn(),
    },
  } as any;
});

describe('DatabaseManager', () => {
  const TEST_SERVER_ID = 'test-server-001';
  let mockPool: any;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Setup a robust mock pool for each test
    mockPool = {
      query: jest.fn(() => Promise.resolve([[]])),
      getConnection: jest.fn(() =>
        Promise.resolve({
          query: jest.fn(() => Promise.resolve([[]])),
          release: jest.fn(),
        })
      ),
    };

    // Inject the mock pool into the singleton instance
    (databaseManager as any).pool = mockPool;

    // Default mock for loadAllCredentials to return empty object
    jest.spyOn(databaseManager, 'loadAllCredentials').mockResolvedValue({});
  });

  describe('provisionDatabase', () => {
    it('should create a new database and user with credentials', async () => {
      // Ensure it doesn't think db already exists
      jest.spyOn(databaseManager, 'getDatabaseCredentials').mockResolvedValue(null);

      const result = await databaseManager.provisionDatabase(TEST_SERVER_ID);

      expect(result.database).toBe(`quatrix_srv_${TEST_SERVER_ID}`);
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should return existing password if database already provisioned', async () => {
      const mockCreds = {
        host: 'localhost',
        port: 3306,
        user: 'u1',
        password: 'p1_saved_password',
        database: 'db1', // Note: Actual implementation re-calculates dbName
      };
      jest.spyOn(databaseManager, 'getDatabaseCredentials').mockResolvedValue(mockCreds);

      const result = await databaseManager.provisionDatabase(TEST_SERVER_ID);
      // The implementation re-calculates database name but reuses password
      expect(result.password).toBe(mockCreds.password);
      expect(result.database).toBe(`quatrix_srv_${TEST_SERVER_ID}`);
    });
  });

  describe('getDatabaseCredentials', () => {
    it('should return credentials for provisioned server', async () => {
      const mockCreds = {
        'test-1': {
          host: 'localhost',
          port: 3306,
          user: 'u1',
          password: 'p1',
          database: 'db1',
        },
      };
      jest.spyOn(databaseManager, 'loadAllCredentials').mockResolvedValue(mockCreds as any);

      const result = await databaseManager.getDatabaseCredentials('test-1');
      expect(result).not.toBeNull();
      expect(result?.user).toBe('u1');
    });

    it('should return null for non-existent server', async () => {
      const result = await databaseManager.getDatabaseCredentials('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('isAvailable', () => {
    it('should return true when pool and connection are available', async () => {
      const available = await databaseManager.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when getConnection fails', async () => {
      mockPool.getConnection.mockImplementation(() =>
        Promise.reject(new Error('Connection failed'))
      );
      const available = await databaseManager.isAvailable();
      expect(available).toBe(false);
    });
  });
});
