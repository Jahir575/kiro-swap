import { describe, it, expect } from 'vitest';
import { resolveEnv, spawnErrorMessage } from './shimRunner.js';
import type { Config } from './store.js';

describe('resolveEnv', () => {
  it('injects KIRO_API_KEY for the active account', () => {
    const config: Config = {
      accounts: { teammate2: { key: 'abc123', email: 'x@y.com', addedAt: 'now' } },
      active: 'teammate2',
      kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    };
    const env = resolveEnv(config, { PATH: 'C:\\Windows' } as any);
    expect(env.KIRO_API_KEY).toBe('abc123');
    expect(env.PATH).toBe('C:\\Windows');
  });

  it('passes the base env through unchanged when config is null', () => {
    const baseEnv = { PATH: 'C:\\Windows', KIRO_API_KEY: 'ambient-key' } as any;
    expect(resolveEnv(null, baseEnv)).toBe(baseEnv);
  });

  it('passes the base env through unchanged when active references an unknown account', () => {
    const config: Config = { accounts: {}, active: 'ghost', kiroCliPath: null };
    const baseEnv = { PATH: 'C:\\Windows' } as any;
    expect(resolveEnv(config, baseEnv)).toBe(baseEnv);
  });

  it('passes the base env through unchanged when nothing is active', () => {
    const config: Config = { accounts: {}, active: null, kiroCliPath: null };
    const baseEnv = { PATH: 'C:\\Windows' } as any;
    expect(resolveEnv(config, baseEnv)).toBe(baseEnv);
  });
});

describe('spawnErrorMessage', () => {
  it('explains a missing kiro-cli binary and how to recover', () => {
    const error = Object.assign(new Error('spawnSync C:\\gone\\kiro-cli.exe ENOENT'), { code: 'ENOENT' });
    const message = spawnErrorMessage('C:\\gone\\kiro-cli.exe', error);
    expect(message).toContain('C:\\gone\\kiro-cli.exe');
    expect(message).toContain('no longer exists');
    expect(message).toContain('kswap install');
  });

  it('reports other spawn failures verbatim', () => {
    const error = Object.assign(new Error('spawnSync x EACCES'), { code: 'EACCES' });
    expect(spawnErrorMessage('x', error)).toBe('kswap: failed to run "x": spawnSync x EACCES');
  });
});
