import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install, prependUserPath } from './installer.js';
import type { Config } from './store.js';

describe('prependUserPath', () => {
  it('does nothing when the directory is already on PATH (case-insensitive)', () => {
    const getUserPath = vi.fn(() => 'C:\\Windows;C:\\Users\\me\\.kswap\\bin;C:\\Other');
    const setUserPath = vi.fn();
    prependUserPath('c:\\users\\me\\.kswap\\bin', { getUserPath, setUserPath });
    expect(setUserPath).not.toHaveBeenCalled();
  });

  it('prepends the directory without truncating a long existing PATH', () => {
    const longPath = Array.from({ length: 50 }, (_, i) => `C:\\Some\\Long\\Directory\\Name${i}`).join(';');
    const getUserPath = vi.fn(() => longPath);
    const setUserPath = vi.fn();
    prependUserPath('C:\\Users\\me\\.kswap\\bin', { getUserPath, setUserPath });
    expect(setUserPath).toHaveBeenCalledTimes(1);
    const written = setUserPath.mock.calls[0][0] as string;
    expect(written.startsWith('C:\\Users\\me\\.kswap\\bin;')).toBe(true);
    expect(written.length).toBeGreaterThanOrEqual(longPath.length);
    expect(written).toContain(longPath);
  });
});

describe('install', () => {
  it('copies the compiled shim runner into the injected kswapHome/dist, never the real ~/.kswap', () => {
    // install() must never write to the real KSWAP_HOME during a test — this test injects
    // its own throwaway home and its own loadConfig/saveConfig so a run on a developer's
    // machine with a real kswap install cannot overwrite that install's shim files or config.
    const testHome = mkdtempSync(join(tmpdir(), 'kswap-install-test-'));
    const fakeBuiltShimRunner = join(mkdtempSync(join(tmpdir(), 'kswap-build-')), 'shimRunner.js');
    writeFileSync(fakeBuiltShimRunner, '// built shim runner\n', 'utf8');

    const locateKiroCli = () => 'C:\\fake\\kiro-cli.exe';
    const pathDeps = { getUserPath: () => 'C:\\Windows', setUserPath: () => {} };
    const captured: { config?: Config } = {};

    try {
      install({
        locateKiroCli,
        pathDeps,
        builtShimRunnerPath: fakeBuiltShimRunner,
        loadConfig: () => ({ accounts: {}, active: null, kiroCliPath: null }),
        saveConfig: (c) => {
          captured.config = c;
        },
        kswapHome: testHome,
      });

      expect(existsSync(join(testHome, 'dist', 'shimRunner.js'))).toBe(true);
      expect(captured.config?.kiroCliPath).toBe('C:\\fake\\kiro-cli.exe');
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  });
});
