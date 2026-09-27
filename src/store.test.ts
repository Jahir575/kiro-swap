import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultConfig, loadConfig, saveConfig, configDir } from './store.js';

const tempDirs: string[] = [];
function makeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kswap-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('loadConfig', () => {
  it('returns a default empty config when no file exists', () => {
    const home = makeHome();
    expect(loadConfig(home)).toEqual(defaultConfig());
  });

  it('returns a default config (not throw) when the file is corrupt JSON', () => {
    const home = makeHome();
    mkdirSync(configDir(home), { recursive: true });
    writeFileSync(join(configDir(home), 'config.json'), '{ not json', 'utf8');
    expect(loadConfig(home)).toEqual(defaultConfig());
  });
});

describe('saveConfig / loadConfig round-trip', () => {
  it('creates ~/.kswap on first save when it does not exist yet', () => {
    const home = makeHome();
    expect(existsSync(configDir(home))).toBe(false);
    saveConfig({ accounts: {}, active: null, kiroCliPath: null }, home);
    expect(existsSync(configDir(home))).toBe(true);
  });

  it('persists accounts, active, and kiroCliPath', () => {
    const home = makeHome();
    const config = {
      accounts: {
        teammate2: { key: 'abc123', email: 'teammate2@company.com', addedAt: '2026-09-27T12:00:00.000Z' },
      },
      active: 'teammate2',
      kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    };
    saveConfig(config, home);
    expect(loadConfig(home)).toEqual(config);
  });
});
