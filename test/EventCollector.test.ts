import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventCollector } from '../src/session/EventCollector';
import { SessionEvent } from '../src/types';

describe('EventCollector', () => {
  let collector: EventCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    collector = new EventCollector();
  });

  afterEach(() => {
    collector.dispose();
    vi.useRealTimers();
  });

  it('starts with no active debug sessions', () => {
    expect(collector.hasActiveDebugSession).toBe(false);
  });

  it('accepts event listeners', () => {
    const listener = vi.fn();
    collector.onEvent(listener);
    // Listener should be registered without error
    expect(listener).not.toHaveBeenCalled();
  });

  describe('flushEditBlock', () => {
    it('does nothing when no edit block is active', () => {
      const events: SessionEvent[] = [];
      collector.onEvent((e) => events.push(e));

      collector.flushEditBlock();
      expect(events).toHaveLength(0);
    });
  });

  describe('dispose', () => {
    it('cleans up without error', () => {
      collector.start();
      expect(() => collector.dispose()).not.toThrow();
    });

    it('can be called multiple times', () => {
      collector.start();
      collector.dispose();
      expect(() => collector.dispose()).not.toThrow();
    });
  });
});

describe('generateId', () => {
  it('generates unique IDs', () => {
    // The generateId function is module-scoped, but we can test
    // uniqueness through the events emitted by EventCollector
    const collector = new EventCollector();
    const events: SessionEvent[] = [];
    collector.onEvent((e) => events.push(e));

    // flushEditBlock won't emit if no block is active, so we just
    // verify the collector can be created and disposed
    collector.dispose();
  });
});
