import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { locateKiroCli } from './kiroCli.js';
import { loadConfig, saveConfig } from './store.js';
import { cmdShimContent, ps1ShimContent } from './shim.js';

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
}

export function install(deps: InstallDeps = { locateKiroCli, pathDeps: realPathDeps }): void {
  const realKiroCliPath = deps.locateKiroCli();
  const config = loadConfig();
  config.kiroCliPath = realKiroCliPath;
  saveConfig(config);

  mkdirSync(SHIM_DIR, { recursive: true });
  const shimRunnerJsPath = join(KSWAP_HOME, 'dist', 'shimRunner.js');
  writeFileSync(join(SHIM_DIR, 'kiro-cli.cmd'), cmdShimContent(shimRunnerJsPath), 'utf8');
  writeFileSync(join(SHIM_DIR, 'kiro-cli.ps1'), ps1ShimContent(shimRunnerJsPath), 'utf8');

  prependUserPath(SHIM_DIR, deps.pathDeps);
}
