import { describe, it, expect } from 'vitest';
import { cmdShimContent, ps1ShimContent } from './shim.js';

describe('cmdShimContent', () => {
  it('invokes node on the shim runner and forwards all arguments', () => {
    const content = cmdShimContent('C:\\Users\\me\\.kswap\\dist\\shimRunner.js');
    expect(content).toContain('node "C:\\Users\\me\\.kswap\\dist\\shimRunner.js" %*');
  });
});

describe('ps1ShimContent', () => {
  it('invokes node on the shim runner, forwards args, and forwards the exit code', () => {
    const content = ps1ShimContent('C:\\Users\\me\\.kswap\\dist\\shimRunner.js');
    expect(content).toContain('node "C:\\Users\\me\\.kswap\\dist\\shimRunner.js" @args');
    expect(content).toContain('exit $LASTEXITCODE');
  });
});
