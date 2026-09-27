import { loadConfig, type Config } from '../store.js';
import { getUsage, type UsageInfo } from '../usage.js';

export interface AccountRow {
  name: string;
  email: string;
  active: boolean;
  usage: UsageInfo | null;
}

export interface ListDeps {
  loadConfig: () => Config;
  getUsage: (kiroCliPath: string, apiKey: string) => Promise<UsageInfo | null>;
}

const realDeps: ListDeps = { loadConfig, getUsage };

export async function listAccounts(deps: ListDeps = realDeps): Promise<AccountRow[]> {
  const config = deps.loadConfig();
  const entries = Object.entries(config.accounts).sort(([a], [b]) => a.localeCompare(b));
  // Fetching credit usage is one ~network-bound kiro-cli invocation per account; running
  // them in parallel keeps the total wait bounded by the slowest call, not their sum.
  const usages = await Promise.all(
    entries.map(([, account]) => (config.kiroCliPath ? deps.getUsage(config.kiroCliPath, account.key) : Promise.resolve(null))),
  );
  return entries.map(([name, account], i) => ({
    name,
    email: account.email,
    active: name === config.active,
    usage: usages[i],
  }));
}
