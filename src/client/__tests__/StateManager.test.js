import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../js/state/StateManager.js';

function makeManager(initial = {}) {
  return new StateManager(initial);
}

describe('StateManager', () => {
  describe('dispatch', () => {
    it('updates state via a registered action', () => {
      const sm = makeManager({ count: 0 });
      sm.addAction('INCREMENT', (state, amount) => ({ ...state, count: state.count + amount }));
      sm.dispatch('INCREMENT', 5);
      expect(sm.get('count')).toBe(5);
    });

    it('throws for an unknown action', () => {
      const sm = makeManager({});
      expect(() => sm.dispatch('UNKNOWN')).toThrow(/Unknown action/);
    });

    it('throws when action handler returns a non-object', () => {
      const sm = makeManager({ x: 1 });
      sm.addAction('BAD', () => null);
      expect(() => sm.dispatch('BAD')).toThrow();
    });
  });

  describe('getState', () => {
    it('returns a shallow copy of state', () => {
      const sm = makeManager({ a: 1 });
      const s1 = sm.getState();
      const s2 = sm.getState();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2); // different references
    });
  });

  describe('setState', () => {
    it('merges updates into existing state', () => {
      const sm = makeManager({ a: 1, b: 2 });
      sm.setState({ b: 99 });
      expect(sm.get('a')).toBe(1);
      expect(sm.get('b')).toBe(99);
    });

    it('throws for a non-object argument', () => {
      const sm = makeManager({});
      expect(() => sm.setState(null)).toThrow();
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('notifies observer when a subscribed key changes', () => {
      const sm = makeManager({ count: 0 });
      const cb = vi.fn();
      sm.subscribe('count', cb);
      sm.setState({ count: 42 });
      expect(cb).toHaveBeenCalledOnce();
      expect(cb.mock.calls[0][0].newValue).toBe(42);
    });

    it('does not notify after unsubscribing', () => {
      const sm = makeManager({ count: 0 });
      const cb = vi.fn();
      const unsub = sm.subscribe('count', cb);
      unsub();
      sm.setState({ count: 1 });
      expect(cb).not.toHaveBeenCalled();
    });

    it('wildcard * observer receives all changes', () => {
      const sm = makeManager({ a: 1, b: 2 });
      const cb = vi.fn();
      sm.subscribe('*', cb);
      sm.setState({ a: 99 });
      expect(cb).toHaveBeenCalledOnce();
    });

    it('throws when callback is not a function', () => {
      const sm = makeManager({});
      expect(() => sm.subscribe('key', 'not-a-function')).toThrow();
    });
  });

  describe('addAction', () => {
    it('throws when handler is not a function', () => {
      const sm = makeManager({});
      expect(() => sm.addAction('X', 'notAFunction')).toThrow();
    });
  });
});
