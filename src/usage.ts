import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

export interface UsageInfo {
  used: number;
  limit: number;
  percent: number;
  plan: string;
}

export type SpawnFn = (
  path: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number },
) => Promise<{ status: number | null; stdout: string; stderr: string }>;

const defaultSpawn: SpawnFn = (path, args, options) =>
  new Promise((resolve) => {
    const child = spawn(path, args, { env: options.env, cwd: options.cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), options.timeoutMs);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr });
    });
  });

export function parseUsage(rawOutput: string): UsageInfo | null {
  const creditsMatch = /Credits\s*\(([\d.]+)\s+of\s+([\d.]+)[^)]*\),\s*([\d.]+)%/.exec(rawOutput);
  if (!creditsMatch) {
    return null;
  }
  // Greedy [^\n]* backtracks to the last "|" on the line, which is the plan name column.
  const planMatch = /Estimated Usage[^\n]*\|\s*([^\n|]+?)\s*(?:\r?\n|$)/.exec(rawOutput);
  return {
    used: parseFloat(creditsMatch[1]),
    limit: parseFloat(creditsMatch[2]),
    percent: parseFloat(creditsMatch[3]),
    plan: planMatch ? planMatch[1].trim() : 'unknown',
  };
}

export async function getUsage(
  kiroCliPath: string,
  apiKey: string,
  spawnFn: SpawnFn = defaultSpawn,
): Promise<UsageInfo | null> {
  const result = await spawnFn(kiroCliPath, ['chat', '--no-interactive', '/usage'], {
    env: { ...process.env, KIRO_API_KEY: apiKey },
    cwd: tmpdir(),
    timeoutMs: 20000,
  });
  if (result.status !== 0) {
    return null;
  }
  return parseUsage(`${result.stdout}${result.stderr}`);
}
