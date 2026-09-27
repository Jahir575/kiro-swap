import { execSync, spawnSync } from 'node:child_process';

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
