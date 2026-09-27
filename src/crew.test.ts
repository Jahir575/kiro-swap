import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readEnvKey, writeEnvKey, readSessionPids, restartGateway } from './crew.js';

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
