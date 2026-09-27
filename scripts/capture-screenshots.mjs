// Drives the real command modules (add/list/switch/current/remove) with injected demo
// data — not real credentials — and renders their real chalk/cli-table3 console output
// into SVG "terminal window" screenshots for the README. Run after `npm run build`:
//   node scripts/capture-screenshots.mjs
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { addAccount } from '../dist/commands/add.js';
import { listAccounts } from '../dist/commands/list.js';
import { currentAccount } from '../dist/commands/current.js';
import { switchAccount } from '../dist/commands/switch.js';
import { removeAccount } from '../dist/commands/remove.js';
import { readEnvKey, writeEnvKey } from '../dist/crew.js';
import { renderTerminalSvg } from './render-terminal-svg.mjs';

process.env.FORCE_COLOR = '1';

const DEMO_ACCOUNTS = {
  'demo-key-alice-9f2a': { email: 'alice@acme.dev', used: 1180, limit: 10000, percent: 11.8, plan: 'KIRO POWER' },
  'demo-key-bob-77c1': { email: 'bob@acme.dev', used: 8920, limit: 10000, percent: 89.2, plan: 'KIRO POWER' },
};

function fakeWhoami(_kiroCliPath, apiKey) {
  const account = DEMO_ACCOUNTS[apiKey];
  return account
    ? { ok: true, email: account.email, rawOutput: `Authenticated with API key\nEmail: ${account.email}` }
    : { ok: false, email: null, rawOutput: 'Not logged in' };
}

async function fakeGetUsage(_kiroCliPath, apiKey) {
  const account = DEMO_ACCOUNTS[apiKey];
  return account ? { used: account.used, limit: account.limit, percent: account.percent, plan: account.plan } : null;
}

function prompt(cmd) {
  return `${chalk.green('$')} ${chalk.white(cmd)}`;
}

function formatList(accounts) {
  const table = new Table({ head: [chalk.bold(''), chalk.bold('Name'), chalk.bold('Email'), chalk.bold('Credits')] });
  for (const a of accounts) {
    const usage = a.usage;
    let credits;
    if (!usage) {
      credits = chalk.dim('—');
    } else {
      const text = `${usage.percent}% (${usage.used}/${usage.limit}) ${usage.plan}`;
      credits = usage.percent >= 90 ? chalk.red(text) : usage.percent >= 70 ? chalk.yellow(text) : chalk.green(text);
    }
    table.push([a.active ? chalk.green('●') : '', a.active ? chalk.bold(a.name) : a.name, a.email, credits]);
  }
  return table.toString().split('\n');
}

async function main() {
  const outDir = new URL('../assets/screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  mkdirSync(outDir, { recursive: true });

  let config = { accounts: {}, active: null, kiroCliPath: 'demo-kiro-cli' };
  const loadConfig = () => config;
  const saveConfig = (c) => {
    config = c;
  };

  const home = mkdtempSync(join(tmpdir(), 'kswap-shots-'));
  const envPath = join(home, '.env');
  writeFileSync(envPath, '', 'utf8');

  // --- install ---
  const installLines = [
    prompt('npm install -g kiro-swap'),
    prompt('kswap install'),
    `${chalk.green('kswap installed.')} Open a new terminal for PATH changes to take effect.`,
  ];
  writeFileSync(join(outDir, 'install.svg'), renderTerminalSvg({ title: 'kswap', lines: installLines }));

  // --- add ---
  const addLines = [];
  for (const [name, key] of [['alice', 'demo-key-alice-9f2a'], ['bob', 'demo-key-bob-77c1']]) {
    addLines.push(prompt(`kswap add ${name} ${key}`));
    const result = addAccount(name, key, {}, { loadConfig, saveConfig, whoami: fakeWhoami });
    addLines.push(`${chalk.green('✓')} Added ${chalk.bold(name)} (${result.email}).`);
  }
  writeFileSync(join(outDir, 'add.svg'), renderTerminalSvg({ title: 'kswap', lines: addLines }));

  // --- list (before any switch) ---
  {
    const lines = [prompt('kswap list'), chalk.dim('Checking credit usage…')];
    const accounts = await listAccounts({ loadConfig, getUsage: fakeGetUsage });
    lines.push(...formatList(accounts));
    writeFileSync(join(outDir, 'list.svg'), renderTerminalSvg({ title: 'kswap', lines }));
  }

  // --- switch ---
  {
    const lines = [prompt('kswap switch bob')];
    const result = switchAccount('bob', {
      loadConfig,
      saveConfig,
      readEnvKey: (p) => readEnvKey(p),
      writeEnvKey: (p, k) => writeEnvKey(p, k),
      whoami: fakeWhoami,
      envPath,
    });
    lines.push(`${chalk.green('✓')} Switched to ${chalk.bold('bob')} (${result.email}).`);
    lines.push(`${chalk.yellow('!')} ${result.note}`);
    writeFileSync(join(outDir, 'switch.svg'), renderTerminalSvg({ title: 'kswap', lines }));
  }

  // --- current ---
  {
    const lines = [prompt('kswap current')];
    const current = currentAccount({ loadConfig });
    lines.push(`${chalk.green('●')} ${chalk.bold(current.name)} (${current.email})`);
    writeFileSync(join(outDir, 'current.svg'), renderTerminalSvg({ title: 'kswap', lines }));
  }

  // --- list (after switch, showing bob active + red credits) ---
  {
    const lines = [prompt('kswap list'), chalk.dim('Checking credit usage…')];
    const accounts = await listAccounts({ loadConfig, getUsage: fakeGetUsage });
    lines.push(...formatList(accounts));
    writeFileSync(join(outDir, 'list-after-switch.svg'), renderTerminalSvg({ title: 'kswap', lines }));
  }

  // --- remove (alice is not active, so this succeeds) ---
  {
    const lines = [prompt('kswap remove alice')];
    removeAccount('alice', { loadConfig, saveConfig });
    lines.push(`${chalk.green('✓')} Removed ${chalk.bold('alice')}.`);
    writeFileSync(join(outDir, 'remove.svg'), renderTerminalSvg({ title: 'kswap', lines }));
  }

  rmSync(home, { recursive: true, force: true });
  console.log(`Wrote screenshots to ${outDir}`);
}

main();
