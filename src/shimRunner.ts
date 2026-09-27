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
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv);
}
