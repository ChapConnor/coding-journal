import * as vscode from 'vscode';
import { SessionEvent, SessionEventData } from '../types';

type IdleEventListener = (event: SessionEvent) => void;

export class IdleDetector implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private listeners: IdleEventListener[] = [];

  private lastActivityTime: number = Date.now();
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private currentIdleStart: number | null = null;
  private isIdle = false;

  private readonly CHECK_INTERVAL_MS = 5000;

  constructor() {}

  start(): void {
    // Track any edit activity as "not idle"
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length === 0) { return; }
        this.recordActivity();
      })
    );

    // Saves also count as activity
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(() => {
        this.recordActivity();
      })
    );

    // Switching editors counts as activity
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.recordActivity();
      })
    );

    // Terminal interaction counts as activity
    this.disposables.push(
      vscode.window.onDidChangeActiveTerminal(() => {
        this.recordActivity();
      })
    );

    this.lastActivityTime = Date.now();

    this.idleCheckTimer = setInterval(() => {
      this.checkIdle();
    }, this.CHECK_INTERVAL_MS);

    console.log('CodingJournal: IdleDetector started');
  }

  get currentlyIdle(): boolean {
    return this.isIdle;
  }

  onEvent(listener: IdleEventListener): void {
    this.listeners.push(listener);
  }

  private recordActivity(): void {
    const wasIdle = this.isIdle;
    this.lastActivityTime = Date.now();

    if (wasIdle && this.currentIdleStart) {
      // Transitioning from idle -> active
      const idleDurationMin = Math.round((Date.now() - this.currentIdleStart) / 60000 * 10) / 10;
      const shortThreshold = this.getConfig('idleThresholdMinutes', 5);
      const longThreshold = this.getConfig('longIdleThresholdMinutes', 15);

      const idleType: 'short' | 'long' = idleDurationMin >= longThreshold ? 'long' : 'short';

      // Only emit idle_end if the idle was long enough to have triggered idle_start
      if (idleDurationMin >= shortThreshold) {
        this.emit('idle_end', true, {
          idleDurationMin,
          idleType,
        });
      }

      this.isIdle = false;
      this.currentIdleStart = null;
    }
  }

  private checkIdle(): void {
    if (this.isIdle) { return; } // Already idle, waiting for activity to resume

    const inactiveMs = Date.now() - this.lastActivityTime;
    const shortThresholdMs = this.getConfig('idleThresholdMinutes', 5) * 60000;

    if (inactiveMs >= shortThresholdMs) {
      this.isIdle = true;
      this.currentIdleStart = this.lastActivityTime; // Idle started when activity stopped

      this.emit('idle_start', true, {});

      console.log('CodingJournal: Idle detected');
    }
  }

  private getConfig<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('codingJournal').get<T>(key, defaultValue);
  }

  private emit(type: 'idle_start' | 'idle_end', auto: boolean, data: SessionEventData): void {
    const event: SessionEvent = {
      id: `${Date.now()}-idle`,
      timestamp: new Date().toISOString(),
      type,
      auto,
      data,
    };

    console.log(`CodingJournal: [${type}]`, JSON.stringify(data));

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.listeners = [];
  }
}
