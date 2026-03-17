import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Session } from '../types';

export class TimelinePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private extensionPath: string;
  private disposables: vscode.Disposable[] = [];

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
    this.panel?.webview.postMessage({ command: 'update', session });
  }

  private getHtml(): string {
    const htmlPath = path.join(this.extensionPath, 'src', 'ui', 'timeline.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    // Generate a nonce for the CSP
    const nonce = crypto.randomBytes(16).toString('hex');
    html = html.replace(/\{\{nonce\}\}/g, nonce);

    return html;
  }

  dispose(): void {
    this.close();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
