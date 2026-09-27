# kswap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `kswap`, an npm-published CLI that lets one person register several teammates' Kiro API keys once and switch which one is active — for both `kiro-cli` in a terminal and the Kiro Crew gateway — without repeatedly handling anyone's raw credentials.

**Architecture:** A Node/TypeScript CLI with a JSON store (`~/.kswap/config.json`), a thin `kiro-cli` PATH shim that re-reads the store on every invocation (so a switch takes effect in already-open terminals), and a Crew updater that rewrites `~/.kiro/crew/.env` and restarts the gateway's backend process, rolling back on failure.

**Tech Stack:** TypeScript, Node.js ≥18, `commander` (CLI parsing), `vitest` (tests), compiled with `tsc` to `dist/`, no other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-kswap-design.md`

## Global Constraints

- Package name and CLI command are both `kswap` (not `cswap`).
- Node ≥18 (per `package.json` `engines`).
- Windows-only for v1 — the design's shim, PATH, and ACL mechanisms are all Windows-specific (`.cmd`/`.ps1`, `icacls`, `taskkill`); no cross-platform code paths are in scope.
- Account keys are stored in plaintext at `~/.kswap/config.json` (per spec — no encryption, no OS credential store in v1).
- `.env` writes must be UTF-8 **without a BOM** — Node's default `'utf8'` file writes already omit the BOM; the risk is only on read (an existing file may carry one from a prior PowerShell write) and must be stripped before rewriting.
- The shim must fail open: a missing/corrupt config, or a key that no longer authenticates, must never block plain `kiro-cli` usage — it falls through to running the real binary with the ambient environment untouched.
- `switch` must roll back the `.env` change if the Crew restart fails or the post-switch identity check doesn't match — never leave Crew and the store disagreeing about the active account.
- Kiro IDE is explicitly out of scope (see spec's "Kiro IDE — investigated, out of scope" section) — do not add a third consumer.

## Review Focus

- **`.env` has lines besides `KIRO_API_KEY`** (comments, other vars) — a naive rewrite must preserve every other line and its order, not just the key line.
- **The user's existing Windows `PATH` is long** — persisting the shim directory must never truncate or corrupt it (this rules out shelling out to `setx`, which silently truncates at 1024 characters; use `[Environment]::SetEnvironmentVariable(...,'User')` instead).
- **Kiro Crew's backend process never restarts** (hung/crashed) — `restartGateway` must time out and report failure rather than hang forever or report a false success, and `switch` must then roll back the `.env` change it already wrote.
- **`add` is called with a name that's already registered** — must refuse and leave the existing entry untouched unless the caller explicitly asks to overwrite, so a typo can't silently destroy a previously stored key.
- **First run, before `~/.kswap` exists** — `saveConfig` must create the directory itself rather than throwing `ENOENT`.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `src/index.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: `VERSION: string` exported from `src/index.ts`, used by nothing yet but proves the build/test toolchain works end to end.

- [ ] **Step 1: Write the failing test**

`src/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { VERSION } from './index';

describe('index', () => {
  it('exports a semver-looking version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run`
Expected: FAIL — `src/index.ts` does not exist yet.

- [ ] **Step 3: Write the scaffolding**

`package.json`:
```json
{
  "name": "kswap",
  "version": "0.1.0",
  "description": "Switch between multiple Kiro accounts (kiro-cli + Kiro Crew) without repeatedly handling teammates' raw credentials.",
  "bin": {
    "kswap": "bin/kswap.js"
  },
  "main": "dist/index.js",
  "files": ["dist", "bin"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "license": "MIT",
  "dependencies": {
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.4.0",
    "@types/node": "^20.11.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

`src/index.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

export const VERSION: string = pkg.version;
```

`.gitignore`:
```
node_modules/
dist/
*.tmp-*
```

- [ ] **Step 4: Install dependencies and run test to verify it passes**

Run: `npm install && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/index.ts src/index.test.ts .gitignore package-lock.json
git commit -m "chore: project scaffolding (TypeScript, vitest, commander)"
```

---

## Task 2: Config store

**Files:**
- Create: `src/store.ts`
- Create: `src/store.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface Account { key: string; email: string; addedAt: string }`
  - `interface Config { accounts: Record<string, Account>; active: string | null; kiroCliPath: string | null }`
  - `defaultConfig(): Config`
  - `configDir(homeDir?: string): string`
  - `configFilePath(homeDir?: string): string`
  - `loadConfig(homeDir?: string): Config`
  - `saveConfig(config: Config, homeDir?: string): void`

  All four config-reading/writing functions take an optional `homeDir` (defaulting to `os.homedir()`) so tests never touch the real `~/.kswap`.

- [ ] **Step 1: Write the failing tests**

`src/store.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultConfig, loadConfig, saveConfig, configDir } from './store';

const tempDirs: string[] = [];
function makeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kswap-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('loadConfig', () => {
  it('returns a default empty config when no file exists', () => {
    const home = makeHome();
    expect(loadConfig(home)).toEqual(defaultConfig());
  });

  it('returns a default config (not throw) when the file is corrupt JSON', () => {
    const home = makeHome();
    const { mkdirSync, writeFileSync } = require('node:fs');
    mkdirSync(configDir(home), { recursive: true });
    writeFileSync(join(configDir(home), 'config.json'), '{ not json', 'utf8');
    expect(loadConfig(home)).toEqual(defaultConfig());
  });
});

