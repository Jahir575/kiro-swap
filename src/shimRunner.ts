import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, type Config } from './store.js';

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
  if (result.error) {
    // Surface spawn failures instead of silently exiting 1 with no output —
    // this is exactly what made a real self-referential kiroCliPath bug (the
    // shim spawning itself) so hard to diagnose: it failed with no message.
    console.error(`kswap: failed to run "${realKiroCliPath}": ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv);
}
