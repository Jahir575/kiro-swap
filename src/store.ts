import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Account {
  key: string;
  email: string;
  addedAt: string;
}

export interface Config {
  accounts: Record<string, Account>;
  active: string | null;
  kiroCliPath: string | null;
}

export function defaultConfig(): Config {
  return { accounts: {}, active: null, kiroCliPath: null };
}

export function configDir(homeDir: string = homedir()): string {
  return join(homeDir, '.kswap');
}

export function configFilePath(homeDir: string = homedir()): string {
  return join(configDir(homeDir), 'config.json');
}

export function loadConfig(homeDir: string = homedir()): Config {
  const file = configFilePath(homeDir);
  if (!existsSync(file)) {
    return defaultConfig();
  }
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.accounts !== 'object' || parsed.accounts === null) {
      return defaultConfig();
    }
    return {
      accounts: parsed.accounts,
      active: typeof parsed.active === 'string' ? parsed.active : null,
      kiroCliPath: typeof parsed.kiroCliPath === 'string' ? parsed.kiroCliPath : null,
    };
  } catch {
    // Corrupt file: fail safe to an empty config rather than crash the CLI.
    return defaultConfig();
  }
}

export function saveConfig(config: Config, homeDir: string = homedir()): void {
  const dir = configDir(homeDir);
  mkdirSync(dir, { recursive: true });
  const file = configFilePath(homeDir);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  renameSync(tmp, file);
  restrictToOwner(dir);
}

function restrictToOwner(dir: string): void {
  if (process.platform !== 'win32') {
    return;
  }
  try {
    // Ask the OS who is actually running this process, rather than trusting the
    // %USERNAME% environment variable — it can name a different principal than the
    // real token (services, `runas`, sandboxed shells), and granting to the wrong
    // name while stripping inheritance (`/inheritance:r`) would lock the real
    // caller out of a file it just wrote. So: only ever add access for the actual
    // identity, never remove anything already inherited.
    const identity = execSync('whoami', { encoding: 'utf8' }).trim();
    execSync(`icacls "${dir}" /grant:r "${identity}:(OI)(CI)F" /T`, { stdio: 'ignore' });
  } catch {
    // Best-effort ACL tightening; never block a save because it failed.
  }
}