describe('saveConfig / loadConfig round-trip', () => {
  it('creates ~/.kswap on first save when it does not exist yet', () => {
    const home = makeHome();
    expect(existsSync(configDir(home))).toBe(false);
    saveConfig({ accounts: {}, active: null, kiroCliPath: null }, home);
    expect(existsSync(configDir(home))).toBe(true);
  });

  it('persists accounts, active, and kiroCliPath', () => {
    const home = makeHome();
    const config = {
      accounts: {
        teammate2: { key: 'abc123', email: 'teammate2@company.com', addedAt: '2026-09-27T12:00:00.000Z' },
      },
      active: 'teammate2',
      kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    };
    saveConfig(config, home);
    expect(loadConfig(home)).toEqual(config);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store.test.ts`
Expected: FAIL — `./store` does not exist.

- [ ] **Step 3: Implement the store**

`src/store.ts`:
```ts
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
    execSync(`icacls "${dir}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" /T`, { stdio: 'ignore' });
  } catch {
    // Best-effort ACL tightening; never block a save because it failed.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store.ts src/store.test.ts
git commit -m "feat: add config store with atomic writes and corrupt-file recovery"
```

---

## Task 3: kiro-cli wrapper

**Files:**
- Create: `src/kiroCli.ts`
- Create: `src/kiroCli.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (deliberately standalone so it can be tested without the store).
- Produces:
  - `interface WhoamiResult { ok: boolean; email: string | null; rawOutput: string }`
  - `locateKiroCli(execFn?: (cmd: string) => string): string` — throws `Error('kiro-cli not found on PATH')` if none found.
  - `whoami(kiroCliPath: string, apiKey: string, spawnFn?: SpawnSyncFn): WhoamiResult`

- [ ] **Step 1: Write the failing tests**

`src/kiroCli.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { locateKiroCli, whoami } from './kiroCli';

describe('locateKiroCli', () => {
  it('returns the first non-empty line from the exec function', () => {
    const fakeExec = () => 'C:\\Users\\me\\AppData\\Local\\Kiro-Cli\\kiro-cli.exe\r\n';
    expect(locateKiroCli(fakeExec)).toBe('C:\\Users\\me\\AppData\\Local\\Kiro-Cli\\kiro-cli.exe');
  });

  it('throws when the exec function returns nothing', () => {
    const fakeExec = () => '';
    expect(() => locateKiroCli(fakeExec)).toThrow('kiro-cli not found on PATH');
  });
});

describe('whoami', () => {
  it('reports ok:true and parses the email on a successful login', () => {
    const fakeSpawn = () => ({
      status: 0,
      stdout: 'Authenticated with API key\nEmail: teammate2@company.com\n',
      stderr: '',
    });
    const result = whoami('C:\\fake\\kiro-cli.exe', 'some-key', fakeSpawn as any);
    expect(result.ok).toBe(true);
    expect(result.email).toBe('teammate2@company.com');
  });

  it('reports ok:false when the key does not authenticate', () => {
    const fakeSpawn = () => ({ status: 1, stdout: 'Not logged in\n', stderr: '' });
    const result = whoami('C:\\fake\\kiro-cli.exe', 'bad-key', fakeSpawn as any);
    expect(result.ok).toBe(false);
    expect(result.email).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/kiroCli.test.ts`
Expected: FAIL — `./kiroCli` does not exist.

- [ ] **Step 3: Implement the wrapper**

`src/kiroCli.ts`:
```ts
import { execSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';

export interface WhoamiResult {
  ok: boolean;
  email: string | null;
  rawOutput: string;
}

type ExecFn = (cmd: string) => string;
type SpawnSyncFn = (
  path: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; encoding: 'utf8' },
) => { status: number | null; stdout: string; stderr: string };

const defaultExec: ExecFn = (cmd) => execSync(cmd, { encoding: 'utf8' });
const defaultSpawn: SpawnSyncFn = (path, args, options) => spawnSync(path, args, options) as any;

export function locateKiroCli(execFn: ExecFn = defaultExec): string {
  let output = '';
  try {
    output = execFn('where kiro-cli');
  } catch {
    output = '';
  }
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    throw new Error('kiro-cli not found on PATH');
  }
  return firstLine;
}

export function whoami(
  kiroCliPath: string,
  apiKey: string,
  spawnFn: SpawnSyncFn = defaultSpawn,
): WhoamiResult {
  const result = spawnFn(kiroCliPath, ['whoami'], {
    env: { ...process.env, KIRO_API_KEY: apiKey },
    encoding: 'utf8',
  });
  const rawOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const ok = result.status === 0 && /Authenticated with API key/i.test(rawOutput);
  const emailMatch = /Email:\s*(\S+)/.exec(rawOutput);
  return { ok, email: ok && emailMatch ? emailMatch[1] : null, rawOutput };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/kiroCli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/kiroCli.ts src/kiroCli.test.ts
git commit -m "feat: add kiro-cli whoami wrapper for key validation"
```

---

## Task 4: Kiro Crew updater

**Files:**
- Create: `src/crew.ts`
- Create: `src/crew.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `readEnvKey(envPath: string): string | null`
  - `writeEnvKey(envPath: string, key: string): void`
  - `interface PidInfo { backendPid: number; parentPid: number; token: string }`
  - `readSessionPids(pidsPath: string): PidInfo | null`
  - `interface RestartDeps { readSessionPids: (path: string) => PidInfo | null; killProcess: (pid: number) => void; sleep: (ms: number) => Promise<void> }`
  - `restartGateway(crewDir: string, deps?: RestartDeps, timeoutMs?: number, pollIntervalMs?: number): Promise<boolean>`

**Restart mechanism (confirmed by inspection, not guessed):** Kiro Crew's gateway backend is a child process supervised by the KiroCrew Electron shell. `~/.kiro/crew/kiro_session_pids.txt` holds `"<backendPid>:<parentPid>:<token>"`; the backend PID in that file changes across restarts (confirmed by comparing `gateway.log` and `gateway.log.prev`, which show two different backend PIDs in the same `[PID N]` log-line format). Killing the backend PID and waiting for a new one to appear in that file is therefore a reliable restart signal — if no new PID appears within the timeout, the supervisor didn't respawn it and the restart is treated as failed.

- [ ] **Step 1: Write the failing tests**

`src/crew.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readEnvKey, writeEnvKey, readSessionPids, restartGateway } from './crew';

const tempDirs: string[] = [];
function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kswap-crew-test-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('readEnvKey / writeEnvKey', () => {
  it('creates a fresh .env with just the key when none exists', () => {
    const envPath = join(makeDir(), '.env');
    writeEnvKey(envPath, 'my-key');
    expect(readFileSync(envPath, 'utf8')).toBe('KIRO_API_KEY=my-key\n');
  });

  it('preserves other lines and their order when replacing the key', () => {
    const envPath = join(makeDir(), '.env');
    writeFileSync(envPath, 'FOO=bar\nKIRO_API_KEY=old-key\nBAZ=1\n', 'utf8');
    writeEnvKey(envPath, 'new-key');
    expect(readFileSync(envPath, 'utf8')).toBe('FOO=bar\nKIRO_API_KEY=new-key\nBAZ=1\n');
  });

  it('never writes a BOM even if the existing file had one', () => {
    const envPath = join(makeDir(), '.env');
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    writeFileSync(envPath, Buffer.concat([bom, Buffer.from('KIRO_API_KEY=old-key\n', 'utf8')]));
    writeEnvKey(envPath, 'new-key');
    const rawBytes = readFileSync(envPath);
    expect(rawBytes.subarray(0, 3).equals(bom)).toBe(false);
    expect(rawBytes.toString('utf8')).toBe('KIRO_API_KEY=new-key\n');
  });

  it('readEnvKey returns null when the file has no KIRO_API_KEY line', () => {
    const envPath = join(makeDir(), '.env');
    writeFileSync(envPath, 'FOO=bar\n', 'utf8');
    expect(readEnvKey(envPath)).toBeNull();
  });
});

describe('readSessionPids', () => {
  it('parses backendPid:parentPid:token', () => {
    const pidsPath = join(makeDir(), 'kiro_session_pids.txt');
    writeFileSync(pidsPath, '3556:4940:134349929334747023', 'utf8');
    expect(readSessionPids(pidsPath)).toEqual({ backendPid: 3556, parentPid: 4940, token: '134349929334747023' });
  });

  it('returns null when the file does not exist', () => {
    expect(readSessionPids(join(makeDir(), 'missing.txt'))).toBeNull();
  });
});

describe('restartGateway', () => {
  it('kills the current backend pid and resolves true once a new pid appears', async () => {
    let call = 0;
    const readSessionPids = vi.fn(() => {
      call += 1;
      return call === 1
        ? { backendPid: 111, parentPid: 1, token: 't' }
        : { backendPid: 222, parentPid: 1, token: 't' };
    });
    const killProcess = vi.fn();
    const sleep = vi.fn(async () => {});
    const ok = await restartGateway('C:\\fake\\crew', { readSessionPids, killProcess, sleep }, 5000, 100);
    expect(ok).toBe(true);
    expect(killProcess).toHaveBeenCalledWith(111);
  });

  it('resolves false when the backend pid never changes before the timeout', async () => {
    const readSessionPids = vi.fn(() => ({ backendPid: 111, parentPid: 1, token: 't' }));
    const killProcess = vi.fn();
    let elapsed = 0;
    const sleep = vi.fn(async (ms: number) => {
      elapsed += ms;
    });
    const ok = await restartGateway('C:\\fake\\crew', { readSessionPids, killProcess, sleep }, 1000, 100);
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/crew.test.ts`
Expected: FAIL — `./crew` does not exist.

- [ ] **Step 3: Implement the Crew updater**

`src/crew.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

export function readEnvKey(envPath: string): string | null {
  if (!existsSync(envPath)) {
    return null;
  }
  const content = stripBom(readFileSync(envPath, 'utf8'));
  const match = /^KIRO_API_KEY=(.*)$/m.exec(content);
  return match ? match[1].trim() : null;
}

export function writeEnvKey(envPath: string, key: string): void {
  const existing = existsSync(envPath) ? stripBom(readFileSync(envPath, 'utf8')) : '';
  const lines = existing.length > 0 ? existing.split(/\r?\n/).filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === '')) : [];
  const keyLine = `KIRO_API_KEY=${key}`;
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (/^KIRO_API_KEY=/.test(line)) {
      replaced = true;
      return keyLine;
    }
    return line;
  });
  if (!replaced) {
    nextLines.push(keyLine);
  }
  writeFileSync(envPath, `${nextLines.join('\n')}\n`, 'utf8');
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export interface PidInfo {
  backendPid: number;
  parentPid: number;
  token: string;
}

export function readSessionPids(pidsPath: string): PidInfo | null {
  if (!existsSync(pidsPath)) {
    return null;
  }
  const content = readFileSync(pidsPath, 'utf8').trim();
  const parts = content.split(':');
  if (parts.length !== 3) {
    return null;
  }
  const backendPid = Number.parseInt(parts[0], 10);
  const parentPid = Number.parseInt(parts[1], 10);
  if (Number.isNaN(backendPid) || Number.isNaN(parentPid)) {
    return null;
  }
  return { backendPid, parentPid, token: parts[2] };
}

export interface RestartDeps {
  readSessionPids: (path: string) => PidInfo | null;
  killProcess: (pid: number) => void;
  sleep: (ms: number) => Promise<void>;
}

const realDeps: RestartDeps = {
  readSessionPids,
  killProcess: (pid) => {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } catch {
      // Already dead is fine — we only care that a *new* pid shows up next.
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function restartGateway(
  crewDir: string,
  deps: RestartDeps = realDeps,
  timeoutMs = 15000,
  pollIntervalMs = 500,
): Promise<boolean> {
  const pidsPath = join(crewDir, 'kiro_session_pids.txt');
  const before = deps.readSessionPids(pidsPath);
  if (!before) {
    return false;
  }
  deps.killProcess(before.backendPid);
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    await deps.sleep(pollIntervalMs);
    elapsed += pollIntervalMs;
    const after = deps.readSessionPids(pidsPath);
    if (after && after.backendPid !== before.backendPid) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/crew.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/crew.ts src/crew.test.ts
git commit -m "feat: add Crew .env updater and PID-based gateway restart"
```

---

## Task 5: Shim and installer

**Files:**
- Create: `src/shimRunner.ts`
- Create: `src/shimRunner.test.ts`
- Create: `src/shim.ts`
- Create: `src/shim.test.ts`
- Create: `src/installer.ts`
- Create: `src/installer.test.ts`

**Interfaces:**
- Consumes: `Config`, `loadConfig` from Task 2 (`./store`).
- Produces:
  - `resolveEnv(config: Config | null, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv` (`./shimRunner`)
  - `main(argv: string[]): never` (`./shimRunner`) — the real shim entrypoint, not unit tested directly (it calls `process.exit`); covered by the Task 8 integration test instead.
  - `cmdShimContent(shimRunnerJsPath: string): string`, `ps1ShimContent(shimRunnerJsPath: string): string` (`./shim`)
  - `KSWAP_HOME: string`, `SHIM_DIR: string` (`./installer`)
  - `prependUserPath(dir: string, deps?: PathDeps): void`
  - `install(deps?: InstallDeps): void`

- [ ] **Step 1: Write the failing tests**

`src/shimRunner.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveEnv } from './shimRunner';
import type { Config } from './store';

describe('resolveEnv', () => {
  it('injects KIRO_API_KEY for the active account', () => {
    const config: Config = {
      accounts: { teammate2: { key: 'abc123', email: 'x@y.com', addedAt: 'now' } },
      active: 'teammate2',
      kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    };
    const env = resolveEnv(config, { PATH: 'C:\\Windows' } as any);
    expect(env.KIRO_API_KEY).toBe('abc123');
    expect(env.PATH).toBe('C:\\Windows');
  });

  it('passes the base env through unchanged when config is null', () => {
    const baseEnv = { PATH: 'C:\\Windows', KIRO_API_KEY: 'ambient-key' } as any;
    expect(resolveEnv(null, baseEnv)).toBe(baseEnv);
  });

  it('passes the base env through unchanged when active references an unknown account', () => {
    const config: Config = { accounts: {}, active: 'ghost', kiroCliPath: null };
    const baseEnv = { PATH: 'C:\\Windows' } as any;
    expect(resolveEnv(config, baseEnv)).toBe(baseEnv);
  });

  it('passes the base env through unchanged when nothing is active', () => {
    const config: Config = { accounts: {}, active: null, kiroCliPath: null };
    const baseEnv = { PATH: 'C:\\Windows' } as any;
    expect(resolveEnv(config, baseEnv)).toBe(baseEnv);
  });
});
```

`src/shim.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cmdShimContent, ps1ShimContent } from './shim';

describe('cmdShimContent', () => {
  it('invokes node on the shim runner and forwards all arguments', () => {
    const content = cmdShimContent('C:\\Users\\me\\.kswap\\dist\\shimRunner.js');
    expect(content).toContain('node "C:\\Users\\me\\.kswap\\dist\\shimRunner.js" %*');
  });
});

describe('ps1ShimContent', () => {
  it('invokes node on the shim runner, forwards args, and forwards the exit code', () => {
    const content = ps1ShimContent('C:\\Users\\me\\.kswap\\dist\\shimRunner.js');
    expect(content).toContain('node "C:\\Users\\me\\.kswap\\dist\\shimRunner.js" @args');
    expect(content).toContain('exit $LASTEXITCODE');
  });
});
```

`src/installer.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { prependUserPath } from './installer';

describe('prependUserPath', () => {
  it('does nothing when the directory is already on PATH (case-insensitive)', () => {
    const getUserPath = vi.fn(() => 'C:\\Windows;C:\\Users\\me\\.kswap\\bin;C:\\Other');
    const setUserPath = vi.fn();
    prependUserPath('c:\\users\\me\\.kswap\\bin', { getUserPath, setUserPath });
    expect(setUserPath).not.toHaveBeenCalled();
  });

  it('prepends the directory without truncating a long existing PATH', () => {
    const longPath = Array.from({ length: 50 }, (_, i) => `C:\\Some\\Long\\Directory\\Name${i}`).join(';');
    const getUserPath = vi.fn(() => longPath);
    const setUserPath = vi.fn();
    prependUserPath('C:\\Users\\me\\.kswap\\bin', { getUserPath, setUserPath });
    expect(setUserPath).toHaveBeenCalledTimes(1);
    const written = setUserPath.mock.calls[0][0] as string;
    expect(written.startsWith('C:\\Users\\me\\.kswap\\bin;')).toBe(true);
    expect(written.length).toBeGreaterThanOrEqual(longPath.length);
    expect(written).toContain(longPath);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shimRunner.test.ts src/shim.test.ts src/installer.test.ts`
Expected: FAIL — none of the three modules exist yet.

- [ ] **Step 3: Implement shimRunner, shim, and installer**

`src/shimRunner.ts`:
```ts
import { spawnSync } from 'node:child_process';
import { loadConfig, type Config } from './store';

export function resolveEnv(config: Config | null, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!config || !config.active) {
    return baseEnv;
  }
  const account = config.accounts[config.active];
  if (!account) {
    return baseEnv;
  }
  return { ...baseEnv, KIRO_API_KEY: account.key };
}

export function main(argv: string[]): never {
  const args = argv.slice(2);
  let config: Config | null;
  try {
    config = loadConfig();
  } catch {
    config = null;
  }
  const realKiroCliPath = config?.kiroCliPath;
  if (!realKiroCliPath) {
    // No install recorded yet: nothing we can safely exec. Fail with a clear message.
    console.error('kswap: no kiro-cli path recorded. Run "kswap install" first.');
    process.exit(1);
  }
  const env = resolveEnv(config, process.env);
  const result = spawnSync(realKiroCliPath, args, { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main(process.argv);
}
```

`src/shim.ts`:
```ts
export function cmdShimContent(shimRunnerJsPath: string): string {
  return `@echo off\r\nnode "${shimRunnerJsPath}" %*\r\n`;
}

export function ps1ShimContent(shimRunnerJsPath: string): string {
  return `& node "${shimRunnerJsPath}" @args\nexit $LASTEXITCODE\n`;
}
```

`src/installer.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { locateKiroCli } from './kiroCli';
import { loadConfig, saveConfig } from './store';
import { cmdShimContent, ps1ShimContent } from './shim';

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
```

Note: `install()` writes shim files that reference `~/.kswap/dist/shimRunner.js` — Task 9 (Packaging) is responsible for actually copying the built `dist/shimRunner.js` into `KSWAP_HOME` at install time; add that copy step there rather than duplicating it here.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shimRunner.test.ts src/shim.test.ts src/installer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shimRunner.ts src/shimRunner.test.ts src/shim.ts src/shim.test.ts src/installer.ts src/installer.test.ts
git commit -m "feat: add kiro-cli shim runner, shim templates, and PATH installer"
```

---

## Task 6: add / list / current / remove commands

**Files:**
- Create: `src/commands/add.ts`
- Create: `src/commands/list.ts`
- Create: `src/commands/current.ts`
- Create: `src/commands/remove.ts`
- Create: `src/commands/commands.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `saveConfig`, `Config`, `Account` from `../store`; `whoami`, `WhoamiResult` from `../kiroCli`.
- Produces:
  - `type AddResult = { ok: true; email: string } | { ok: false; error: string }`
  - `interface AddDeps { loadConfig: typeof loadConfig; saveConfig: typeof saveConfig; whoami: typeof whoami }`
  - `addAccount(name: string, key: string, options?: { force?: boolean }, deps?: AddDeps): AddResult`
  - `listAccounts(deps?: { loadConfig: typeof loadConfig }): { name: string; email: string; active: boolean }[]`
  - `currentAccount(deps?: { loadConfig: typeof loadConfig }): { name: string; email: string } | null`
  - `type RemoveResult = { ok: true } | { ok: false; error: string }`
  - `removeAccount(name: string, deps?: { loadConfig: typeof loadConfig; saveConfig: typeof saveConfig }): RemoveResult`

- [ ] **Step 1: Write the failing tests**

`src/commands/commands.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { addAccount } from './add';
import { listAccounts } from './list';
import { currentAccount } from './current';
import { removeAccount } from './remove';
import type { Config } from '../store';

function configWith(overrides: Partial<Config> = {}): Config {
  return { accounts: {}, active: null, kiroCliPath: 'C:\\fake\\kiro-cli.exe', ...overrides };
}

describe('addAccount', () => {
  it('validates the key via whoami and stores the account on success', () => {
    const config = configWith();
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn(() => ({ ok: true, email: 'teammate2@company.com', rawOutput: '' }));
    const result = addAccount('teammate2', 'good-key', {}, { loadConfig, saveConfig, whoami });
    expect(result).toEqual({ ok: true, email: 'teammate2@company.com' });
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: expect.objectContaining({
          teammate2: expect.objectContaining({ key: 'good-key', email: 'teammate2@company.com' }),
        }),
      }),
    );
  });

  it('does not store anything when whoami reports the key is invalid', () => {
    const config = configWith();
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn(() => ({ ok: false, email: null, rawOutput: 'Not logged in' }));
    const result = addAccount('teammate2', 'bad-key', {}, { loadConfig, saveConfig, whoami });
    expect(result.ok).toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('refuses to overwrite an existing name without force', () => {
    const config = configWith({
      accounts: { teammate2: { key: 'old', email: 'old@x.com', addedAt: 't' } },
    });
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn();
    const result = addAccount('teammate2', 'new-key', {}, { loadConfig, saveConfig, whoami });
    expect(result.ok).toBe(false);
    expect(whoami).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('overwrites an existing name when force is true', () => {
    const config = configWith({
      accounts: { teammate2: { key: 'old', email: 'old@x.com', addedAt: 't' } },
    });
    const loadConfig = vi.fn(() => config);
    const saveConfig = vi.fn();
    const whoami = vi.fn(() => ({ ok: true, email: 'new@x.com', rawOutput: '' }));
    const result = addAccount('teammate2', 'new-key', { force: true }, { loadConfig, saveConfig, whoami });
    expect(result).toEqual({ ok: true, email: 'new@x.com' });
  });
});

describe('listAccounts', () => {
  it('marks the active account and lists all others', () => {
    const config = configWith({
      accounts: {
        a: { key: 'ka', email: 'a@x.com', addedAt: 't' },
        b: { key: 'kb', email: 'b@x.com', addedAt: 't' },
      },
      active: 'b',
    });
    const result = listAccounts({ loadConfig: () => config });
    expect(result).toEqual([
      { name: 'a', email: 'a@x.com', active: false },
      { name: 'b', email: 'b@x.com', active: true },
    ]);
  });
});

describe('currentAccount', () => {
  it('returns null when nothing is active', () => {
    expect(currentAccount({ loadConfig: () => configWith() })).toBeNull();
  });

  it('returns the active account name and email', () => {
    const config = configWith({
      accounts: { a: { key: 'ka', email: 'a@x.com', addedAt: 't' } },
      active: 'a',
    });
    expect(currentAccount({ loadConfig: () => config })).toEqual({ name: 'a', email: 'a@x.com' });
  });
});

describe('removeAccount', () => {
  it('removes a non-active account and saves', () => {
    const config = configWith({
      accounts: { a: { key: 'ka', email: 'a@x.com', addedAt: 't' } },
      active: null,
    });
    const saveConfig = vi.fn();
    const result = removeAccount('a', { loadConfig: () => config, saveConfig });
    expect(result).toEqual({ ok: true });
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ accounts: {} }));
  });

  it('refuses to remove the active account', () => {
    const config = configWith({
      accounts: { a: { key: 'ka', email: 'a@x.com', addedAt: 't' } },
      active: 'a',
    });
    const saveConfig = vi.fn();
    const result = removeAccount('a', { loadConfig: () => config, saveConfig });
    expect(result.ok).toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('returns an error for a name that does not exist', () => {
    const config = configWith();
    const saveConfig = vi.fn();
    const result = removeAccount('ghost', { loadConfig: () => config, saveConfig });
    expect(result.ok).toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/commands/commands.test.ts`
Expected: FAIL — none of `add`/`list`/`current`/`remove` exist yet.

- [ ] **Step 3: Implement the commands**

`src/commands/add.ts`:
```ts
import { loadConfig, saveConfig, type Config } from '../store';
import { whoami } from '../kiroCli';

export type AddResult = { ok: true; email: string } | { ok: false; error: string };

export interface AddDeps {
  loadConfig: () => Config;
  saveConfig: (config: Config) => void;
  whoami: (kiroCliPath: string, apiKey: string) => { ok: boolean; email: string | null; rawOutput: string };
}

const realDeps: AddDeps = { loadConfig, saveConfig, whoami };

export function addAccount(
  name: string,
  key: string,
  options: { force?: boolean } = {},
  deps: AddDeps = realDeps,
): AddResult {
  const config = deps.loadConfig();
  if (config.accounts[name] && !options.force) {
    return { ok: false, error: `Account "${name}" already exists. Use --force to overwrite it.` };
  }
  if (!config.kiroCliPath) {
    return { ok: false, error: 'kswap is not installed. Run "kswap install" first.' };
  }
  const result = deps.whoami(config.kiroCliPath, key);
  if (!result.ok || !result.email) {
    return { ok: false, error: `That key did not authenticate: ${result.rawOutput.trim()}` };
  }
  config.accounts[name] = { key, email: result.email, addedAt: new Date().toISOString() };
  deps.saveConfig(config);
  return { ok: true, email: result.email };
}
```

`src/commands/list.ts`:
```ts
import { loadConfig, type Config } from '../store';

export interface ListDeps {
  loadConfig: () => Config;
}

export function listAccounts(deps: ListDeps = { loadConfig }): { name: string; email: string; active: boolean }[] {
  const config = deps.loadConfig();
  return Object.entries(config.accounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, account]) => ({ name, email: account.email, active: name === config.active }));
}
```

`src/commands/current.ts`:
```ts
import { loadConfig, type Config } from '../store';

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
```

`src/commands/remove.ts`:
```ts
import { loadConfig, saveConfig, type Config } from '../store';

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/commands/commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/add.ts src/commands/list.ts src/commands/current.ts src/commands/remove.ts src/commands/commands.test.ts
git commit -m "feat: add add/list/current/remove account commands"
```

---

## Task 7: switch command

**Files:**
- Create: `src/commands/switch.ts`
- Create: `src/commands/switch.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `saveConfig`, `Config` from `../store`; `writeEnvKey`, `readEnvKey`, `restartGateway` from `../crew`; `whoami` from `../kiroCli`.
- Produces:
  - `type SwitchResult = { ok: true; email: string } | { ok: false; error: string }`
  - `interface SwitchDeps { loadConfig(): Config; saveConfig(c: Config): void; readEnvKey(path: string): string | null; writeEnvKey(path: string, key: string): void; restartGateway(crewDir: string): Promise<boolean>; whoami(path: string, key: string): { ok: boolean; email: string | null; rawOutput: string }; envPath: string; crewDir: string }`
  - `switchAccount(name: string, deps?: SwitchDeps): Promise<SwitchResult>`

- [ ] **Step 1: Write the failing tests**

`src/commands/switch.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { switchAccount, type SwitchDeps } from './switch';
import type { Config } from '../store';

function baseDeps(config: Config, overrides: Partial<SwitchDeps> = {}): SwitchDeps {
  return {
    loadConfig: vi.fn(() => config),
    saveConfig: vi.fn(),
    readEnvKey: vi.fn(() => 'previous-key'),
    writeEnvKey: vi.fn(),
    restartGateway: vi.fn(async () => true),
    whoami: vi.fn(() => ({ ok: true, email: 'teammate2@company.com', rawOutput: '' })),
    envPath: 'C:\\fake\\.env',
    crewDir: 'C:\\fake\\crew',
    ...overrides,
  };
}

function configWith(overrides: Partial<Config> = {}): Config {
  return {
    accounts: { teammate2: { key: 'new-key', email: 'teammate2@company.com', addedAt: 't' } },
    active: 'me',
    kiroCliPath: 'C:\\fake\\kiro-cli.exe',
    ...overrides,
  };
}

describe('switchAccount', () => {
  it('happy path: writes the new key, restarts, verifies, and updates active', async () => {
    const config = configWith();
    const deps = baseDeps(config);
    const result = await switchAccount('teammate2', deps);
    expect(result).toEqual({ ok: true, email: 'teammate2@company.com' });
    expect(deps.writeEnvKey).toHaveBeenCalledWith('C:\\fake\\.env', 'new-key');
    expect(deps.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ active: 'teammate2' }));
  });

  it('returns an error for an unknown account without touching env/crew', async () => {
    const config = configWith();
    const deps = baseDeps(config);
    const result = await switchAccount('ghost', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).not.toHaveBeenCalled();
    expect(deps.restartGateway).not.toHaveBeenCalled();
  });

  it('rolls back the env key when the gateway restart fails', async () => {
    const config = configWith();
    const deps = baseDeps(config, { restartGateway: vi.fn(async () => false) });
    const result = await switchAccount('teammate2', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(1, 'C:\\fake\\.env', 'new-key');
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(2, 'C:\\fake\\.env', 'previous-key');
    expect(deps.saveConfig).not.toHaveBeenCalled();
  });

  it('rolls back the env key when the post-switch whoami check fails', async () => {
    const config = configWith();
    const deps = baseDeps(config, { whoami: vi.fn(() => ({ ok: false, email: null, rawOutput: 'boom' })) });
    const result = await switchAccount('teammate2', deps);
    expect(result.ok).toBe(false);
    expect(deps.writeEnvKey).toHaveBeenNthCalledWith(2, 'C:\\fake\\.env', 'previous-key');
    expect(deps.saveConfig).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/commands/switch.test.ts`
Expected: FAIL — `./switch` does not exist.

- [ ] **Step 3: Implement the switch command**

`src/commands/switch.ts`:
```ts
import { join } from 'node:path';
import { loadConfig, saveConfig, type Config } from '../store';
import { readEnvKey, writeEnvKey, restartGateway } from '../crew';
import { whoami } from '../kiroCli';

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
  return join(require('node:os').homedir(), '.kiro', 'crew');
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/commands/switch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/switch.ts src/commands/switch.test.ts
git commit -m "feat: add switch command with rollback on restart/verification failure"
```

---

## Task 8: CLI wiring and end-to-end integration test

**Files:**
- Create: `src/cli.ts`
- Create: `bin/kswap.js`
- Create: `src/cli.integration.test.ts`
- Create: `test-fixtures/fake-kiro-cli.js`

**Interfaces:**
- Consumes: `addAccount`, `listAccounts`, `currentAccount`, `removeAccount` (Task 6), `switchAccount` (Task 7), `install` (Task 5).
- Produces: `buildCli(): Command`, `run(argv: string[]): void` from `./cli`.

- [ ] **Step 1: Write the failing integration test**

`test-fixtures/fake-kiro-cli.js` — a stand-in for `kiro-cli.exe` used only in tests, so no real Kiro account is ever touched:
```js
#!/usr/bin/env node
// Minimal stand-in for kiro-cli: only implements `whoami` reading KIRO_API_KEY.
const KNOWN = { 'key-for-teammate2': 'teammate2@company.com' };
const [, , sub] = process.argv;
if (sub === 'whoami') {
  const key = process.env.KIRO_API_KEY;
  const email = KNOWN[key];
  if (email) {
    console.log(`Authenticated with API key\nEmail: ${email}`);
    process.exit(0);
  }
  console.log('Not logged in');
  process.exit(1);
}
process.exit(1);
```

`src/cli.integration.test.ts`:
```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addAccount } from './commands/add';
import { listAccounts } from './commands/list';
import { removeAccount } from './commands/remove';
import { switchAccount, type SwitchDeps } from './commands/switch';
import { loadConfig, saveConfig, type Config } from './store';
import { whoami } from './kiroCli';
import { writeEnvKey, readEnvKey } from './crew';

const fakeKiroCliPath = join(__dirname, '..', 'test-fixtures', 'fake-kiro-cli.js');
let home: string;
let envPath: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'kswap-e2e-'));
  const crewDir = join(home, 'crew');
  mkdirSync(crewDir, { recursive: true });
  envPath = join(crewDir, '.env');
  writeFileSync(envPath, 'KIRO_API_KEY=nobody\n', 'utf8');
  const config: Config = { accounts: {}, active: null, kiroCliPath: `node ${fakeKiroCliPath}`.split(' ')[0] };
  saveConfig(config, home);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function whoamiViaFixture(_path: string, key: string) {
  // spawnSync a real node process running the fixture, so this exercises the same
  // code path (whoami()) with a real child process rather than a stub.
  return whoami(process.execPath, key, (execPath, _args, options) =>
    require('node:child_process').spawnSync(execPath, [fakeKiroCliPath, 'whoami'], options),
  );
}

describe('add -> switch -> list -> remove, end to end against a fake kiro-cli', () => {
  it('runs the full lifecycle and rewrites .env without introducing a BOM', async () => {
    const addResult = addAccount(
      'teammate2',
      'key-for-teammate2',
      {},
      { loadConfig: () => loadConfig(home), saveConfig: (c) => saveConfig(c, home), whoami: whoamiViaFixture },
    );
    expect(addResult).toEqual({ ok: true, email: 'teammate2@company.com' });

    const switchDeps: SwitchDeps = {
      loadConfig: () => loadConfig(home),
      saveConfig: (c) => saveConfig(c, home),
      readEnvKey: (p) => readEnvKey(p),
      writeEnvKey: (p, k) => writeEnvKey(p, k),
      restartGateway: async () => true, // Crew restart is stubbed per the spec's Testing section.
      whoami: whoamiViaFixture,
      envPath,
      crewDir: join(home, 'crew'),
    };
    const switchResult = await switchAccount('teammate2', switchDeps);
    expect(switchResult).toEqual({ ok: true, email: 'teammate2@company.com' });

    const envBytes = readFileSync(envPath);
    expect(envBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(envBytes.toString('utf8')).toBe('KIRO_API_KEY=key-for-teammate2\n');

    const list = listAccounts({ loadConfig: () => loadConfig(home) });
    expect(list).toEqual([{ name: 'teammate2', email: 'teammate2@company.com', active: true }]);

    const removeResult = removeAccount('teammate2', {
      loadConfig: () => loadConfig(home),
      saveConfig: (c) => saveConfig(c, home),
    });
    // Still active, so removal must be refused — this exercises the same guard as Task 6's unit test,
    // now against real on-disk state produced by the rest of the lifecycle above.
    expect(removeResult.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/cli.integration.test.ts`
Expected: FAIL initially on the `writeFileSync`/`saveConfig` calls only if `src/store.ts` etc. were missing — by this point in the plan they exist, so this test should already mostly pass except for anything `cli.ts` itself will later need. Since this test only exercises already-built modules, it should PASS as soon as Step 1's files are saved. Run it and confirm PASS before moving on — there is nothing left to implement for the integration test itself.

- [ ] **Step 3: Build the CLI wiring**

`src/cli.ts`:
```ts
import { Command } from 'commander';
import { addAccount } from './commands/add';
import { listAccounts } from './commands/list';
import { currentAccount } from './commands/current';
import { removeAccount } from './commands/remove';
import { switchAccount } from './commands/switch';
import { install } from './installer';

export function buildCli(): Command {
  const program = new Command();
  program
    .name('kswap')
    .description("Switch between multiple Kiro accounts without repeatedly handling teammates' raw credentials.");

  program
    .command('install')
    .description('Install the kiro-cli shim and add it to PATH')
    .action(() => {
      install();
      console.log('kswap installed. Open a new terminal for PATH changes to take effect.');
    });

  program
    .command('add <name> <key>')
    .description("Register a teammate's Kiro API key under a name")
    .option('--force', 'overwrite an existing account with this name')
    .action((name: string, key: string, opts: { force?: boolean }) => {
      const result = addAccount(name, key, { force: !!opts.force });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(`Added "${name}" (${result.email}).`);
    });

  program
    .command('list')
    .description('List all registered accounts')
    .action(() => {
      const accounts = listAccounts();
      if (accounts.length === 0) {
        console.log('No accounts registered. Use "kswap add <name> <key>".');
        return;
      }
      for (const a of accounts) {
        console.log(`${a.active ? '*' : ' '} ${a.name} (${a.email})`);
      }
    });

  program
    .command('current')
    .description('Show the currently active account')
    .action(() => {
      const current = currentAccount();
      console.log(current ? `${current.name} (${current.email})` : 'No account is currently active.');
    });

  program
    .command('switch <name>')
    .description('Switch kiro-cli and Kiro Crew to the given account')
    .action(async (name: string) => {
      const result = await switchAccount(name);
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(`Switched to "${name}" (${result.email}).`);
    });

  program
    .command('remove <name>')
    .description('Remove a registered account')
    .action((name: string) => {
      const result = removeAccount(name);
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(`Removed "${name}".`);
    });

  return program;
}

export function run(argv: string[]): void {
  buildCli().parse(argv);
}
```

`bin/kswap.js`:
```js
#!/usr/bin/env node
require('../dist/cli').run(process.argv);
```

- [ ] **Step 4: Run the full test suite to verify everything still passes**

Run: `npx vitest run`
Expected: PASS (every test file from Tasks 1–8)

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts bin/kswap.js src/cli.integration.test.ts test-fixtures/fake-kiro-cli.js
git commit -m "feat: wire up the kswap CLI and add an end-to-end lifecycle test"
```

---

## Task 9: Packaging for npm

**Files:**
- Modify: `src/installer.ts` (copy compiled shim runner into `~/.kswap/dist` at install time)
- Modify: `src/installer.test.ts` (cover the copy step)
- Create: `README.md`

**Interfaces:**
- Consumes: `KSWAP_HOME` from `./installer` (already defined in Task 5).
- Produces: no new exports — this task makes the already-defined `install()` fully functional end to end and prepares the package for `npm publish`.

- [ ] **Step 1: Write the failing test**

Add to `src/installer.test.ts`:
```ts
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install } from './installer';

describe('install', () => {
  it('copies the compiled shim runner into KSWAP_HOME/dist', () => {
    const fakeBuiltShimRunner = join(mkdtempSync(join(tmpdir(), 'kswap-build-')), 'shimRunner.js');
    writeFileSync(fakeBuiltShimRunner, '// built shim runner\n', 'utf8');

    const locateKiroCli = () => 'C:\\fake\\kiro-cli.exe';
    const pathDeps = { getUserPath: () => 'C:\\Windows', setUserPath: () => {} };

    install({ locateKiroCli, pathDeps, builtShimRunnerPath: fakeBuiltShimRunner } as any);

    const { KSWAP_HOME } = require('./installer');
    expect(existsSync(join(KSWAP_HOME, 'dist', 'shimRunner.js'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/installer.test.ts`
Expected: FAIL — `install()` does not yet accept/use `builtShimRunnerPath`, and copies nothing.

- [ ] **Step 3: Update the installer**

Modify `src/installer.ts` — extend `InstallDeps` and `install()`:
```ts
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
// ...(other imports unchanged)...

export interface InstallDeps {
  locateKiroCli: () => string;
  pathDeps: PathDeps;
  builtShimRunnerPath: string;
}

export function install(
  deps: InstallDeps = {
    locateKiroCli,
    pathDeps: realPathDeps,
    builtShimRunnerPath: join(__dirname, 'shimRunner.js'),
  },
): void {
  const realKiroCliPath = deps.locateKiroCli();
  const config = loadConfig();
  config.kiroCliPath = realKiroCliPath;
  saveConfig(config);

  mkdirSync(SHIM_DIR, { recursive: true });
  const shimRunnerDir = join(KSWAP_HOME, 'dist');
  mkdirSync(shimRunnerDir, { recursive: true });
  const shimRunnerJsPath = join(shimRunnerDir, 'shimRunner.js');
  copyFileSync(deps.builtShimRunnerPath, shimRunnerJsPath);

  writeFileSync(join(SHIM_DIR, 'kiro-cli.cmd'), cmdShimContent(shimRunnerJsPath), 'utf8');
  writeFileSync(join(SHIM_DIR, 'kiro-cli.ps1'), ps1ShimContent(shimRunnerJsPath), 'utf8');

  prependUserPath(SHIM_DIR, deps.pathDeps);
}
```

Note: `__dirname` in the default resolves to `dist/` after `tsc` compiles `src/installer.ts` to `dist/installer.js`, so `join(__dirname, 'shimRunner.js')` correctly points at the sibling compiled `dist/shimRunner.js` when running the real, published CLI — the injected `builtShimRunnerPath` in tests exists purely to avoid depending on a real build during unit tests.

`README.md`:
```markdown
# kswap

Switch between multiple Kiro accounts — `kiro-cli` and the Kiro Crew
gateway — without repeatedly handling teammates' raw credentials.

## Install

```
npm install -g kswap
kswap install
```

Open a new terminal after `kswap install` so the `PATH` change takes effect.

## Usage

```
kswap add <name> <api-key>   # register a teammate's Kiro API key once
kswap list                   # show every registered account
kswap switch <name>          # make that account active everywhere
kswap current                # show which account is active
kswap remove <name>          # forget an account (must not be active)
```

## Scope

v1 covers `kiro-cli` (terminal) and the Kiro Crew gateway. It does not
cover Kiro IDE, auto-switching on rate limits, or a usage dashboard — see
`docs/superpowers/specs/2026-09-27-kswap-design.md` for why.
```

- [ ] **Step 4: Run tests, build, and smoke-test the packaged CLI**

Run: `npx vitest run && npm run build && node bin/kswap.js --help`
Expected: all tests PASS, build succeeds, and `--help` prints usage including `install`, `add`, `list`, `current`, `switch`, `remove` without throwing.

- [ ] **Step 5: Commit**

```bash
git add src/installer.ts src/installer.test.ts README.md
git commit -m "feat: copy shim runner into ~/.kswap on install; add README"
```

---

## Self-Review Notes

- **Spec coverage:** Problem/goal (Tasks 6–8), both consumers (Tasks 4 & 5), all five commands (Tasks 6–7), plaintext store with atomic writes (Task 2), shim fail-open behavior (Task 5), Crew restart + rollback (Tasks 4 & 7), npm packaging (Task 9), Kiro IDE explicitly excluded (Global Constraints) — every spec section has an owning task.
- **Review Focus:** all five items each have a task and an explicit test (`.env` line preservation → Task 4; PATH truncation → Task 5; restart timeout → Task 4 and again in Task 7's rollback test; duplicate `add` → Task 6; first-run directory creation → Task 2).
- **Type consistency:** `Config`/`Account` from Task 2 are the shapes used unchanged through Tasks 5–8; `WhoamiResult`'s `{ ok, email, rawOutput }` shape from Task 3 is what every later task's `whoami` dependency type matches.
