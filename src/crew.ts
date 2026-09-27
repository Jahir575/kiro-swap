import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

export function readEnvKey(envPath: string): string | null {
  if (!existsSync(envPath)) {
    return null;
  }
  const content = stripBom(readFileSync(envPath, 'utf8'));
  const match = /^KIRO_API_KEY=(.*)$/m.exec(content);
  return match ? match[1].trim() : null;
}

export function writeEnvKey(envPath: string, key: string): void {
  const existing = existsSync(envPath) ? stripBom(readFileSync(envPath, 'utf8')) : '';
  const lines = existing.length > 0 ? existing.split(/\r?\n/).filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === '')) : [];
  const keyLine = `KIRO_API_KEY=${key}`;
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (/^KIRO_API_KEY=/.test(line)) {
      replaced = true;
      return keyLine;
    }
    return line;
  });
  if (!replaced) {
    nextLines.push(keyLine);
  }
  writeFileSync(envPath, `${nextLines.join('\n')}\n`, 'utf8');
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export interface PidInfo {
  backendPid: number;
  parentPid: number;
  token: string;
}

export function readSessionPids(pidsPath: string): PidInfo | null {
  if (!existsSync(pidsPath)) {
    return null;
  }
  const content = readFileSync(pidsPath, 'utf8').trim();
  const parts = content.split(':');
  if (parts.length !== 3) {
    return null;
  }
  const backendPid = Number.parseInt(parts[0], 10);
  const parentPid = Number.parseInt(parts[1], 10);
  if (Number.isNaN(backendPid) || Number.isNaN(parentPid)) {
    return null;
  }
  return { backendPid, parentPid, token: parts[2] };
}

export interface RestartDeps {
  readSessionPids: (path: string) => PidInfo | null;
  killProcess: (pid: number) => void;
  sleep: (ms: number) => Promise<void>;
}

const realDeps: RestartDeps = {
  readSessionPids,
  killProcess: (pid) => {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } catch {
      // Already dead is fine — we only care that a *new* pid shows up next.
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function restartGateway(
  crewDir: string,
  deps: RestartDeps = realDeps,
  timeoutMs = 15000,
  pollIntervalMs = 500,
): Promise<boolean> {
  const pidsPath = join(crewDir, 'kiro_session_pids.txt');
  const before = deps.readSessionPids(pidsPath);
  if (!before) {
    return false;
  }
  deps.killProcess(before.backendPid);
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    await deps.sleep(pollIntervalMs);
    elapsed += pollIntervalMs;
    const after = deps.readSessionPids(pidsPath);
    if (after && after.backendPid !== before.backendPid) {
      return true;
    }
  }
  return false;
}
