import * as vscode from 'vscode';
import { EventType, SessionEvent, SessionEventData } from '../types';

type EventListener = (event: SessionEvent) => void;

export class EventCollector implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private listeners: EventListener[] = [];

  // Edit block tracking: group consecutive edits in same file
  private currentEditFile: string | null = null;
  private currentEditLanguage: string | null = null;
  private editBlockStart: number | null = null;
  private editBlockSaveCount = 0;
  private editBlockFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly EDIT_BLOCK_FLUSH_DELAY_MS = 5000;

  // Debug session tracking
  private activeDebugSessions = new Map<string, number>(); // sessionId -> startTimestamp

  constructor() {}

  start(): void {
    // File switches
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) { return; }
        const filePath = editor.document.uri.fsPath;
        const language = editor.document.languageId;

        // If we were tracking edits in a different file, flush that block
        if (this.currentEditFile && this.currentEditFile !== filePath) {
          this.flushEditBlock();
        }

        this.emit('file_switch', true, { filePath, language });
      })
    );

    // Save events
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.currentEditFile === doc.uri.fsPath) {
          this.editBlockSaveCount++;
        }
      })
    );

    // Edit activity (debounced via edit block tracking)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length === 0) { return; }

        const filePath = e.document.uri.fsPath;
        const language = e.document.languageId;

        if (this.currentEditFile !== filePath) {
          // New file — flush previous block, start new one
          this.flushEditBlock();
          this.currentEditFile = filePath;
          this.currentEditLanguage = language;
          this.editBlockStart = Date.now();
          this.editBlockSaveCount = 0;
        }

        // Reset the flush timer on every edit
        this.resetEditBlockFlushTimer();
      })
    );

    // Debug sessions
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => {
        this.activeDebugSessions.set(session.id, Date.now());
        this.emit('debug_start', true, { debugType: session.type });
      })
    );

    this.disposables.push(
      vscode.debug.onDidTerminateDebugSession((session) => {
        const startTime = this.activeDebugSessions.get(session.id);
        this.activeDebugSessions.delete(session.id);

        const durationMin = startTime
          ? Math.round((Date.now() - startTime) / 60000 * 10) / 10
          : undefined;

        this.emit('debug_end', true, {
          debugType: session.type,
          debugDurationMin: durationMin,
        });
      })
    );

    // Terminal events
    this.disposables.push(
      vscode.window.onDidOpenTerminal(() => {
        this.emit('terminal_open', true, {});
      })
    );

    console.log('CodingJournal: EventCollector started');
  }

  onEvent(listener: EventListener): void {
    this.listeners.push(listener);
  }

  get hasActiveDebugSession(): boolean {
    return this.activeDebugSessions.size > 0;
  }

  /** Flush any in-progress edit block (call on session end or file switch). */
  flushEditBlock(): void {
    if (this.editBlockFlushTimer) {
      clearTimeout(this.editBlockFlushTimer);
      this.editBlockFlushTimer = null;
    }

    if (this.currentEditFile && this.editBlockStart) {
      const durationMin = Math.round((Date.now() - this.editBlockStart) / 60000 * 10) / 10;

      if (durationMin > 0 || this.editBlockSaveCount > 0) {
        this.emit('edit_block', true, {
          filePath: this.currentEditFile,
          language: this.currentEditLanguage ?? undefined,
          durationMin,
          saveCount: this.editBlockSaveCount,
        });
      }
    }

    this.currentEditFile = null;
    this.currentEditLanguage = null;
    this.editBlockStart = null;
    this.editBlockSaveCount = 0;
  }

  private resetEditBlockFlushTimer(): void {
    if (this.editBlockFlushTimer) {
      clearTimeout(this.editBlockFlushTimer);
    }
    this.editBlockFlushTimer = setTimeout(() => {
      this.flushEditBlock();
    }, this.EDIT_BLOCK_FLUSH_DELAY_MS);
  }

  private emit(type: EventType, auto: boolean, data: SessionEventData): void {
    const event: SessionEvent = {
      id: generateId(),
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
    this.flushEditBlock();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.listeners = [];
  }
}

let counter = 0;
function generateId(): string {
  return `${Date.now()}-${++counter}`;
}
