import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlopCache } from '../js/api.js';

describe('SlopCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SlopCache(3, 1000); // maxSize=3, ttl=1s
  });

  it('stores and retrieves a value', () => {
    cache.set('key1', { data: 'hello' });
    expect(cache.get('key1')).toEqual({ data: 'hello' });
  });

  it('returns null for a missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns null for an expired entry', () => {
    vi.useFakeTimers();
    cache.set('key1', 'value');
    vi.advanceTimersByTime(1001);
    expect(cache.get('key1')).toBeNull();
    vi.useRealTimers();
  });

  it('has() returns false for expired entries', () => {
    vi.useFakeTimers();
    cache.set('key1', 'value');
    vi.advanceTimersByTime(1001);
    expect(cache.has('key1')).toBe(false);
    vi.useRealTimers();
  });

  it('evicts the least-recently-used entry when maxSize is reached', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // access 'a' → it moves to end (MRU), 'b' becomes LRU
    cache.set('d', 4); // triggers eviction of 'b' (LRU)
    expect(cache.get('b')).toBeNull(); // 'b' was evicted
    expect(cache.get('a')).toBe(1);   // 'a' was accessed, kept
    expect(cache.get('d')).toBe(4);
  });

  it('delete() removes a specific entry', () => {
    cache.set('key1', 'value');
    cache.delete('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('clear() empties the cache', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('clearPattern() removes entries matching a regex pattern', () => {
    cache.set('games?page=1', 'result1');
    cache.set('games?page=2', 'result2');
    cache.set('suggestions?q=val', 'sugg');
    cache.clearPattern('^games');
    expect(cache.get('games?page=1')).toBeNull();
    expect(cache.get('games?page=2')).toBeNull();
    expect(cache.get('suggestions?q=val')).toBe('sugg');
  });
});
