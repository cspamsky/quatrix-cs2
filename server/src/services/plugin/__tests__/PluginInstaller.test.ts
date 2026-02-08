import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';
import path from 'path';

// Define Mocks Scope
const mockTaskService = {
  taskService: {
    updateTask: jest.fn(),
    completeTask: jest.fn(),
  },
};

const mockConfigManager = {
  pluginConfigManager: {
    processExampleConfigs: jest.fn(() => Promise.resolve() as any),
  },
};

const mockDbInjector = {
  pluginDatabaseInjector: {
    injectCredentials: jest.fn(() => Promise.resolve() as any),
  },
};

const mockFs = {
  readdir: jest.fn() as jest.Mock<any>,
  access: jest.fn() as jest.Mock<any>,
  mkdir: jest.fn() as jest.Mock<any>,
  cp: jest.fn() as jest.Mock<any>,
  rm: jest.fn() as jest.Mock<any>,
  writeFile: jest.fn() as jest.Mock<any>,
  readFile: jest.fn() as jest.Mock<any>,
};

// ESM Mocking
jest.unstable_mockModule('../../TaskService.js', () => mockTaskService);
jest.unstable_mockModule('../PluginConfigManager.js', () => mockConfigManager);
jest.unstable_mockModule('../PluginDatabaseInjector.js', () => mockDbInjector);
jest.unstable_mockModule('fs/promises', () => ({
  __esModule: true,
  default: mockFs,
  ...mockFs,
}));

// Dynamic Import (Must be after mocks)
const { PluginInstaller } = await import('../PluginInstaller.js');
// Import fs (mocked) to use in tests
const fs = (await import('fs/promises')).default as unknown as typeof mockFs;

describe('PluginInstaller', () => {
  let installer: any; // Type as any to access private fields
  let mockDb: any;

  beforeEach(() => {
    installer = new PluginInstaller();

    // Reset all mocks
    jest.clearAllMocks();

    // Database Mocking matching what was there
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
      }),
    };
    installer.db = mockDb;
  });

  describe('install', () => {
    const mockPluginInfo = {
      name: 'MatchZy',
      version: '1.0.0',
      currentVersion: '1.0.0',
      folderName: 'MatchZy',
      category: 'cssharp',
      inPool: true,
      isCustom: false,
    };

    it('should throw error for invalid pluginId', async () => {
      await expect(installer.install('/dir', '1', 'invalid/id', mockPluginInfo)).rejects.toThrow(
        'Invalid plugin ID'
      );
    });

    it('should successfully install a plugin with standard addons structure', async () => {
      mockFs.access.mockImplementation((p: any) => {
        if (p.endsWith('game')) return Promise.reject(new Error('no'));
        // hasAddonsDir check:
        if (p.endsWith('addons')) return Promise.resolve(undefined);
        return Promise.reject(new Error('no'));
      });

      mockFs.cp.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      // Spy on private method findInPool
      // Since it's a private method on the class instance, we can spy on the prototype or the instance depending on how it's called.
      // In TS private methods are just JS methods.
      // But we need to make sure we spy on the *instance* method.
      // Since we create new instance in beforeEach, we spy there.
      // Wait, `installer` is typed as `any` so we can spy.

      // However, check if `findInPool` calls `fs.readdir`.
      // The original test mocked `findInPool`.
      // Let's verify if we can spy on it.

      // Note: jest.spyOn(installer, 'findInPool') might fail if the method is not enumerable or strictly private in compilation,
      // but at runtime in JS it should be fine.
      // However, `findInPool` is `private`.

      // Let's use `jest.spyOn(installer as any, 'findInPool')`.

      // Wait, strict mode might complain about spying on private.
      // We'll see.

      Object.defineProperty(installer, 'findInPool', {
        value: (jest.fn() as jest.Mock<any>).mockResolvedValue('/pool/matchzy'),
        writable: true,
      });

      await installer.install('/install', 'instance1', 'matchzy', mockPluginInfo);

      const expectedDest = path.normalize(path.join('/install', 'instance1', 'game', 'csgo'));
      expect(mockFs.cp).toHaveBeenCalledWith('/pool/matchzy', expectedDest, expect.any(Object));
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should use Smart Sync for non-standard structures', async () => {
      // Mock readdir for smart sync loop (returns array of Dirent-like objects)
      mockFs.readdir.mockImplementation((...args: any[]) => {
        console.log('fs.readdir called with:', args);
        return Promise.resolve([
          {
            name: 'MyPlugin.dll',
            isDirectory: () => false,
            isFile: () => true,
          },
        ]);
      });

      mockFs.access.mockRejectedValue(new Error('not found'));

      Object.defineProperty(installer, 'findInPool', {
        value: (jest.fn() as jest.Mock<any>).mockResolvedValue('/pool/myplugin'),
        writable: true,
      });

      mockFs.cp.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await installer.install('/install', '1', 'myplugin', {
        ...mockPluginInfo,
        category: 'cssharp',
        folderName: 'MyPlugin',
      });

      expect(mockFs.cp).toHaveBeenCalled();
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('uninstall', () => {
    it('should remove directories and delete from DB', async () => {
      mockFs.rm.mockResolvedValue(undefined);

      await installer.uninstall('/install', '1', 'matchzy', {
        name: 'MatchZy',
        category: 'cssharp',
        folderName: 'MatchZy',
      });

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockDb.prepare().run).toHaveBeenCalledWith('1', 'matchzy');
    });
  });
});
