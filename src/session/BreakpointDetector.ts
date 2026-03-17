import * as vscode from 'vscode';
import { SessionEvent, BreakpointTrigger, PromptContext } from '../types';
import { EventCollector } from './EventCollector';

type BreakpointListener = (context: PromptContext) => void;

const PLACEHOLDER_MAP: Record<BreakpointTrigger, string> = {
  commit: "What was that actually about? Anything the commit message doesn't capture?",
  pre_commit: 'Anything worth noting before you commit?',
  short_idle_end: 'What pulled you away? Anything to note before you dive back in?',
  long_idle_end: 'Where were you when you left off?',
  debug_end: 'What did you find? What was the actual problem?',
  context_switch: "Switching gears \u2014 what's the thread you're picking up?",
  manual: "What's on your mind?",
  session_end: "How did the session go? What's the headline?",
};

const DEBUG_SHORT_THRESHOLD_MIN = 2;

export class BreakpointDetector implements vscode.Disposable {
  private listeners: BreakpointListener[] = [];
  private eventCollector: EventCollector;
  private lastPromptTime = 0;
  private readonly MIN_PROMPT_GAP_MS: number;
  private lastFolder: string | null = null;

  constructor(eventCollector: EventCollector) {
    this.eventCollector = eventCollector;
    this.MIN_PROMPT_GAP_MS = 3 * 60 * 1000; // 3 minutes
  }

  onBreakpoint(listener: BreakpointListener): void {
    this.listeners.push(listener);
  }

  /** Call this for every session event. The detector decides whether to fire a prompt. */
  handleEvent(event: SessionEvent): void {
    switch (event.type) {
      case 'git_commit':
        if (this.isEnabled('promptOnCommit')) {
          this.tryFire('commit', event);
        }
        break;

      case 'git_stage':
        if (this.isEnabled('promptOnPreCommit')) {
          this.tryFire('pre_commit', event);
        }
        break;

      case 'idle_end':
        if (this.isEnabled('promptOnIdleEnd')) {
          const trigger: BreakpointTrigger = event.data.idleType === 'long' ? 'long_idle_end' : 'short_idle_end';
          this.tryFire(trigger, event);
        }
        break;

      case 'debug_end':
        if (this.isEnabled('promptOnDebugEnd')) {
          // Use shorter placeholder for quick debug sessions
          const isShort = event.data.debugDurationMin !== undefined && event.data.debugDurationMin < DEBUG_SHORT_THRESHOLD_MIN;
          const placeholder = isShort ? 'Quick fix or still digging?' : PLACEHOLDER_MAP.debug_end;
          this.tryFire('debug_end', event, placeholder);
        }
        break;

      case 'file_switch':
        if (this.isEnabled('promptOnContextSwitch')) {
          const folder = this.getFolderFromPath(event.data.filePath);
          if (folder && this.lastFolder && folder !== this.lastFolder) {
            this.tryFire('context_switch', event);
          }
          if (folder) {
            this.lastFolder = folder;
          }
        }
        break;
    }
  }

  /** Fire a manual prompt (Cmd+Shift+J). Bypasses rate limiting. */
  fireManual(): PromptContext {
    const context: PromptContext = {
      trigger: 'manual',
      placeholder: PLACEHOLDER_MAP.manual,
    };
    // Don't update lastPromptTime — manual notes shouldn't suppress auto prompts
    return context;
  }

  /** Fire the session-end prompt. Bypasses rate limiting. */
  fireSessionEnd(): PromptContext {
    return {
      trigger: 'session_end',
      placeholder: PLACEHOLDER_MAP.session_end,
    };
  }

  private tryFire(trigger: BreakpointTrigger, relatedEvent: SessionEvent, placeholderOverride?: string): void {
    // Never prompt during an active debug session
    if (this.eventCollector.hasActiveDebugSession) { return; }

    // Rate limit: minimum 3 minutes between auto prompts
    const now = Date.now();
    if (now - this.lastPromptTime < this.MIN_PROMPT_GAP_MS) { return; }

    this.lastPromptTime = now;

    const context: PromptContext = {
      trigger,
      placeholder: placeholderOverride ?? PLACEHOLDER_MAP[trigger],
      relatedEvent,
    };

    for (const listener of this.listeners) {
      listener(context);
    }
  }

  private isEnabled(configKey: string): boolean {
    return vscode.workspace.getConfiguration('codingJournal').get<boolean>(configKey, false);
  }

  private getFolderFromPath(filePath?: string): string | null {
    if (!filePath) { return null; }
    // Extract first two path segments after workspace root as the "folder"
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }
    const relative = filePath.replace(folders[0].uri.fsPath, '');
    const parts = relative.split('/').filter(Boolean);
    return parts.length > 0 ? parts[0] : null;
  }

  dispose(): void {
    this.listeners = [];
  }
}
