import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdleDetector } from '../src/session/IdleDetector';
import { SessionEvent } from '../src/types';

describe('IdleDetector', () => {
  let detector: IdleDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new IdleDetector();
  });

  afterEach(() => {
    detector.dispose();
    vi.useRealTimers();
  });

  it('starts in non-idle state', () => {
    expect(detector.currentlyIdle).toBe(false);
  });

  it('detects idle after threshold', () => {
    const events: SessionEvent[] = [];
    detector.onEvent((e) => events.push(e));
    detector.start();

    // Advance past the 5-minute default threshold
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    expect(detector.currentlyIdle).toBe(true);
    expect(events.some((e) => e.type === 'idle_start')).toBe(true);
  });

  it('does not fire idle_start before threshold', () => {
    const events: SessionEvent[] = [];
    detector.onEvent((e) => events.push(e));
    detector.start();

    // Advance to just under the threshold
    vi.advanceTimersByTime(4 * 60 * 1000);

    expect(detector.currentlyIdle).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('cleans up on dispose', () => {
    detector.start();
    detector.dispose();

    // Should not throw or fire events after dispose
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(detector.currentlyIdle).toBe(false);
  });

  it('accepts event listeners', () => {
    const listener = vi.fn();
    detector.onEvent(listener);
    detector.start();

    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[0][0].type).toBe('idle_start');
  });
});
