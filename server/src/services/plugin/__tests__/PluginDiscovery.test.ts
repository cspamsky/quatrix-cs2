import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PluginDiscovery } from '../PluginDiscovery.js';
import fs from 'fs/promises';
import path from 'path';

describe('PluginDiscovery', () => {
  let discovery: PluginDiscovery;

  beforeEach(() => {
    discovery = new PluginDiscovery();
    jest.restoreAllMocks();
  });

  describe('detectCategory', () => {
    it('should detect cssharp category if counterstrikesharp directory exists', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue(['counterstrikesharp' as any]);

      const category = await discovery.detectCategory('/mock/dir');
      expect(category).toBe('cssharp');
    });

    it('should detect cssharp category if addons/counterstrikesharp exists', async () => {
      const readdirSpy = jest.spyOn(fs, 'readdir');
      readdirSpy
        .mockResolvedValueOnce(['addons' as any])
        .mockResolvedValueOnce(['counterstrikesharp' as any]);

      const category = await discovery.detectCategory('/mock/dir');
      expect(category).toBe('cssharp');
    });

    it('should detect metamod category if addons exists but no counterstrikesharp', async () => {
      const readdirSpy = jest.spyOn(fs, 'readdir');
      readdirSpy
        .mockResolvedValueOnce(['addons' as any])
        .mockResolvedValueOnce(['metamod', 'sourcemod'] as any);

      const category = await discovery.detectCategory('/mock/dir');
      expect(category).toBe('metamod');
    });

    it('should detect cssharp if a .dll file is present in root', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue(['MyPlugin.dll', 'config.json'] as any);

      const category = await discovery.detectCategory('/mock/dir');
      expect(category).toBe('cssharp');
    });
  });

  describe('findContentRoot', () => {
    it('should return the directory itself if it contains addons/', async () => {
      jest
        .spyOn(fs, 'readdir')
        .mockResolvedValue([
          { name: 'addons', isDirectory: () => true, isFile: () => false },
        ] as any);

      const root = await discovery.findContentRoot('/mock/extract');
      expect(root).toBe('/mock/extract');
    });

    it('should descend into a single subfolder if it is the only significant item', async () => {
      const readdirSpy = jest.spyOn(fs, 'readdir');
      readdirSpy
        .mockResolvedValueOnce([
          { name: 'MyPlugin-v1.0', isDirectory: () => true, isFile: () => false },
          { name: '__MACOSX', isDirectory: () => true, isFile: () => false },
        ] as any)
        .mockResolvedValueOnce([
          { name: 'addons', isDirectory: () => true, isFile: () => false },
        ] as any);

      const root = await discovery.findContentRoot('/mock/extract');
      expect(root).toBe(path.join('/mock/extract', 'MyPlugin-v1.0'));
    });
  });

  describe('extractMetadata', () => {
    it('should extract metadata from addons structure', async () => {
      const readdirSpy = jest.spyOn(fs, 'readdir');
      readdirSpy
        .mockResolvedValueOnce([
          { name: 'addons', isDirectory: () => true, isFile: () => false },
        ] as any) // root readdir
        .mockResolvedValueOnce(['counterstrikesharp' as any]) // addons readdir
        .mockResolvedValueOnce(['MyCoolPlugin', 'counterstrikesharp.api'] as any); // plugins readdir

      const meta = await discovery.extractMetadata('/mock/dir');
      expect(meta.name).toBe('MyCoolPlugin');
      expect(meta.category).toBe('cssharp');
    });

    it('should extract metadata from naked DLLs', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue([
        { name: 'SuperAdmin.dll', isDirectory: () => false, isFile: () => true },
        { name: 'Newtonsoft.Json.dll', isDirectory: () => false, isFile: () => true },
      ] as any);

      const meta = await discovery.extractMetadata('/mock/dir', 'superadmin');
      expect(meta.name).toBe('superadmin');
      expect(meta.category).toBe('cssharp');
    });
  });
});
