import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
