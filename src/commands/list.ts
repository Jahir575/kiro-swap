import { loadConfig, type Config } from '../store.js';

export interface ListDeps {
  loadConfig: () => Config;
}

export function listAccounts(deps: ListDeps = { loadConfig }): { name: string; email: string; active: boolean }[] {
  const config = deps.loadConfig();
  return Object.entries(config.accounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, account]) => ({ name, email: account.email, active: name === config.active }));
}
