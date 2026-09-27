# kswap

Switch between multiple Kiro accounts — `kiro-cli` and the Kiro Crew
gateway — without repeatedly handling teammates' raw credentials.

Register each teammate's Kiro API key once, then switch which account
is active with a single command. `kswap list` shows every account's
real, live credit usage so you know at a glance who's about to run out.

> Published on npm as **`kiro-swap`** — the unscoped name `kswap` was
> rejected by npm's anti-typosquat policy as too similar to existing
> packages like `asap`/`gsap`/`soap`. The CLI command itself is still
> `kswap`, unaffected by the package name.

## Requirements

- Windows (v1 is Windows-only — see [Scope](#scope))
- Node.js 18+
- [`kiro-cli`](https://kiro.dev) already installed and on `PATH`

## Install

```
npm install -g kiro-swap
kswap install
```

`kswap install` locates your real `kiro-cli.exe`, writes a small shim
in front of it, and adds that shim's directory to your user `PATH`.
**Open a new terminal afterwards** — Windows only picks up `PATH`
changes in new processes.

<p align="center"><img src="https://raw.githubusercontent.com/Jahir575/kiro-swap/master/assets/screenshots/install.svg" alt="kswap install" width="560"></p>

## Step-by-step guide

### 1. Register each teammate's key

Ask each teammate for their Kiro API key once, then register it under
a name you'll remember. `kswap add` validates the key against Kiro
before saving it — a typo'd key is rejected immediately, not silently
stored.

```
kswap add <name> <api-key>
```

<p align="center"><img src="https://raw.githubusercontent.com/Jahir575/kiro-swap/master/assets/screenshots/add.svg" alt="kswap add alice ...; kswap add bob ..." width="560"></p>

### 2. See who's registered and how much credit they have left

```
kswap list
```

Each row's credit percentage is fetched live from Kiro for that
account — not cached, not estimated. Green under 70% used, yellow
70–90%, red 90%+, so a teammate about to hit their limit stands out
immediately.

<p align="center"><img src="https://raw.githubusercontent.com/Jahir575/kiro-swap/master/assets/screenshots/list.svg" alt="kswap list" width="560"></p>

### 3. Switch the active account

```
kswap switch <name>
```

This updates `kiro-cli` immediately (every new terminal picks it up
right away) and rewrites the Kiro Crew gateway's stored key. Crew
loads its key once at boot, so it needs a manual restart to notice —
`kswap switch` tells you that every time, it doesn't try to restart
Crew for you.

<p align="center"><img src="https://raw.githubusercontent.com/Jahir575/kiro-swap/master/assets/screenshots/switch.svg" alt="kswap switch bob" width="660"></p>

### 4. Check which account is active

```
kswap current
```

<p align="center"><img src="https://raw.githubusercontent.com/Jahir575/kiro-swap/master/assets/screenshots/current.svg" alt="kswap current" width="440"></p>

Running `kswap list` again afterwards shows the switch took effect —
note the ● moves to `bob`, and his credit usage (89.2%, now shown in
red) is the one to watch:

<p align="center"><img src="https://raw.githubusercontent.com/Jahir575/kiro-swap/master/assets/screenshots/list-after-switch.svg" alt="kswap list, after switching to bob" width="560"></p>

### 5. Remove an account you no longer need

```
kswap remove <name>
```

`kswap` refuses to remove the currently active account, so you can't
accidentally strand `kiro-cli`/Crew with no key configured.

<p align="center"><img src="https://raw.githubusercontent.com/Jahir575/kiro-swap/master/assets/screenshots/remove.svg" alt="kswap remove alice" width="440"></p>

## Command reference

```
kswap install                # locate kiro-cli, install the PATH shim
kswap add <name> <api-key>   # register a teammate's Kiro API key once
kswap list                   # show every registered account + live credit usage
kswap switch <name>          # make that account active everywhere
kswap current                # show which account is active
kswap remove <name>          # forget an account (must not be active)
```

## Scope

v1 covers `kiro-cli` (terminal) and the Kiro Crew gateway, on Windows
only. It does not cover Kiro IDE (which authenticates via AWS Identity
Center SSO, not an API key — a different mechanism entirely),
auto-switching on rate limits, or macOS/Linux.

## License

MIT
