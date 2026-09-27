import { loadConfig, type Config } from '../store.js';

export interface CurrentDeps {
  loadConfig: () => Config;
}

export function currentAccount(deps: CurrentDeps = { loadConfig }): { name: string; email: string } | null {
  const config = deps.loadConfig();
  if (!config.active) {
    return null;
  }
  const account = config.accounts[config.active];
  return account ? { name: config.active, email: account.email } : null;
}
