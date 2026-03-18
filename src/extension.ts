import * as vscode from 'vscode';
import { EventCollector } from './session/EventCollector';
import { GitWatcher } from './session/GitWatcher';
import { IdleDetector } from './session/IdleDetector';
import { BreakpointDetector } from './session/BreakpointDetector';
import { SessionManager } from './session/SessionManager';
import { SessionStore } from './storage/SessionStore';
import { JournalPrompt } from './ui/JournalPrompt';
import { StatusBar } from './ui/StatusBar';
import { TimelinePanel } from './ui/TimelinePanel';
import { MarkdownExporter } from './export/MarkdownExporter';
import { ObsidianExporter } from './export/ObsidianExporter';
import { TwitterService } from './share/TwitterService';
import { PromptContext, Session } from './types';

let sessionManager: SessionManager | undefined;
let journalPrompt: JournalPrompt | undefined;

async function exportSession(session: Session, md: MarkdownExporter, obs: ObsidianExporter): Promise<string | null> {
  const format = vscode.workspace.getConfiguration('codingJournal').get<string>('exportFormat', 'markdown');
  try {
    if (format === 'obsidian') {
      const filePath = await obs.export(session);
      vscode.window.showInformationMessage(`CodingJournal: Exported to Obsidian \u2014 ${filePath}`);
      return filePath;
    } else {
      const filePath = await md.export(session);
      vscode.window.showInformationMessage(`CodingJournal: Exported to ${filePath}`);
      return filePath;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`CodingJournal: Export failed \u2014 ${msg}`);
    return null;
  }
}

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
  const timelinePanel = new TimelinePanel(context.extensionPath);
  const markdownExporter = new MarkdownExporter();
  const obsidianExporter = new ObsidianExporter(markdownExporter);
  const twitterService = new TwitterService(context.secrets);
  sessionManager = new SessionManager(eventCollector, gitWatcher, idleDetector, breakpointDetector, store);

  // Keep status bar and timeline in sync with session state
  sessionManager.onChange((session) => {
    statusBar.update(session);
    timelinePanel.update(session);
  });

  context.subscriptions.push(eventCollector);
  context.subscriptions.push(gitWatcher);
  context.subscriptions.push(idleDetector);
  context.subscriptions.push(breakpointDetector);
  context.subscriptions.push(journalPrompt);
  context.subscriptions.push(statusBar);
  context.subscriptions.push(timelinePanel);
  context.subscriptions.push(sessionManager);
  context.subscriptions.push(twitterService);

  // When a breakpoint fires, show the contextual prompt
  const jp = journalPrompt;
  breakpointDetector.onBreakpoint((ctx) => {
    if (sessionManager?.isActive) {
      handlePrompt(ctx, sessionManager, jp);
    }
  });

  // Check for crashed session, then auto-start if configured
  const sm = sessionManager;
  (async () => {
    const resumed = await sm.checkForRecovery();
    if (!resumed) {
      const config = vscode.workspace.getConfiguration('codingJournal');
      if (config.get<boolean>('autoStart', true)) {
        await sm.startSession();
      }
    }
  })();

  // React to config changes that affect status bar display
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('codingJournal')) {
        // StatusBar and other components read config on each use,
        // so just trigger a refresh
        const session = sm.getSession();
        if (session) {
          statusBar.update(session);
        }
      }
    })
  );

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

      // Export and auto-share before ending (session data is still available)
      const session = sessionManager.getSession();
      if (session) {
        await exportSession(session, markdownExporter, obsidianExporter);
        await twitterService.shareSession(session);
      }

      const filePath = await sessionManager.endSession();
      if (filePath) {
        vscode.window.showInformationMessage(`CodingJournal: Session saved to ${filePath}`);
      }
    }),

    vscode.commands.registerCommand('codingJournal.openTimeline', () => {
      const session = sessionManager?.getSession();
      if (!session) {
        vscode.window.showWarningMessage('CodingJournal: No active session.');
        return;
      }
      timelinePanel.show(session);
    }),

    vscode.commands.registerCommand('codingJournal.exportSession', async () => {
      const session = sessionManager?.getSession();
      if (!session) {
        vscode.window.showWarningMessage('CodingJournal: No active session to export.');
        return;
      }
      const exportPath = await exportSession(session, markdownExporter, obsidianExporter);
      if (exportPath) {
        const doc = await vscode.workspace.openTextDocument(exportPath);
        await vscode.window.showTextDocument(doc, { preview: true });
      }
    }),

    vscode.commands.registerCommand('codingJournal.connectTwitter', async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Twitter API Key (Consumer Key)',
        ignoreFocusOut: true,
      });
      if (!apiKey) { return; }

      const apiKeySecret = await vscode.window.showInputBox({
        prompt: 'Twitter API Key Secret (Consumer Secret)',
        ignoreFocusOut: true,
        password: true,
      });
      if (!apiKeySecret) { return; }

      const accessToken = await vscode.window.showInputBox({
        prompt: 'Twitter Access Token',
        ignoreFocusOut: true,
      });
      if (!accessToken) { return; }

      const accessTokenSecret = await vscode.window.showInputBox({
        prompt: 'Twitter Access Token Secret',
        ignoreFocusOut: true,
        password: true,
      });
      if (!accessTokenSecret) { return; }

      await twitterService.setCredentials({ apiKey, apiKeySecret, accessToken, accessTokenSecret });

      // Enable auto-share
      const config = vscode.workspace.getConfiguration('codingJournal');
      await config.update('twitterAutoShare', true, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage('CodingJournal: X/Twitter connected! Sessions will auto-share when ended.');
    }),

    vscode.commands.registerCommand('codingJournal.disconnectTwitter', async () => {
      await twitterService.clearCredentials();
      const config = vscode.workspace.getConfiguration('codingJournal');
      await config.update('twitterAutoShare', false, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('CodingJournal: X/Twitter disconnected.');
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
