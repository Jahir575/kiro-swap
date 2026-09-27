import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateKiroCli } from './kiroCli.js';
import { loadConfig, saveConfig, type Config } from './store.js';
import { cmdShimContent, ps1ShimContent } from './shim.js';

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

export interface InstallDeps {
  locateKiroCli: () => string;
  pathDeps: PathDeps;
  builtDistDir: string;
  loadConfig: () => Config;
  saveConfig: (config: Config) => void;
  kswapHome: string;
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

  writeFileSync(join(shimDir, 'kiro-cli.cmd'), cmdShimContent(shimRunnerJsPath), 'utf8');
  writeFileSync(join(shimDir, 'kiro-cli.ps1'), ps1ShimContent(shimRunnerJsPath), 'utf8');

  prependUserPath(shimDir, deps.pathDeps);
}
