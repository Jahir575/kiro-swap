export function cmdShimContent(shimRunnerJsPath: string): string {
  return `@echo off\r\nnode "${shimRunnerJsPath}" %*\r\n`;
}

export function shShimContent(shimRunnerJsPath: string): string {
  return `#!/bin/sh\nexec node "${shimRunnerJsPath}" "$@"\n`;
}

export function ps1ShimContent(shimRunnerJsPath: string): string {
  return `& node "${shimRunnerJsPath}" @args\nexit $LASTEXITCODE\n`;
}
