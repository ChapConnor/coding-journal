export type EventType =
  | 'session_start'
  | 'session_end'
  | 'edit_block'
  | 'file_switch'
  | 'git_commit'
  | 'git_stage'
  | 'idle_start'
  | 'idle_end'
  | 'debug_start'
  | 'debug_end'
  | 'terminal_open'
  | 'note';

export interface SessionEvent {
  id: string;
  timestamp: string;
  type: EventType;
  auto: boolean;
  data: SessionEventData;
}

export interface SessionEventData {
  // edit_block
  filePath?: string;
  language?: string;
  durationMin?: number;
  saveCount?: number;

  // git
  commitHash?: string;
  commitMessage?: string;
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;

  // idle
  idleDurationMin?: number;
  idleType?: 'short' | 'long';

  // debug
  debugType?: string;
  debugDurationMin?: number;

  // note
  noteText?: string;
  triggeredBy?: EventType;
  promptText?: string;
}

export interface Session {
  id: string;
  startTime: string;
  endTime: string | null;
  workspace: string;
  branch: string | null;
  gitRemote: string | null;
  events: SessionEvent[];
}

export type BreakpointTrigger =
  | 'commit'
  | 'pre_commit'
  | 'short_idle_end'
  | 'long_idle_end'
  | 'debug_end'
  | 'context_switch'
  | 'manual'
  | 'session_end';

export interface PromptContext {
  trigger: BreakpointTrigger;
  placeholder: string;
  relatedEvent?: SessionEvent;
}

export interface ExportOptions {
  format: 'markdown' | 'obsidian';
  obsidianVaultPath?: string;
  obsidianMode?: 'standalone' | 'daily-note';
  outputPath: string;
}

export interface SessionStats {
  totalDurationMin: number;
  activeDurationMin: number;
  idleDurationMin: number;
  commitCount: number;
  noteCount: number;
  linesAdded: number;
  linesRemoved: number;
}
