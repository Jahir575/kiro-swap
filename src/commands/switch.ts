import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, saveConfig, type Config } from '../store.js';
import { readEnvKey, writeEnvKey, restartGateway } from '../crew.js';
import { whoami } from '../kiroCli.js';

export type SwitchResult = { ok: true; email: string } | { ok: false; error: string };

export interface SwitchDeps {
  loadConfig(): Config;
  saveConfig(config: Config): void;
  readEnvKey(path: string): string | null;
  writeEnvKey(path: string, key: string): void;
  restartGateway(crewDir: string): Promise<boolean>;
  whoami(path: string, key: string): { ok: boolean; email: string | null; rawOutput: string };
  envPath: string;
  crewDir: string;
}

function defaultCrewDir(): string {
  return join(homedir(), '.kiro', 'crew');
}

const realDeps: SwitchDeps = {
  loadConfig,
  saveConfig,
  readEnvKey,
  writeEnvKey,
  restartGateway: (crewDir: string) => restartGateway(crewDir),
  whoami,
  envPath: join(defaultCrewDir(), '.env'),
  crewDir: defaultCrewDir(),
};

export async function switchAccount(name: string, deps: SwitchDeps = realDeps): Promise<SwitchResult> {
  const config = deps.loadConfig();
  const account = config.accounts[name];
  if (!account) {
    return { ok: false, error: `No account named "${name}".` };
  }
  if (!config.kiroCliPath) {
    return { ok: false, error: 'kswap is not installed. Run "kswap install" first.' };
  }

  const previousKey = deps.readEnvKey(deps.envPath);
  deps.writeEnvKey(deps.envPath, account.key);

  const restarted = await deps.restartGateway(deps.crewDir);
  if (!restarted) {
    if (previousKey !== null) {
      deps.writeEnvKey(deps.envPath, previousKey);
    }
    return { ok: false, error: 'Kiro Crew gateway did not restart in time. Rolled back.' };
  }

  const check = deps.whoami(config.kiroCliPath, account.key);
  if (!check.ok || check.email !== account.email) {
    if (previousKey !== null) {
      deps.writeEnvKey(deps.envPath, previousKey);
    }
    return { ok: false, error: `Switch did not take effect: ${check.rawOutput.trim()}. Rolled back.` };
  }

  config.active = name;
  deps.saveConfig(config);
  return { ok: true, email: account.email };
}
