import { describe, it, expect, vi } from 'vitest';
import { prependUserPath } from './installer.js';

describe('prependUserPath', () => {
  it('does nothing when the directory is already on PATH (case-insensitive)', () => {
    const getUserPath = vi.fn(() => 'C:\\Windows;C:\\Users\\me\\.kswap\\bin;C:\\Other');
    const setUserPath = vi.fn();
    prependUserPath('c:\\users\\me\\.kswap\\bin', { getUserPath, setUserPath });
    expect(setUserPath).not.toHaveBeenCalled();
  });

  it('prepends the directory without truncating a long existing PATH', () => {
    const longPath = Array.from({ length: 50 }, (_, i) => `C:\\Some\\Long\\Directory\\Name${i}`).join(';');
    const getUserPath = vi.fn(() => longPath);
    const setUserPath = vi.fn();
    prependUserPath('C:\\Users\\me\\.kswap\\bin', { getUserPath, setUserPath });
    expect(setUserPath).toHaveBeenCalledTimes(1);
    const written = setUserPath.mock.calls[0][0] as string;
    expect(written.startsWith('C:\\Users\\me\\.kswap\\bin;')).toBe(true);
    expect(written.length).toBeGreaterThanOrEqual(longPath.length);
    expect(written).toContain(longPath);
  });
});
