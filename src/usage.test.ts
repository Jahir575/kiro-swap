import { describe, it, expect, vi } from 'vitest';
import { getUsage, parseUsage } from './usage.js';

describe('parseUsage', () => {
  it('parses used, limit, percent, and plan from /usage output', () => {
    const raw = 'Estimated Usage | resets on 2026-10-01 | KIRO POWER\nCredits (2439.57 of 10000 covered in plan), 24.4%\n';
    expect(parseUsage(raw)).toEqual({ used: 2439.57, limit: 10000, percent: 24.4, plan: 'KIRO POWER' });
  });

  it('returns null when the output has no Credits line', () => {
    expect(parseUsage('Not logged in\n')).toBeNull();
  });
});

describe('getUsage', () => {
  it('resolves usage info when the spawned process exits 0 with parseable output', async () => {
    const spawnFn = vi.fn().mockResolvedValue({
      status: 0,
      stdout: 'Estimated Usage | resets on 2026-10-01 | KIRO POWER\nCredits (100 of 10000 covered in plan), 1%\n',
      stderr: '',
    });
    const result = await getUsage('C:\\fake\\kiro-cli.exe', 'some-key', spawnFn);
    expect(result).toEqual({ used: 100, limit: 10000, percent: 1, plan: 'KIRO POWER' });
    expect(spawnFn).toHaveBeenCalledWith(
      'C:\\fake\\kiro-cli.exe',
      ['chat', '--no-interactive', '/usage'],
      expect.objectContaining({ env: expect.objectContaining({ KIRO_API_KEY: 'some-key' }) }),
    );
  });

  it('resolves null when the process exits non-zero (invalid key, network down, etc.)', async () => {
    const spawnFn = vi.fn().mockResolvedValue({ status: 1, stdout: '', stderr: 'error' });
    const result = await getUsage('C:\\fake\\kiro-cli.exe', 'bad-key', spawnFn);
    expect(result).toBeNull();
  });

  it('resolves null when the process is killed by the timeout (status null)', async () => {
    const spawnFn = vi.fn().mockResolvedValue({ status: null, stdout: '', stderr: '' });
    const result = await getUsage('C:\\fake\\kiro-cli.exe', 'some-key', spawnFn);
    expect(result).toBeNull();
  });
});
