import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install, prependUserPath, addToShellProfiles } from './installer.js';
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

describe('addToShellProfiles', () => {
  function withHome(fn: (home: string) => void) {
    const home = mkdtempSync(join(tmpdir(), 'kswap-home-'));
    try {
      fn(home);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }

  it('creates ~/.zshrc for a zsh login shell when no profile exists, with the PATH block', () => {
    withHome((home) => {
      const updated = addToShellProfiles('/home/me/.kswap/bin', home, '/bin/zsh');
      expect(updated).toEqual([join(home, '.zshrc')]);
      const content = readFileSync(join(home, '.zshrc'), 'utf8');
      expect(content).toContain('export PATH="/home/me/.kswap/bin:$PATH"');
    });
  });

  it('falls back to ~/.profile when there is no profile and the shell is unknown', () => {
    withHome((home) => {
      expect(addToShellProfiles('/x/bin', home, undefined)).toEqual([join(home, '.profile')]);
    });
  });

  it('updates every existing profile and preserves existing content', () => {
    withHome((home) => {
      writeFileSync(join(home, '.bashrc'), 'alias ll="ls -l"', 'utf8');
      writeFileSync(join(home, '.profile'), '# mine\n', 'utf8');
      addToShellProfiles('/x/bin', home, '/bin/bash');
      const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');
      expect(bashrc.startsWith('alias ll="ls -l"\n')).toBe(true);
      expect(bashrc).toContain('export PATH="/x/bin:$PATH"');
      expect(readFileSync(join(home, '.profile'), 'utf8')).toContain('export PATH="/x/bin:$PATH"');
    });
  });

  it('is idempotent: a second run does not duplicate the block', () => {
    withHome((home) => {
      addToShellProfiles('/x/bin', home, '/bin/zsh');
      const second = addToShellProfiles('/x/bin', home, '/bin/zsh');
      expect(second).toEqual([]);
      const content = readFileSync(join(home, '.zshrc'), 'utf8');
      expect(content.match(/>>> kswap >>>/g)).toHaveLength(1);
    });
  });
});

describe('install on macOS/Linux', () => {
  it('writes an executable sh shim plus the dist copy, updates shell profiles, and never touches Windows PATH', () => {
    const testHome = mkdtempSync(join(tmpdir(), 'kswap-install-unix-'));
    const fakeHome = mkdtempSync(join(tmpdir(), 'kswap-fakehome-'));
    const fakeDistDir = mkdtempSync(join(tmpdir(), 'kswap-build-'));
    writeFileSync(join(fakeDistDir, 'shimRunner.js'), 'export {};\n', 'utf8');
    const setUserPath = vi.fn();
    const captured: { config?: Config } = {};
    try {
      install({
        locateKiroCli: () => '/usr/local/bin/kiro-cli',
        pathDeps: { getUserPath: () => '', setUserPath },
        builtDistDir: fakeDistDir,
        loadConfig: () => ({ accounts: {}, active: null, kiroCliPath: null }),
        saveConfig: (c) => {
          captured.config = c;
        },
        kswapHome: testHome,
        platform: 'linux',
        homeDir: fakeHome,
        shell: '/bin/bash',
      });

      const shimPath = join(testHome, 'bin', 'kiro-cli');
      const shim = readFileSync(shimPath, 'utf8');
      expect(shim.startsWith('#!/bin/sh\n')).toBe(true);
      expect(shim).toContain(join(testHome, 'dist', 'shimRunner.js'));
      expect(shim).toContain('"$@"');
      expect(existsSync(join(testHome, 'bin', 'kiro-cli.cmd'))).toBe(false);
      expect(readFileSync(join(fakeHome, '.bashrc'), 'utf8')).toContain(join(testHome, 'bin'));
      expect(setUserPath).not.toHaveBeenCalled();
      expect(captured.config?.kiroCliPath).toBe('/usr/local/bin/kiro-cli');
    } finally {
      rmSync(testHome, { recursive: true, force: true });
      rmSync(fakeHome, { recursive: true, force: true });
      rmSync(fakeDistDir, { recursive: true, force: true });
    }
  });
});

describe('install', () => {
  it('copies the whole compiled dist dir into the injected kswapHome/dist, including sibling imports, never the real ~/.kswap', () => {
    // install() must never write to the real KSWAP_HOME during a test — this test injects
    // its own throwaway home and its own loadConfig/saveConfig so a run on a developer's
    // machine with a real kswap install cannot overwrite that install's shim files or config.
    //
    // The fake "built dist" here deliberately has two files, one importing the other, to
    // catch the real bug found by running the installed shim for real: copying only
    // shimRunner.js and leaving its sibling store.js behind produces a shim that throws
    // ERR_MODULE_NOT_FOUND the moment it's actually invoked — something a test that copies
    // a single isolated file (with nothing to import) can never catch.
    const testHome = mkdtempSync(join(tmpdir(), 'kswap-install-test-'));
    const fakeDistDir = mkdtempSync(join(tmpdir(), 'kswap-build-'));
    writeFileSync(join(fakeDistDir, 'store.js'), 'export const marker = "sibling-module";\n', 'utf8');
    writeFileSync(
      join(fakeDistDir, 'shimRunner.js'),
      "import { marker } from './store.js';\nexport { marker };\n",
      'utf8',
    );

    const locateKiroCli = () => 'C:\\fake\\kiro-cli.exe';
    const pathDeps = { getUserPath: () => 'C:\\Windows', setUserPath: () => {} };
    const captured: { config?: Config } = {};

    try {
      install({
        locateKiroCli,
        pathDeps,
        builtDistDir: fakeDistDir,
        loadConfig: () => ({ accounts: {}, active: null, kiroCliPath: null }),
        saveConfig: (c) => {
          captured.config = c;
        },
        kswapHome: testHome,
      });

      expect(existsSync(join(testHome, 'dist', 'shimRunner.js'))).toBe(true);
      expect(existsSync(join(testHome, 'dist', 'store.js'))).toBe(true);
      expect(captured.config?.kiroCliPath).toBe('C:\\fake\\kiro-cli.exe');
    } finally {
      rmSync(testHome, { recursive: true, force: true });
      rmSync(fakeDistDir, { recursive: true, force: true });
    }
  });
});
