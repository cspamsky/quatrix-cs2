import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { runtimeService } from '../RuntimeService.js';
import { instanceProcessManager } from '../runtime/InstanceProcessManager.js';
import { runtimeLogWatcher } from '../runtime/RuntimeLogWatcher.js';
import { instanceOutputHandler } from '../runtime/InstanceOutputHandler.js';
import { lockService } from '../LockService.js';
import { fileSystemService } from '../FileSystemService.js';
import db from '../../db.js';
import fs from 'fs';

// We will NOT use jest.mock() here because it's flaky in ESM for these specific files.
// Instead, we use jest.spyOn which works well with imported objects.

describe('RuntimeService (Orchestrator)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Core Service Spies
    jest.spyOn(lockService, 'acquireInstanceLock').mockResolvedValue(true);
    jest.spyOn(lockService, 'releaseInstanceLock').mockResolvedValue(undefined as any);
    jest.spyOn(fileSystemService, 'getInstancePath').mockReturnValue('/mock/path');
    jest.spyOn(fileSystemService, 'prepareInstance').mockResolvedValue(undefined as any);

    // Runtime Sub-service Spies
    jest
      .spyOn(instanceProcessManager, 'spawnProcess')
      .mockResolvedValue({ pid: 1234, on: jest.fn() } as any);
    jest.spyOn(instanceProcessManager, 'killProcess').mockResolvedValue(undefined);
    jest.spyOn(instanceProcessManager, 'isAlive').mockReturnValue(true);

    jest.spyOn(runtimeLogWatcher, 'startWatching').mockImplementation(() => {});
    jest.spyOn(runtimeLogWatcher, 'stopWatching').mockImplementation(() => {});
    jest.spyOn(runtimeLogWatcher, 'rotateLogs').mockImplementation(() => {});

    jest.spyOn(instanceOutputHandler, 'getBuffer').mockReturnValue([]);
    jest.spyOn(instanceOutputHandler, 'clearBuffer').mockImplementation(() => {});

    // External Module Spies
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'openSync').mockReturnValue(123);
    jest.spyOn(fs, 'closeSync').mockImplementation(() => {});
    jest.spyOn(fs.promises, 'lstat').mockResolvedValue({ isSymbolicLink: () => false } as any);
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue(['file1'] as any);
    jest.spyOn(fs.promises, 'readFile').mockResolvedValue('csgo/addons/metamod' as any);

    jest.spyOn(db, 'prepare').mockReturnValue({
      all: jest.fn().mockReturnValue([]),
      run: jest.fn(),
    } as any);
  });

  it('should start an instance successfully', async () => {
    await runtimeService.startInstance('1', { port: 27015 });

    expect(lockService.acquireInstanceLock).toHaveBeenCalledWith('1', 'RUN');
    expect(instanceProcessManager.spawnProcess).toHaveBeenCalled();
    expect(runtimeLogWatcher.startWatching).toHaveBeenCalled();
  });

  it('should stop an instance successfully', async () => {
    // Initial start
    await runtimeService.startInstance('1', { port: 27015 });

    // Stop
    await runtimeService.stopInstance('1');

    expect(instanceProcessManager.killProcess).toHaveBeenCalled();
    expect(runtimeLogWatcher.stopWatching).toHaveBeenCalledWith('1');
    expect(instanceOutputHandler.clearBuffer).toHaveBeenCalledWith('1');
  });

  it('should adopt orphan processes during init', async () => {
    // Mock online servers in DB
    jest.spyOn(db, 'prepare').mockReturnValue({
      all: jest.fn().mockReturnValue([{ id: 1, pid: 5678 }]),
      run: jest.fn(),
    } as any);

    await runtimeService.init();

    expect(instanceProcessManager.isAlive).toHaveBeenCalledWith(5678);
    expect(runtimeLogWatcher.startWatching).toHaveBeenCalled();
  });

  it('should mark dead orphans as OFFLINE during init', async () => {
    const runMock = jest.fn();
    jest.spyOn(db, 'prepare').mockReturnValue({
      all: jest.fn().mockReturnValue([{ id: 1, pid: 5678 }]),
      run: runMock,
    } as any);
    jest.spyOn(instanceProcessManager, 'isAlive').mockReturnValue(false);

    await runtimeService.init();

    expect(runMock).toHaveBeenCalledWith('1');
    expect(lockService.releaseInstanceLock).toHaveBeenCalledWith('1');
  });
});
