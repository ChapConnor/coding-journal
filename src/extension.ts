import * as vscode from 'vscode';
import { EventCollector } from './session/EventCollector';
import { GitWatcher } from './session/GitWatcher';
import { IdleDetector } from './session/IdleDetector';
import { BreakpointDetector } from './session/BreakpointDetector';
import { SessionManager } from './session/SessionManager';
import { SessionStore } from './storage/SessionStore';
import { JournalPrompt } from './ui/JournalPrompt';
import { StatusBar } from './ui/StatusBar';
import { PromptContext } from './types';

let sessionManager: SessionManager | undefined;
let journalPrompt: JournalPrompt | undefined;

async function handlePrompt(ctx: PromptContext, mgr: SessionManager, prompt: JournalPrompt): Promise<void> {
  const result = await prompt.show(ctx);
  if (result.text) {
    mgr.addNote(result.text, ctx.relatedEvent?.type ?? ctx.trigger as any, ctx.placeholder);
    vscode.window.setStatusBarMessage('CodingJournal: Note saved', 2000);
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('CodingJournal: Extension activated');

  const eventCollector = new EventCollector();
  const gitWatcher = new GitWatcher();
  const idleDetector = new IdleDetector();
  const breakpointDetector = new BreakpointDetector(eventCollector);
  const store = new SessionStore();
  journalPrompt = new JournalPrompt();
  const statusBar = new StatusBar();
  sessionManager = new SessionManager(eventCollector, gitWatcher, idleDetector, breakpointDetector, store);

  // Keep status bar in sync with session state
  sessionManager.onChange((session) => statusBar.update(session));

  context.subscriptions.push(eventCollector);
  context.subscriptions.push(gitWatcher);
  context.subscriptions.push(idleDetector);
  context.subscriptions.push(breakpointDetector);
  context.subscriptions.push(journalPrompt);
  context.subscriptions.push(statusBar);
  context.subscriptions.push(sessionManager);

  // When a breakpoint fires, show the contextual prompt
  const jp = journalPrompt;
  breakpointDetector.onBreakpoint((ctx) => {
    if (sessionManager?.isActive) {
      handlePrompt(ctx, sessionManager, jp);
    }
  });

  // Auto-start session if configured
  const config = vscode.workspace.getConfiguration('codingJournal');
  if (config.get<boolean>('autoStart', true)) {
    sessionManager.startSession();
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codingJournal.addNote', async () => {
      if (!sessionManager?.isActive) {
        vscode.window.showWarningMessage('CodingJournal: No active session. Start one first.');
        return;
      }
      const ctx = breakpointDetector.fireManual();
      await handlePrompt(ctx, sessionManager, jp);
    }),

    vscode.commands.registerCommand('codingJournal.startSession', async () => {
      if (sessionManager?.isActive) {
        vscode.window.showInformationMessage('CodingJournal: Session already active.');
        return;
      }
      await sessionManager?.startSession();
      vscode.window.showInformationMessage('CodingJournal: Session started.');
    }),

    vscode.commands.registerCommand('codingJournal.endSession', async () => {
      if (!sessionManager?.isActive) {
        vscode.window.showWarningMessage('CodingJournal: No active session.');
        return;
      }

      const ctx = breakpointDetector.fireSessionEnd();
      await handlePrompt(ctx, sessionManager, jp);

      const filePath = await sessionManager.endSession();
      if (filePath) {
        vscode.window.showInformationMessage(`CodingJournal: Session saved to ${filePath}`);
      }
    }),

    vscode.commands.registerCommand('codingJournal.openTimeline', () => {
      vscode.window.showInformationMessage('CodingJournal: Timeline (not yet implemented)');
    }),

    vscode.commands.registerCommand('codingJournal.exportSession', () => {
      vscode.window.showInformationMessage('CodingJournal: Export (not yet implemented)');
    }),

    vscode.commands.registerCommand('codingJournal.viewPastSessions', async () => {
      const sessions = await store.list();
      if (sessions.length === 0) {
        vscode.window.showInformationMessage('CodingJournal: No past sessions found.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        sessions.map((s) => ({ label: s.name, filePath: s.filePath })),
        { placeHolder: 'Select a session to view' }
      );
      if (picked) {
        const doc = await vscode.workspace.openTextDocument(picked.filePath);
        await vscode.window.showTextDocument(doc);
      }
    }),
  );
}

export function deactivate() {
  if (sessionManager?.isActive) {
    sessionManager.endSession();
  }
  console.log('CodingJournal: Extension deactivated');
}
