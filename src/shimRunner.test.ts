import { describe, it, expect } from 'vitest';
import { resolveEnv } from './shimRunner.js';
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
