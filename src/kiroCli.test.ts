import { describe, it, expect } from 'vitest';
import { locateKiroCli, whoami } from './kiroCli.js';

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
