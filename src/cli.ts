import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { addAccount } from './commands/add.js';
import { listAccounts } from './commands/list.js';
import { currentAccount } from './commands/current.js';
import { removeAccount } from './commands/remove.js';
import { switchAccount } from './commands/switch.js';
import { findBestAccount } from './commands/best.js';
import { install } from './installer.js';
import { VERSION } from './index.js';
import type { UsageInfo } from './usage.js';

function printError(message: string): void {
  console.error(chalk.red(message));
}

function formatUsage(usage: UsageInfo | null): string {
  if (!usage) {
    return chalk.dim('—');
  }
  const text = `${usage.percent}% (${usage.used}/${usage.limit}) ${usage.plan}`;
  if (usage.percent >= 90) {
    return chalk.red(text);
  }
  if (usage.percent >= 70) {
    return chalk.yellow(text);
  }
  return chalk.green(text);
}

export function buildCli(): Command {
  const program = new Command();
  program
    .name('kswap')
    .description("Switch between multiple Kiro accounts without repeatedly handling teammates' raw credentials.")
    .version(VERSION);

  program
    .command('install')
    .description('Install the kiro-cli shim and add it to PATH')
    .action(() => {
      install();
      console.log(chalk.green('kswap installed.'), 'Open a new terminal for PATH changes to take effect.');
    });

  program
    .command('add <name> <key>')
    .description("Register a teammate's Kiro API key under a name")
    .option('--force', 'overwrite an existing account with this name')
    .action((name: string, key: string, opts: { force?: boolean }) => {
      const result = addAccount(name, key, { force: !!opts.force });
      if (!result.ok) {
        printError(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green('✓'), `Added ${chalk.bold(name)} (${result.email}).`);
    });

  program
    .command('list')
    .description('List all registered accounts with their real credit usage')
    .action(async () => {
      console.error(chalk.dim('Checking credit usage…'));
      const accounts = await listAccounts();
      if (accounts.length === 0) {
        console.log('No accounts registered. Use "kswap add <name> <key>".');
        return;
      }
      const table = new Table({
        head: [chalk.bold(''), chalk.bold('Name'), chalk.bold('Email'), chalk.bold('Credits')],
      });
      for (const a of accounts) {
        table.push([
          a.active ? chalk.green('●') : '',
          a.active ? chalk.bold(a.name) : a.name,
          a.email,
          formatUsage(a.usage),
        ]);
      }
      console.log(table.toString());
    });

  program
    .command('current')
    .description('Show the currently active account')
    .action(() => {
      const current = currentAccount();
      console.log(
        current
          ? `${chalk.green('●')} ${chalk.bold(current.name)} (${current.email})`
          : chalk.dim('No account is currently active.'),
      );
    });

  program
    .command('switch [name]')
    .description('Switch kiro-cli to the given account, or --best for the one with the most credit left (Kiro Crew needs a manual restart)')
    .option('--best', 'switch to the account with the most credit remaining')
    .action(async (nameArg: string | undefined, opts: { best?: boolean }) => {
      if (!!nameArg === !!opts.best) {
        printError('Give either an account name or --best, not both or neither.');
        process.exitCode = 1;
        return;
      }
      let name = nameArg as string;
      if (opts.best) {
        console.error(chalk.dim('Checking credit usage…'));
        const best = await findBestAccount();
        if (!best.ok) {
          printError(best.error);
          process.exitCode = 1;
          return;
        }
        name = best.name;
        console.log(chalk.dim(`Most credit remaining: ${best.name} (${best.remaining} credits left)`));
      }
      const result = switchAccount(name);
      if (!result.ok) {
        printError(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green('✓'), `Switched to ${chalk.bold(name)} (${result.email}).`);
      console.log(chalk.yellow('!'), result.note);
    });

  program
    .command('remove <name>')
    .description('Remove a registered account')
    .action((name: string) => {
      const result = removeAccount(name);
      if (!result.ok) {
        printError(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(chalk.green('✓'), `Removed ${chalk.bold(name)}.`);
    });

  return program;
}

export function run(argv: string[]): void {
  buildCli().parse(argv);
}
