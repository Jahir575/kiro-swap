import { loadConfig, saveConfig, type Config } from '../store.js';

export type RemoveResult = { ok: true } | { ok: false; error: string };

export interface RemoveDeps {
  loadConfig: () => Config;
  saveConfig: (config: Config) => void;
}

const realDeps: RemoveDeps = { loadConfig, saveConfig };

export function removeAccount(name: string, deps: RemoveDeps = realDeps): RemoveResult {
  const config = deps.loadConfig();
  if (!config.accounts[name]) {
    return { ok: false, error: `No account named "${name}".` };
  }
  if (config.active === name) {
    return { ok: false, error: `"${name}" is the active account. Switch to another account first.` };
  }
  delete config.accounts[name];
  deps.saveConfig(config);
  return { ok: true };
}
