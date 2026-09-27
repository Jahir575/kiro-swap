import { describe, it, expect, vi } from 'vitest';
import { switchAccount, type SwitchDeps } from './switch.js';
import type { Config } from '../store.js';

function baseDeps(config: Config, overrides: Partial<SwitchDeps> = {}): SwitchDeps {
  return {
    loadConfig: vi.fn(() => config),
    saveConfig: vi.fn(),
    readEnvKey: vi.fn(() => 'previous-key'),
    writeEnvKey: vi.fn(),
    whoami: vi.fn(() => ({ ok: true, email: 'teammate2@company.com', rawOutput: '' })),
    envPath: 'C:\\fake\\.env',
    ...overrides,
  };
}

function configWith(overrides: Partial<Config> = {}): Config {
  return {
    accounts: { teammate2: { key: 'new-key', email: 'teammate2@company.com', addedAt: 't' } },
    active: 'me',
    kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    ...overrides,
  };
}

describe('switchAccount', () => {
  it('happy path: writes the new key, verifies via whoami, updates active, and notes the manual Crew restart', () => {
    const config = configWith();
    const deps = baseDeps(config);
    const result = switchAccount('teammate2', deps);
    expect(result).toEqual({
      ok: true,
      email: 'teammate2@company.com',
      note: 'Restart Kiro Crew manually for the gateway to pick up the new account.',
    });
    expect(deps.writeEnvKey).toHaveBeenCalledWith('C:\\fake\\.env', 'new-key');
    expect(deps.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ active: 'teammate2' }));
  });

  it('returns an error for an unknown account without touching env', () => {
    const config = configWith();
    const deps = baseDeps(config);
    const result = switchAccount('ghost', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).not.toHaveBeenCalled();
  });

  it('rolls back the env key when the post-switch whoami check fails', () => {
    const config = configWith();
    const deps = baseDeps(config, { whoami: vi.fn(() => ({ ok: false, email: null, rawOutput: 'boom' })) });
    const result = switchAccount('teammate2', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(1, 'C:\\fake\\.env', 'new-key');
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(2, 'C:\\fake\\.env', 'previous-key');
    expect(deps.saveConfig).not.toHaveBeenCalled();
  });
});
