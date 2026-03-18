import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Session } from '../types';

export class TimelinePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private extensionPath: string;
  private disposables: vscode.Disposable[] = [];
  private lastSession: Session | null = null;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  show(session: Session): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.sendUpdate(session);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'codingJournalTimeline',
      'CodingJournal Timeline',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    this.panel.webview.html = this.getHtml();

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        switch (msg.command) {
          case 'addNote':
            vscode.commands.executeCommand('codingJournal.addNote');
            break;
          case 'endSession':
            vscode.commands.executeCommand('codingJournal.endSession');
            break;
          case 'shareOnX':
            this.shareOnX();
            break;
        }
      },
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(
      () => { this.panel = null; },
      undefined,
      this.disposables,
    );

    this.sendUpdate(session);
  }

  /** Push a session update to the webview. */
  update(session: Session): void {
    this.lastSession = session;
    if (this.panel) {
      this.sendUpdate(session);
    }
  }

  /** Close the panel if the session ends. */
  close(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }

  get isVisible(): boolean {
    return this.panel !== null;
  }

  private sendUpdate(session: Session): void {
    this.lastSession = session;
    this.panel?.webview.postMessage({ command: 'update', session });
  }

  private getHtml(): string {
    // Try packaged location first (out/), then source (src/) for dev mode
    const candidates = [
      path.join(this.extensionPath, 'out', 'ui', 'timeline.html'),
      path.join(this.extensionPath, 'src', 'ui', 'timeline.html'),
    ];

    let html = '';
    for (const htmlPath of candidates) {
      try {
        html = fs.readFileSync(htmlPath, 'utf-8');
        break;
      } catch {
        // try next candidate
      }
    }

    if (!html) {
      return '<html><body><p>Error: Could not load timeline view. Please reinstall the extension.</p></body></html>';
    }

    // Generate a nonce for the CSP
    const nonce = crypto.randomBytes(16).toString('hex');
    html = html.replace(/\{\{nonce\}\}/g, nonce);

    return html;
  }

  private shareOnX(): void {
    if (!this.lastSession) { return; }

    const session = this.lastSession;
    const start = new Date(session.startTime);
    const elapsed = this.formatDuration(start);
    const commits = session.events.filter(e => e.type === 'git_commit').length;
    const notes = session.events.filter(e => e.type === 'note').length;

    let linesAdded = 0;
    let linesRemoved = 0;
    for (const e of session.events) {
      if (e.type === 'git_commit') {
        linesAdded += e.data.linesAdded ?? 0;
        linesRemoved += e.data.linesRemoved ?? 0;
      }
    }

    const parts: string[] = [];
    parts.push(`Just wrapped a ${elapsed} coding session on ${session.workspace}`);
    if (commits > 0) {
      parts.push(`${commits} commit${commits !== 1 ? 's' : ''} (+${linesAdded}/-${linesRemoved})`);
    }
    if (notes > 0) {
      parts.push(`${notes} note${notes !== 1 ? 's' : ''} captured`);
    }
    parts.push('\n\nLogged with CodingJournal for VS Code');

    const text = parts.join(' \u00B7 ');
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private formatDuration(start: Date): string {
    const ms = Date.now() - start.getTime();
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 60) { return `${totalMin}m`; }
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  dispose(): void {
    this.close();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
