import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { Session, SessionEvent, SessionStats } from '../types';

export class MarkdownExporter {
  async export(session: Session, outputDir?: string): Promise<string> {
    const dir = outputDir ?? this.configuredExportDir();
    await fs.promises.mkdir(dir, { recursive: true });

    const fileName = this.buildFileName(session);
    const filePath = path.join(dir, fileName);
    const markdown = this.render(session);

    await fs.promises.writeFile(filePath, markdown, 'utf-8');
    console.log(`CodingJournal: Exported to ${filePath}`);
    return filePath;
  }

  render(session: Session): string {
    const stats = this.computeStats(session);
    const lines: string[] = [];

    // Header
    const date = new Date(session.startTime);
    const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    lines.push(`# Coding Session \u2014 ${dateStr}`);
    lines.push('');

    // Metadata
    const meta: string[] = [];
    meta.push(`**Workspace**: ${session.workspace}`);
    if (session.branch) {
      meta[0] += ` \u00B7 **Branch**: ${session.branch}`;
    }

    const duration = this.formatMin(stats.totalDurationMin);
    const active = this.formatMin(stats.activeDurationMin);
    const idle = this.formatMin(stats.idleDurationMin);
    meta.push(`**Duration**: ${duration} (active: ${active} \u00B7 idle: ${idle})`);

    const diffStr = `+${stats.linesAdded} / \u2212${stats.linesRemoved}`;
    meta.push(`**Commits**: ${stats.commitCount} (${diffStr}) \u00B7 **Notes**: ${stats.noteCount}`);

    lines.push(meta.join('\n'));
    lines.push('');
    lines.push('---');
    lines.push('');

    // Timeline
    for (const event of session.events) {
      const line = this.renderEvent(event);
      if (line) {
        lines.push(line);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private renderEvent(event: SessionEvent): string | null {
    const time = this.formatTime(event.timestamp);

    switch (event.type) {
      case 'session_start':
        return `${time}  Session started`;

      case 'session_end':
        return `${time}  Session ended`;

      case 'edit_block': {
        const file = this.shortenPath(event.data.filePath ?? '');
        const dur = event.data.durationMin ?? 0;
        const saves = event.data.saveCount ?? 0;
        return `${time}  ${file} \u00B7 ${this.formatMin(dur)} \u00B7 ${saves} save${saves !== 1 ? 's' : ''}`;
      }

      case 'git_commit': {
        const added = event.data.linesAdded ?? 0;
        const removed = event.data.linesRemoved ?? 0;
        const msg = event.data.commitMessage ?? '';
        return `${time}  \u2705 ${msg} (+${added} \u2212${removed})`;
      }

      case 'idle_start': {
        return `${time}  Idle started`;
      }

      case 'idle_end': {
        const dur = event.data.idleDurationMin ?? 0;
        const type = event.data.idleType === 'long' ? 'Long idle' : 'Idle';
        return `${time}  ${type} \u00B7 ${this.formatMin(dur)}`;
      }

      case 'debug_start': {
        const type = event.data.debugType ?? 'unknown';
        return `${time}  Debug session started (${type})`;
      }

      case 'debug_end': {
        const type = event.data.debugType ?? 'unknown';
        const dur = event.data.debugDurationMin ?? 0;
        return `${time}  Debug session ended (${type}) \u00B7 ${this.formatMin(dur)}`;
      }

      case 'note': {
        const text = event.data.noteText ?? '';
        // Indent continuation lines for multi-line notes
        const indented = text.replace(/\n/g, '\n           ');
        return `${time}  \uD83D\uDCDD "${indented}"`;
      }

      case 'terminal_open':
        return `${time}  Terminal opened`;

      case 'file_switch':
      case 'git_stage':
        // Too noisy for the export — skip
        return null;

      default:
        return null;
    }
  }

  private computeStats(session: Session): SessionStats {
    const start = new Date(session.startTime).getTime();
    const end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
    const totalDurationMin = Math.round((end - start) / 60000);

    let idleDurationMin = 0;
    for (const e of session.events) {
      if (e.type === 'idle_end' && e.data.idleDurationMin) {
        idleDurationMin += e.data.idleDurationMin;
      }
    }

    const activeDurationMin = Math.max(0, totalDurationMin - Math.round(idleDurationMin));

    let commitCount = 0;
    let noteCount = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const e of session.events) {
      if (e.type === 'git_commit') {
        commitCount++;
        linesAdded += e.data.linesAdded ?? 0;
        linesRemoved += e.data.linesRemoved ?? 0;
      }
      if (e.type === 'note') {
        noteCount++;
      }
    }

    return { totalDurationMin, activeDurationMin, idleDurationMin: Math.round(idleDurationMin), commitCount, noteCount, linesAdded, linesRemoved };
  }

  private formatTime(iso: string): string {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  private formatMin(minutes: number): string {
    if (minutes < 1) { return '<1m'; }
    if (minutes < 60) { return `${Math.round(minutes)}m`; }
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  private shortenPath(filePath: string): string {
    // Show last two segments: dir/file.ext
    const parts = filePath.replace(/\\/g, '/').split('/');
    if (parts.length <= 2) { return filePath; }
    return parts.slice(-2).join('/');
  }

  private buildFileName(session: Session): string {
    const date = new Date(session.startTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const workspace = session.workspace.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 50) || 'untitled';
    return `${d}-${workspace}.md`;
  }

  private configuredExportDir(): string {
    const configured = vscode.workspace.getConfiguration('codingJournal').get<string>('exportPath', '~/.codingjournals/exports');
    return this.expandHome(configured);
  }

  private expandHome(p: string): string {
    if (p.startsWith('~/') || p === '~') {
      return path.join(os.homedir(), p.slice(1));
    }
    return p;
  }
}
