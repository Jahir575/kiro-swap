import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { addAccount } from './commands/add.js';
import { listAccounts } from './commands/list.js';
import { currentAccount } from './commands/current.js';
import { removeAccount } from './commands/remove.js';
import { switchAccount } from './commands/switch.js';
import { install } from './installer.js';
import { VERSION } from './index.js';

function printError(message: string): void {
  console.error(chalk.red(message));
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
    .description('List all registered accounts')
    .action(() => {
      const accounts = listAccounts();
      if (accounts.length === 0) {
        console.log('No accounts registered. Use "kswap add <name> <key>".');
        return;
      }
      const table = new Table({ head: [chalk.bold(''), chalk.bold('Name'), chalk.bold('Email')] });
      for (const a of accounts) {
        table.push([a.active ? chalk.green('●') : '', a.active ? chalk.bold(a.name) : a.name, a.email]);
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
    .command('switch <name>')
    .description('Switch kiro-cli to the given account (Kiro Crew needs a manual restart)')
    .action((name: string) => {
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
