import { describe, it, expect } from 'vitest';
import { buildCli } from './cli.js';
import { VERSION } from './index.js';

describe('buildCli --version', () => {
  it('prints the package version and exits cleanly, instead of "unknown option"', () => {
    const program = buildCli();
    let output = '';
    program.exitOverride();
    program.configureOutput({
      writeOut: (str) => {
        output += str;
      },
    });

    let thrown: unknown;
    try {
      program.parse(['--version'], { from: 'user' });
    } catch (err) {
      thrown = err;
    }

    expect(output.trim()).toBe(VERSION);
    expect((thrown as { code?: string })?.code).toBe('commander.version');
  });
});
