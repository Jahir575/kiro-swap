import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, saveConfig, type Config } from '../store.js';
import { readEnvKey, writeEnvKey } from '../crew.js';
import { whoami } from '../kiroCli.js';

export type SwitchResult = { ok: true; email: string; note: string } | { ok: false; error: string };

export interface SwitchDeps {
  loadConfig(): Config;
  saveConfig(config: Config): void;
  readEnvKey(path: string): string | null;
  writeEnvKey(path: string, key: string): void;
  whoami(path: string, key: string): { ok: boolean; email: string | null; rawOutput: string };
  envPath: string;
  crewInstalled?(): boolean;
}

function defaultCrewDir(): string {
  return join(homedir(), '.kiro', 'crew');
}

const realDeps: SwitchDeps = {
  loadConfig,
  saveConfig,
  readEnvKey,
  writeEnvKey,
  whoami,
  envPath: join(defaultCrewDir(), '.env'),
  crewInstalled: () => existsSync(dirname(join(defaultCrewDir(), '.env'))),
};

const MANUAL_RESTART_NOTE = 'Restart Kiro Crew manually for the gateway to pick up the new account.';
const NO_CREW_NOTE = 'Kiro Crew is not installed here, so only kiro-cli was switched.';

export function switchAccount(name: string, deps: SwitchDeps = realDeps): SwitchResult {
  const config = deps.loadConfig();
  const account = config.accounts[name];
  if (!account) {
    return { ok: false, error: `No account named "${name}".` };
  }
  if (!config.kiroCliPath) {
    return { ok: false, error: 'kswap is not installed. Run "kswap install" first.' };
  }

  const crewPresent = deps.crewInstalled ? deps.crewInstalled() : true;
  const previousKey = crewPresent ? deps.readEnvKey(deps.envPath) : null;
  if (crewPresent) {
    deps.writeEnvKey(deps.envPath, account.key);
  }

  const check = deps.whoami(config.kiroCliPath, account.key);
  if (!check.ok || check.email !== account.email) {
    if (crewPresent && previousKey !== null) {
      deps.writeEnvKey(deps.envPath, previousKey);
    }
    return { ok: false, error: `Switch did not take effect: ${check.rawOutput.trim()}. Rolled back.` };
  }

  config.active = name;
  deps.saveConfig(config);
  return { ok: true, email: account.email, note: crewPresent ? MANUAL_RESTART_NOTE : NO_CREW_NOTE };
}
