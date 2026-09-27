# kswap

Switch between multiple Kiro accounts — `kiro-cli` and the Kiro Crew
gateway — without repeatedly handling teammates' raw credentials.

## Install

```
npm install -g @mjahir/kswap
kswap install
```

(Published as the scoped package `@mjahir/kswap` — npm's anti-typosquat
policy rejected the unscoped name `kswap` as too similar to existing
packages like `asap`/`gsap`/`soap`. The CLI command itself is still
`kswap`, unaffected by the package name.)

Open a new terminal after `kswap install` so the `PATH` change takes effect.

## Usage

```
kswap add <name> <api-key>   # register a teammate's Kiro API key once
kswap list                   # show every registered account
kswap switch <name>          # make that account active everywhere
kswap current                # show which account is active
kswap remove <name>          # forget an account (must not be active)
```

## Scope

v1 covers `kiro-cli` (terminal) and the Kiro Crew gateway. It does not
cover Kiro IDE, auto-switching on rate limits, or a usage dashboard — see
`docs/superpowers/specs/2026-09-27-kswap-design.md` for why.
