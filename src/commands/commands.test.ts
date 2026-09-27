import { describe, it, expect, vi } from 'vitest';
import { addAccount } from './add.js';
import { listAccounts } from './list.js';
import { currentAccount } from './current.js';
import { removeAccount } from './remove.js';
import type { Config } from '../store.js';

function configWith(overrides: Partial<Config> = {}): Config {
  return { accounts: {}, active: null, kiroCliPath: 'C:\\fake\\kiro-cli.exe', ...overrides };
}

describe('addAccount', () => {
  it('validates the key via whoami and stores the account on success', () => {
    const config = configWith();
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn(() => ({ ok: true, email: 'teammate2@company.com', rawOutput: '' }));
    const result = addAccount('teammate2', 'good-key', {}, { loadConfig, saveConfig, whoami });
    expect(result).toEqual({ ok: true, email: 'teammate2@company.com' });
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: expect.objectContaining({
          teammate2: expect.objectContaining({ key: 'good-key', email: 'teammate2@company.com' }),
        }),
      }),
    );
  });

  it('does not store anything when whoami reports the key is invalid', () => {
    const config = configWith();
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn(() => ({ ok: false, email: null, rawOutput: 'Not logged in' }));
    const result = addAccount('teammate2', 'bad-key', {}, { loadConfig, saveConfig, whoami });
    expect(result.ok).toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('refuses to overwrite an existing name without force', () => {
    const config = configWith({
      accounts: { teammate2: { key: 'old', email: 'old@x.com', addedAt: 't' } },
    });
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn();
    const result = addAccount('teammate2', 'new-key', {}, { loadConfig, saveConfig, whoami });
    expect(result.ok).toBe(false);
    expect(whoami).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('overwrites an existing name when force is true', () => {
    const config = configWith({
      accounts: { teammate2: { key: 'old', email: 'old@x.com', addedAt: 't' } },
    });
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn(() => ({ ok: true, email: 'new@x.com', rawOutput: '' }));
    const result = addAccount('teammate2', 'new-key', { force: true }, { loadConfig, saveConfig, whoami });
    expect(result).toEqual({ ok: true, email: 'new@x.com' });
  });
});

describe('listAccounts', () => {
  it('marks the active account, lists all others, and attaches each one\'s usage', async () => {
    const config = configWith({
      accounts: {
        a: { key: 'ka', email: 'a@x.com', addedAt: 't' },
        b: { key: 'kb', email: 'b@x.com', addedAt: 't' },
      },
      active: 'b',
      kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    });
    const usageByKey: Record<string, { used: number; limit: number; percent: number; plan: string }> = {
      ka: { used: 1, limit: 10000, percent: 0.01, plan: 'KIRO POWER' },
      kb: { used: 2, limit: 10000, percent: 0.02, plan: 'KIRO POWER' },
    };
    const getUsage = vi.fn(async (_path: string, apiKey: string) => usageByKey[apiKey]);
    const result = await listAccounts({ loadConfig: () => config, getUsage });
    expect(result).toEqual([
      { name: 'a', email: 'a@x.com', active: false, usage: usageByKey.ka },
      { name: 'b', email: 'b@x.com', active: true, usage: usageByKey.kb },
    ]);
    expect(getUsage).toHaveBeenCalledTimes(2);
  });

  it('skips usage fetching entirely when kswap has never been installed', async () => {
    const config = configWith({
      accounts: { a: { key: 'ka', email: 'a@x.com', addedAt: 't' } },
      active: null,
      kiroCliPath: null,
    });
    const getUsage = vi.fn();
    const result = await listAccounts({ loadConfig: () => config, getUsage });
    expect(result).toEqual([{ name: 'a', email: 'a@x.com', active: false, usage: null }]);
    expect(getUsage).not.toHaveBeenCalled();
  });
});

describe('currentAccount', () => {
  it('returns null when nothing is active', () => {
    expect(currentAccount({ loadConfig: () => configWith() })).toBeNull();
  });

  it('returns the active account name and email', () => {
    const config = configWith({
      accounts: { a: { key: 'ka', email: 'a@x.com', addedAt: 't' } },
      active: 'a',
    });
    expect(currentAccount({ loadConfig: () => config })).toEqual({ name: 'a', email: 'a@x.com' });
  });
});

describe('removeAccount', () => {
  it('removes a non-active account and saves', () => {
    const config = configWith({
      accounts: { a: { key: 'ka', email: 'a@x.com', addedAt: 't' } },
      active: null,
    });
    const saveConfig = vi.fn();
    const result = removeAccount('a', { loadConfig: () => config, saveConfig });
    expect(result).toEqual({ ok: true });
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ accounts: {} }));
  });

  it('refuses to remove the active account', () => {
    const config = configWith({
      accounts: { a: { key: 'ka', email: 'a@x.com', addedAt: 't' } },
      active: 'a',
    });
    const saveConfig = vi.fn();
    const result = removeAccount('a', { loadConfig: () => config, saveConfig });
    expect(result.ok).toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('returns an error for a name that does not exist', () => {
    const config = configWith();
    const saveConfig = vi.fn();
    const result = removeAccount('ghost', { loadConfig: () => config, saveConfig });
    expect(result.ok).toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
  });
});
