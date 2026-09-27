import { describe, it, expect } from 'vitest';
import { VERSION } from './index.js';

describe('index', () => {
  it('exports a semver-looking version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
