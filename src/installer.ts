import { mkdirSync, writeFileSync, cpSync, existsSync, readFileSync, appendFileSync, chmodSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateKiroCli } from './kiroCli.js';
import { loadConfig, saveConfig, type Config } from './store.js';
import { cmdShimContent, ps1ShimContent, shShimContent } from './shim.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const KSWAP_HOME = join(homedir(), '.kswap');
export const SHIM_DIR = join(KSWAP_HOME, 'bin');

export interface PathDeps {
  getUserPath: () => string;
  setUserPath: (value: string) => void;
}

const realPathDeps: PathDeps = {
  getUserPath: () =>
    execSync('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'User\')"', {
      encoding: 'utf8',
    }).trim(),
  setUserPath: (value) => {
    const escaped = value.replace(/"/g, '\\"');
    execSync(
      `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('Path','${escaped}','User')"`,
      { stdio: 'ignore' },
    );
  },
};

export function prependUserPath(dir: string, deps: PathDeps = realPathDeps): void {
  const current = deps.getUserPath();
  const entries = current.split(';').map((e) => e.trim());
  const alreadyPresent = entries.some((e) => e.toLowerCase() === dir.toLowerCase());
  if (alreadyPresent) {
    return;
  }
  deps.setUserPath(`${dir};${current}`);
}

const PROFILE_START = '# >>> kswap >>>';
const PROFILE_END = '# <<< kswap <<<';
const PROFILE_CANDIDATES = ['.zshrc', '.bashrc', '.bash_profile', '.profile'];

// Returns the shell profile files kswap should put its shim directory on PATH in.
// Existing profiles are always updated; the login shell's own rc file is created if
// missing (macOS defaults to zsh with no ~/.zshrc), and ~/.profile is the last resort
// so PATH is never left unconfigured.
export function shellProfileTargets(homeDir: string, shell: string | undefined): string[] {
  const targets = new Set(PROFILE_CANDIDATES.filter((f) => existsSync(join(homeDir, f))));
  if (shell?.includes('zsh')) {
    targets.add('.zshrc');
  }
  if (shell?.includes('bash')) {
    targets.add('.bashrc');
  }
  if (targets.size === 0) {
    targets.add('.profile');
  }
  return [...targets].map((f) => join(homeDir, f));
}

export function addToShellProfiles(shimDir: string, homeDir: string, shell: string | undefined): string[] {
  const block = `${PROFILE_START}\nexport PATH="${shimDir}:$PATH"\n${PROFILE_END}\n`;
  const updated: string[] = [];
  for (const file of shellProfileTargets(homeDir, shell)) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current.includes(PROFILE_START)) {
      continue;
    }
    const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
    appendFileSync(file, `${separator}${block}`, 'utf8');
    updated.push(file);
  }
  return updated;
}

export interface InstallDeps {
  locateKiroCli: () => string;
  pathDeps: PathDeps;
  builtDistDir: string;
  loadConfig: () => Config;
  saveConfig: (config: Config) => void;
  kswapHome: string;
  platform?: NodeJS.Platform;
  homeDir?: string;
  shell?: string;
}

export function install(
  deps: InstallDeps = {
    locateKiroCli,
    pathDeps: realPathDeps,
    builtDistDir: __dirname,
    loadConfig,
    saveConfig,
    kswapHome: KSWAP_HOME,
  },
): void {
  const platform = deps.platform ?? process.platform;
  const realKiroCliPath = deps.locateKiroCli();
  const config = deps.loadConfig();
  config.kiroCliPath = realKiroCliPath;
  deps.saveConfig(config);

  const shimDir = join(deps.kswapHome, 'bin');
  mkdirSync(shimDir, { recursive: true });
  const shimRunnerDir = join(deps.kswapHome, 'dist');
  // Copy the whole compiled dist/ directory, not just shimRunner.js — the compiled
  // shimRunner.js imports its sibling store.js, and copying only the one named file
  // leaves that import unresolvable at runtime (found by actually invoking the
  // installed shim directly, not by the unit tests, which stub the import and never
  // execute the real compiled file as a standalone process).
  cpSync(deps.builtDistDir, shimRunnerDir, { recursive: true });
  const shimRunnerJsPath = join(shimRunnerDir, 'shimRunner.js');

  if (platform === 'win32') {
    writeFileSync(join(shimDir, 'kiro-cli.cmd'), cmdShimContent(shimRunnerJsPath), 'utf8');
    writeFileSync(join(shimDir, 'kiro-cli.ps1'), ps1ShimContent(shimRunnerJsPath), 'utf8');
    prependUserPath(shimDir, deps.pathDeps);
    return;
  }

  writeFileSync(join(shimDir, 'kiro-cli'), shShimContent(shimRunnerJsPath), { encoding: 'utf8', mode: 0o755 });
  chmodSync(join(shimDir, 'kiro-cli'), 0o755);
  addToShellProfiles(shimDir, deps.homeDir ?? homedir(), deps.shell ?? process.env.SHELL);
}
