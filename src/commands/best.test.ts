import { describe, it, expect, vi } from 'vitest';
import { pickBest, findBestAccount } from './best.js';
import type { AccountRow } from './list.js';
import type { Config } from '../store.js';

function row(name: string, usage: { used: number; limit: number } | null): AccountRow {
  return {
    name,
    email: `${name}@x.com`,
    active: false,
    usage: usage && { ...usage, percent: (usage.used / usage.limit) * 100, plan: 'P' },
  };
}

describe('pickBest', () => {
  it('picks the account with the most credit remaining', () => {
    const result = pickBest([row('a', { used: 9000, limit: 10000 }), row('b', { used: 1000, limit: 10000 })]);
    expect(result).toEqual({ ok: true, name: 'b', remaining: 9000 });
  });

  it('compares remaining credit, not percent, when plan limits differ', () => {
    const result = pickBest([row('small', { used: 0, limit: 1000 }), row('big', { used: 5000, limit: 20000 })]);
    expect(result).toEqual({ ok: true, name: 'big', remaining: 15000 });
  });

  it('ignores accounts whose usage could not be read', () => {
    const result = pickBest([row('a', null), row('b', { used: 9500, limit: 10000 })]);
    expect(result).toEqual({ ok: true, name: 'b', remaining: 500 });
  });

  it('errors when no account has readable usage', () => {
    expect(pickBest([row('a', null)]).ok).toBe(false);
  });

  it('errors when there are no accounts', () => {
    expect(pickBest([]).ok).toBe(false);
  });
});

describe('findBestAccount', () => {
  it('looks up usage for every account and returns the winner', async () => {
    const config: Config = {
      accounts: {
        a: { key: 'ka', email: 'a@x.com', addedAt: 't' },
        b: { key: 'kb', email: 'b@x.com', addedAt: 't' },
      },
      active: 'a',
      kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    };
    const getUsage = vi.fn(async (_p: string, key: string) =>
      key === 'ka'
        ? { used: 9000, limit: 10000, percent: 90, plan: 'P' }
        : { used: 100, limit: 10000, percent: 1, plan: 'P' },
    );
    const result = await findBestAccount({ loadConfig: () => config, getUsage });
    expect(result).toEqual({ ok: true, name: 'b', remaining: 9900 });
  });
});
