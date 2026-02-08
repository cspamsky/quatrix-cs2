import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PluginConfigManager } from '../PluginConfigManager.js';
import fs from 'fs/promises';
import path from 'path';

describe('PluginConfigManager', () => {
  let configManager: PluginConfigManager;

  beforeEach(() => {
    configManager = new PluginConfigManager();
    jest.restoreAllMocks();
  });

  describe('discoverConfigs', () => {
    it('should find config files with valid extensions and skip blacklisted ones', async () => {
      jest.spyOn(fs, 'readdir').mockImplementation(async (dirPath) => {
        const normalizedPath = path.normalize(dirPath.toString());
        if (normalizedPath.includes(path.join('configs', 'plugins', 'matchzy'))) {
          return ['matchzy.json', 'matchzy.deps.json', 'README.txt'] as any;
        }
        return [] as any;
      });

      const configs = await configManager.discoverConfigs('/install', '1', 'matchzy');

      const expectedJson = path.normalize(
        path.join(
          '/install',
          '1',
          'game',
          'csgo',
          'addons',
          'counterstrikesharp',
          'configs',
          'plugins',
          'matchzy',
          'matchzy.json'
        )
      );
      const expectedTxt = path.normalize(
        path.join(
          '/install',
          '1',
          'game',
          'csgo',
          'addons',
          'counterstrikesharp',
          'configs',
          'plugins',
          'matchzy',
          'README.txt'
        )
      );

      const normalizedConfigs = configs.map((c) => path.normalize(c));

      expect(normalizedConfigs).toContain(expectedJson);
      expect(normalizedConfigs).toContain(expectedTxt);
    });
  });

  describe('writeConfig', () => {
    it('should throw error for invalid plugin ID', async () => {
      await expect(
        configManager.writeConfig('/install', '1', 'invalid/id', 'cfg.json', '{}')
      ).rejects.toThrow('Invalid plugin ID');
    });

    it('should prevent path traversal', async () => {
      await expect(
        configManager.writeConfig('/install', '1', 'myplugin', '../../evil.json', '{}')
      ).rejects.toThrow('Security Error: Path traversal detected');
    });

    it('should write config successfully if path is safe', async () => {
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

      await configManager.writeConfig(
        '/install',
        '1',
        'myplugin',
        'configs/plugins/myplugin/config.json',
        '{}'
      );

      expect(writeFileSpy).toHaveBeenCalled();
    });
  });

  describe('processExampleConfigs', () => {
    it('should rename example files and delete originals', async () => {
      const accessSpy = jest.spyOn(fs, 'access');

      // 1. Initial targetDir check: success
      // 2. config.json check: fail (trigger copy)
      // 3. other.cfg check: fail (trigger copy)
      accessSpy
        .mockResolvedValueOnce(undefined as any) // targetDir check
        .mockRejectedValueOnce(new Error('not found') as any) // config.json check
        .mockRejectedValueOnce(new Error('not found') as any); // other.cfg check

      jest.spyOn(fs, 'readdir').mockResolvedValue([
        { name: 'config.example.json', isDirectory: () => false, isFile: () => true },
        { name: 'other-examle.cfg', isDirectory: () => false, isFile: () => true },
        { name: 'already.json', isDirectory: () => false, isFile: () => true },
      ] as any);

      const copyFileSpy = jest.spyOn(fs, 'copyFile').mockResolvedValue(undefined as any);
      const unlinkSpy = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined as any);

      await configManager.processExampleConfigs('/mock/dir');

      expect(copyFileSpy).toHaveBeenCalledTimes(2);
      expect(unlinkSpy).toHaveBeenCalledTimes(2);
    });
  });
});
