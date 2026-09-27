import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { addAccount } from './commands/add.js';
import { listAccounts } from './commands/list.js';
import { removeAccount } from './commands/remove.js';
import { switchAccount, type SwitchDeps } from './commands/switch.js';
import { loadConfig, saveConfig, type Config } from './store.js';
import { whoami } from './kiroCli.js';
import { writeEnvKey, readEnvKey } from './crew.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
    spawnSync(execPath, [fakeKiroCliPath, 'whoami'], options),
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
