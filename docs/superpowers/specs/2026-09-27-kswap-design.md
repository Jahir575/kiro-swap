# kswap — Kiro account switcher

Status: approved design, pre-implementation
Date: 2026-09-27

## Problem

Everyone at the company gets a per-account Kiro credit allowance. When one
person's credit runs out mid-task, they want to keep working under a
teammate's account instead of stopping — without repeatedly handling that
teammate's raw credentials by hand each time they want to switch.

This is the same problem `claude-swap` (github.com/realiti4/claude-swap)
solves for Claude Code accounts: register several accounts once, then
switch which one is active on command. `kswap` is the equivalent for Kiro.

## Why this is simpler than claude-swap

claude-swap's hardest problems (browser-SSO credential capture, OS Keychain
integration, lock coordination with Claude Code's own token refresh) don't
apply here, because Kiro's per-user API key is a static bearer credential,
not a refreshing OAuth session:

- Confirmed by hand: `kiro-cli whoami` authenticates correctly purely from
  a `KIRO_API_KEY` environment variable — no `login` flow, no browser SSO,
  no token refresh to race against.
- A teammate hands over one string (their `KIRO_API_KEY`) once. There is
  no ongoing credential-capture problem to solve.

This lets the whole design collapse to: store a set of named API keys, and
flip which one is "active" for two independent consumers.

## Scope (v1)

In scope:
- Manual add / list / switch / remove of named accounts (API key based).
- Switching updates **both** consumers of `KIRO_API_KEY` on this machine:
  - `kiro-cli` invoked from any terminal.
  - The Kiro Crew gateway (`~/.kiro/crew`).
- Plaintext local storage of keys (matches claude-swap's own default —
  its export files are plaintext too).
- Distributed as an npm package, CLI command `kswap`.

Explicitly deferred (YAGNI — revisit only if v1 proves insufficient):
- Auto-switching on exhaustion (reactive or proactive/quota-based).
- Usage dashboard / quota polling per account.
- Parallel-session mode (running two accounts at once, like `cswap run`).
- OS credential store (Windows Credential Manager) instead of a plain file.
- Encryption of the stored keys.

## Two independent consumers of `KIRO_API_KEY`

| Consumer | Reads the key | Reload behavior |
|---|---|---|
| `kiro-cli` in a terminal | Process environment, at invocation time | Immediate — every new invocation re-reads |
| Kiro Crew gateway | `~/.kiro/crew/.env`, at gateway boot | Needs a gateway restart to pick up a change |

A `kswap switch` must update both, or the two surfaces silently disagree
about which account is active.

## Architecture

A single Node/TypeScript CLI (`kswap`), with:

1. **Store** — `~/.kswap/config.json`:
   ```json
   {
     "accounts": {
       "teammate2": { "key": "...", "email": "teammate2@company.com", "addedAt": "2026-09-27T12:00:00Z" }
     },
     "active": "teammate2",
     "kiroCliPath": "C:\\Users\\...\\AppData\\Local\\Kiro-Cli\\kiro-cli.exe"
   }
   ```
   - Atomic writes: write to a temp file in the same directory, then
     rename over the target, so a crash mid-write can't corrupt the file.
   - File permissioned to the current user only (Windows ACL equivalent
     of `chmod 600`).

2. **Shim** — a `kiro-cli` shim script installed at `~/.kswap/bin/kiro-cli.cmd`
   (and a `.ps1` counterpart for PowerShell), placed on `PATH` ahead of the
   real binary:
   - On invocation, reads `active` + the matching key from the config.
   - Sets `KIRO_API_KEY` in its own process environment.
   - Execs the real `kiro-cli.exe` (path cached in config at install time)
     with all arguments forwarded, and forwards its exit code.
   - If the config is missing or corrupt, passes through to the real
     binary untouched — a broken `kswap` install must never block plain
     `kiro-cli` usage under whatever ambient auth already exists.
   - This is the mechanism that makes a switch take effect immediately in
     a terminal that's already open — no shell restart required, because
     the shim re-reads the config on every call rather than relying on an
     inherited environment variable.

3. **Installer** (`kswap install`, and/or run automatically once on first
   use) — locates the real `kiro-cli.exe` (`where kiro-cli`), writes the
   shim files, and prepends `~/.kswap/bin` to the user-level `PATH`
   (persisted the way `setx` does, so new shells inherit it). Existing
   open shells need one manual `PATH` refresh at install time — a one-time
   setup cost, not a per-switch one.

4. **Crew updater** — on `switch`, rewrites the `KIRO_API_KEY=` line in
   `~/.kiro/crew/.env` (UTF-8 **without** BOM — Windows PowerShell's
   default UTF-8 write adds a BOM that silently breaks the gateway's
   `k.strip() == key` loader check; this was already hit and fixed once
   in this environment) and restarts the gateway. The exact restart
   mechanism (a `kiro-cli crew` subcommand flag, vs. signaling the process
   behind `~/.kiro/crew/gateway.lock`) is unconfirmed and must be
   determined during implementation — this is a research task for the
   plan, not a design blocker.

## Commands

- `kswap add <name> <key>` — validates the key by running `kiro-cli whoami`
  under it (via a temporary environment override, not the shim) before
  storing; fails fast on a bad/expired key rather than at switch time.
  Caches the resulting identity (email) for display in `list`.
- `kswap list` — shows every stored account's name + cached identity,
  marking the currently active one.
- `kswap switch <name>` — sets `active` in the store, rewrites Crew's
  `.env`, restarts the Crew gateway, then re-runs `kiro-cli whoami` to
  confirm the switch actually took effect before reporting success.
- `kswap remove <name>` — deletes the account from the store; refuses if
  it is currently active (must switch away first).
- `kswap current` — prints the active account's name/identity.

## Error handling

- `add` surfaces the `whoami` failure verbatim on an invalid key; nothing
  is stored.
- `switch` rewrites `.env` and restarts Crew; if the restart fails or the
  post-switch `whoami` check doesn't match the intended account, the
  `.env` change is rolled back to its prior contents rather than left
  half-applied, and the command exits non-zero with the failure reason.
- The shim never throws where a passthrough would do instead: missing
  config, corrupt config, or a key that no longer authenticates all fall
  through to running the real `kiro-cli.exe` with the ambient environment
  unchanged, so `kswap` can only add capability, never take it away.

## Testing

- Unit tests for the store: atomic write behavior, recovery from a
  corrupt/partial file, concurrent-write safety.
- Unit tests for the shim's config-read/passthrough-fallback logic,
  run against a fake `kiro-cli` stub rather than the real binary.
- Integration test exercising `add` → `switch` → `list` → `remove`
  end-to-end against the stub, including the `.env` rewrite (verifying
  no BOM is introduced) and a stubbed Crew-restart step.
- No test coverage is planned for actually calling real Kiro accounts —
  that would require live teammate credentials, which is out of scope
  for automated tests.

## Open questions for the implementation plan

1. Exact Kiro Crew gateway restart mechanism.
2. Whether `kiro-cli` accepts `KIRO_API_KEY` unconditionally for any Kiro
   account tier used at the company, or only for accounts provisioned a
   certain way (this environment's own account already confirmed to work
   via API key, but that shouldn't be assumed universal without checking).
3. Windows `PATH`-prepend mechanics in Node (no shell-out required vs.
   using `setx`) and how `.cmd`/`.ps1` shims interact with PowerShell's
   command resolution order in practice.
