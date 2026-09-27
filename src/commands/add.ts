import { loadConfig, saveConfig, type Config } from '../store.js';
import { whoami } from '../kiroCli.js';

export type AddResult = { ok: true; email: string } | { ok: false; error: string };

export interface AddDeps {
  loadConfig: () => Config;
  saveConfig: (config: Config) => void;
  whoami: (kiroCliPath: string, apiKey: string) => { ok: boolean; email: string | null; rawOutput: string };
}

const realDeps: AddDeps = { loadConfig, saveConfig, whoami };

export function addAccount(
  name: string,
  key: string,
  options: { force?: boolean } = {},
  deps: AddDeps = realDeps,
): AddResult {
  const config = deps.loadConfig();
  if (config.accounts[name] && !options.force) {
    return { ok: false, error: `Account "${name}" already exists. Use --force to overwrite it.` };
  }
  if (!config.kiroCliPath) {
    return { ok: false, error: 'kswap is not installed. Run "kswap install" first.' };
  }
  const result = deps.whoami(config.kiroCliPath, key);
  if (!result.ok || !result.email) {
    return { ok: false, error: `That key did not authenticate: ${result.rawOutput.trim()}` };
  }
  config.accounts[name] = { key, email: result.email, addedAt: new Date().toISOString() };
  deps.saveConfig(config);
  return { ok: true, email: result.email };
}
