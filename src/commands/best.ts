import { listAccounts, type AccountRow, type ListDeps } from './list.js';

export type BestResult = { ok: true; name: string; remaining: number } | { ok: false; error: string };

export function pickBest(rows: AccountRow[]): BestResult {
  if (rows.length === 0) {
    return { ok: false, error: 'No accounts registered. Use "kswap add <name> <key>".' };
  }
  let best: { name: string; remaining: number } | null = null;
  for (const row of rows) {
    if (!row.usage) {
      continue;
    }
    const remaining = row.usage.limit - row.usage.used;
    if (!best || remaining > best.remaining) {
      best = { name: row.name, remaining };
    }
  }
  if (!best) {
    return { ok: false, error: 'Could not read credit usage for any account, so no "best" account can be chosen.' };
  }
  return { ok: true, ...best };
}

export async function findBestAccount(deps?: ListDeps): Promise<BestResult> {
  return pickBest(await listAccounts(deps));
}
