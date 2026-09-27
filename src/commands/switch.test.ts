import { describe, it, expect, vi } from 'vitest';
import { switchAccount, type SwitchDeps } from './switch.js';
import type { Config } from '../store.js';

function baseDeps(config: Config, overrides: Partial<SwitchDeps> = {}): SwitchDeps {
  return {
    loadConfig: vi.fn(() => config),
    saveConfig: vi.fn(),
    readEnvKey: vi.fn(() => 'previous-key'),
    writeEnvKey: vi.fn(),
    restartGateway: vi.fn(async () => true),
    whoami: vi.fn(() => ({ ok: true, email: 'teammate2@company.com', rawOutput: '' })),
    envPath: 'C:\\fake\\.env',
    crewDir: 'C:\\fake\\crew',
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
  it('happy path: writes the new key, restarts, verifies, and updates active', async () => {
    const config = configWith();
    const deps = baseDeps(config);
    const result = await switchAccount('teammate2', deps);
    expect(result).toEqual({ ok: true, email: 'teammate2@company.com' });
    expect(deps.writeEnvKey).toHaveBeenCalledWith('C:\\fake\\.env', 'new-key');
    expect(deps.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ active: 'teammate2' }));
  });

  it('returns an error for an unknown account without touching env/crew', async () => {
    const config = configWith();
    const deps = baseDeps(config);
    const result = await switchAccount('ghost', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).not.toHaveBeenCalled();
    expect(deps.restartGateway).not.toHaveBeenCalled();
  });

  it('rolls back the env key when the gateway restart fails', async () => {
    const config = configWith();
    const deps = baseDeps(config, { restartGateway: vi.fn(async () => false) });
    const result = await switchAccount('teammate2', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(1, 'C:\\fake\\.env', 'new-key');
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(2, 'C:\\fake\\.env', 'previous-key');
    expect(deps.saveConfig).not.toHaveBeenCalled();
  });

  it('rolls back the env key when the post-switch whoami check fails', async () => {
    const config = configWith();
    const deps = baseDeps(config, { whoami: vi.fn(() => ({ ok: false, email: null, rawOutput: 'boom' })) });
    const result = await switchAccount('teammate2', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(2, 'C:\\fake\\.env', 'previous-key');
    expect(deps.saveConfig).not.toHaveBeenCalled();
  });
});
