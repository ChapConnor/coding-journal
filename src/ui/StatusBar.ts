import * as vscode from 'vscode';
import { Session } from '../types';

export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private session: Session | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = 'codingJournal.openTimeline';
    this.showInactive();
    this.item.show();
  }

  /** Call on every session change to keep counts current. */
  update(session: Session | null): void {
    this.session = session;

    if (!session) {
      this.stopTimer();
      this.showInactive();
      return;
    }

    if (!this.updateTimer) {
      this.startTimer();
    }

    this.render();
  }

  private render(): void {
    if (!this.session) { return; }

    const elapsed = this.formatDuration(this.session.startTime);
    const commits = this.session.events.filter((e) => e.type === 'git_commit').length;
    const notes = this.session.events.filter((e) => e.type === 'note').length;

    this.item.text = `$(notebook) ${elapsed}  $(git-commit) ${commits}  $(note) ${notes}`;
    this.item.tooltip = 'CodingJournal \u2014 click to open timeline';
  }

  private showInactive(): void {
    this.item.text = '$(notebook) Start session';
    this.item.tooltip = 'CodingJournal \u2014 click to start';
    this.item.command = 'codingJournal.startSession';
  }

  private startTimer(): void {
    // Update every 30s to keep the elapsed time ticking
    this.updateTimer = setInterval(() => {
      this.render();
    }, 30000);
  }

  private stopTimer(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  private formatDuration(startIso: string): string {
    const ms = Date.now() - new Date(startIso).getTime();
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 60) {
      return `${totalMin}m`;
    }
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return `${hours}h ${mins}m`;
  }

  dispose(): void {
    this.stopTimer();
    this.item.dispose();
  }
}
