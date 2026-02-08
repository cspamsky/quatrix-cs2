import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PluginDatabaseInjector } from '../PluginDatabaseInjector.js';
import { databaseManager } from '../../DatabaseManager.js';
import fs from 'fs/promises';
import path from 'path';

describe('PluginDatabaseInjector', () => {
  let injector: PluginDatabaseInjector;

  beforeEach(() => {
    injector = new PluginDatabaseInjector();
    jest.restoreAllMocks();
  });

  describe('injectCredentials', () => {
    it('should skip if database is not available', async () => {
      jest.spyOn(databaseManager, 'isAvailable').mockResolvedValue(false);
      const credsSpy = jest.spyOn(databaseManager, 'loadAllCredentials');

      await injector.injectCredentials('1', '/mock/dir');

      expect(credsSpy).not.toHaveBeenCalled();
    });

    it('should skip if autoSync is disabled for server', async () => {
      jest.spyOn(databaseManager, 'isAvailable').mockResolvedValue(true);
      jest.spyOn(databaseManager, 'loadAllCredentials').mockResolvedValue({
        '1': { autoSync: false },
      } as any);
      const provisionSpy = jest.spyOn(databaseManager, 'provisionDatabase');

      await injector.injectCredentials('1', '/mock/dir');

      expect(provisionSpy).not.toHaveBeenCalled();
    });

    it('should inject credentials into JSON config', async () => {
      jest.spyOn(databaseManager, 'isAvailable').mockResolvedValue(true);
      jest.spyOn(databaseManager, 'loadAllCredentials').mockResolvedValue({} as any);
      jest.spyOn(databaseManager, 'provisionDatabase').mockResolvedValue({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'pwd',
        database: 'db',
      } as any);

      jest.spyOn(fs, 'access').mockResolvedValue(undefined as any);
      jest
        .spyOn(fs, 'readdir')
        .mockResolvedValue([
          { name: 'config.json', isDirectory: () => false, isFile: () => true },
        ] as any);

      const initialJson = JSON.stringify({
        Database: {
          DatabaseHost: 'old_host',
          DatabaseUser: 'old_user',
        },
      });
      jest.spyOn(fs, 'readFile').mockResolvedValue(initialJson);
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);

      await injector.injectCredentials('1', '/mock/dir');

      expect(writeFileSpy).toHaveBeenCalled();
      const writtenContent = JSON.parse((writeFileSpy.mock.calls[0] as any)[1]);
      expect(writtenContent.Database.DatabaseHost).toBe('localhost');
      expect(writtenContent.Database.DatabaseUser).toBe('root');
    });

    it('should inject credentials into CFG config using regex', async () => {
      jest.spyOn(databaseManager, 'isAvailable').mockResolvedValue(true);
      jest.spyOn(databaseManager, 'loadAllCredentials').mockResolvedValue({} as any);
      jest.spyOn(databaseManager, 'provisionDatabase').mockResolvedValue({
        host: '127.0.0.1',
        port: 3306,
        user: 'admin',
        password: 'key',
        database: 'quatrix',
      } as any);

      jest.spyOn(fs, 'access').mockResolvedValue(undefined as any);
      jest
        .spyOn(fs, 'readdir')
        .mockResolvedValue([
          { name: 'db.cfg', isDirectory: () => false, isFile: () => true },
        ] as any);

      const initialCfg = `
        DatabaseHost "0.0.0.0"
        DatabaseUser "root"
        DatabasePassword ""
      `;
      jest.spyOn(fs, 'readFile').mockResolvedValue(initialCfg);
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);

      await injector.injectCredentials('1', '/mock/dir');

      expect(writeFileSpy).toHaveBeenCalled();
      const writtenContent = (writeFileSpy.mock.calls[0] as any)[1];
      expect(writtenContent).toContain('DatabaseHost "127.0.0.1"');
      expect(writtenContent).toContain('DatabaseUser "admin"');
    });
  });
});
