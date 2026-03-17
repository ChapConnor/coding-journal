import * as vscode from 'vscode';
import { exec } from 'child_process';
import { SessionEvent, SessionEventData } from '../types';

type GitEventListener = (event: SessionEvent) => void;

interface CommitInfo {
  hash: string;
  message: string;
  timestamp: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export class GitWatcher implements vscode.Disposable {
  private listeners: GitEventListener[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastCommitHash: string | null = null;
  private lastStagedState: boolean = false;
  private workspacePath: string | null = null;
  private readonly POLL_INTERVAL_MS = 10000; // 10s — plan says 30s but faster feels more responsive

  constructor() {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      this.workspacePath = folders[0].uri.fsPath;
    }
  }

  async start(): Promise<void> {
    if (!this.workspacePath) {
      console.log('CodingJournal: GitWatcher — no workspace folder, skipping');
      return;
    }

    // Seed with current HEAD so we don't fire on the first poll
    this.lastCommitHash = await this.getHeadHash();

    this.pollTimer = setInterval(() => {
      this.poll();
    }, this.POLL_INTERVAL_MS);

    console.log('CodingJournal: GitWatcher started');
  }

  onEvent(listener: GitEventListener): void {
    this.listeners.push(listener);
  }

  async getCurrentBranch(): Promise<string | null> {
    if (!this.workspacePath) { return null; }
    try {
      const result = await this.git('rev-parse --abbrev-ref HEAD');
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  private async poll(): Promise<void> {
    try {
      await this.checkForNewCommit();
      await this.checkStagingArea();
    } catch {
      // git not available or not a repo — silently skip
    }
  }

  private async checkForNewCommit(): Promise<void> {
    const currentHash = await this.getHeadHash();
    if (!currentHash || currentHash === this.lastCommitHash) { return; }

    this.lastCommitHash = currentHash;

    const info = await this.getCommitInfo(currentHash);
    if (!info) { return; }

    this.emit('git_commit', true, {
      commitHash: info.hash,
      commitMessage: info.message,
      filesChanged: info.filesChanged,
      linesAdded: info.linesAdded,
      linesRemoved: info.linesRemoved,
    });
  }

  private async checkStagingArea(): Promise<void> {
    const staged = await this.hasStagedChanges();
    if (staged && !this.lastStagedState) {
      this.emit('git_stage', true, {});
    }
    this.lastStagedState = staged;
  }

  private async getHeadHash(): Promise<string | null> {
    try {
      const result = await this.git('rev-parse HEAD');
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  private async getCommitInfo(hash: string): Promise<CommitInfo | null> {
    try {
      // Get hash, message, and timestamp
      const logResult = await this.git(`log -1 --format="%H|%s|%aI" ${hash}`);
      const [commitHash, message, timestamp] = logResult.trim().split('|');

      // Get diff stats
      const statResult = await this.git(`diff --shortstat ${hash}~1 ${hash}`);
      const { filesChanged, linesAdded, linesRemoved } = this.parseShortstat(statResult);

      return {
        hash: commitHash,
        message,
        timestamp,
        filesChanged,
        linesAdded,
        linesRemoved,
      };
    } catch {
      // Could be initial commit (no parent) — try without diff
      try {
        const logResult = await this.git(`log -1 --format="%H|%s|%aI" ${hash}`);
        const [commitHash, message, timestamp] = logResult.trim().split('|');
        return { hash: commitHash, message, timestamp, filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
      } catch {
        return null;
      }
    }
  }

  private parseShortstat(stat: string): { filesChanged: number; linesAdded: number; linesRemoved: number } {
    const filesMatch = stat.match(/(\d+) file/);
    const addMatch = stat.match(/(\d+) insertion/);
    const delMatch = stat.match(/(\d+) deletion/);
    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      linesAdded: addMatch ? parseInt(addMatch[1], 10) : 0,
      linesRemoved: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  }

  private async hasStagedChanges(): Promise<boolean> {
    try {
      const result = await this.git('diff --cached --stat');
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  private git(args: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(`git ${args}`, { cwd: this.workspacePath! }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  private emit(type: 'git_commit' | 'git_stage', auto: boolean, data: SessionEventData): void {
    const event: SessionEvent = {
      id: `${Date.now()}-git-${type}`,
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.listeners = [];
  }
}
