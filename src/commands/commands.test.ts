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
  it('marks the active account and lists all others', () => {
    const config = configWith({
      accounts: {
        a: { key: 'ka', email: 'a@x.com', addedAt: 't' },
        b: { key: 'kb', email: 'b@x.com', addedAt: 't' },
      },
      active: 'b',
    });
    const result = listAccounts({ loadConfig: () => config });
    expect(result).toEqual([
      { name: 'a', email: 'a@x.com', active: false },
      { name: 'b', email: 'b@x.com', active: true },
    ]);
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
