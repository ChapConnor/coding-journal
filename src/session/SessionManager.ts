import * as vscode from 'vscode';
import { Session, SessionEvent, SessionEventData, EventType } from '../types';
import { EventCollector } from './EventCollector';
import { GitWatcher } from './GitWatcher';
import { IdleDetector } from './IdleDetector';
import { BreakpointDetector } from './BreakpointDetector';
import { SessionStore } from '../storage/SessionStore';

type SessionChangeListener = (session: Session) => void;

export class SessionManager implements vscode.Disposable {
  private session: Session | null = null;
  private eventCollector: EventCollector;
  private gitWatcher: GitWatcher;
  private idleDetector: IdleDetector;
  private breakpointDetector: BreakpointDetector;
  private store: SessionStore;
  private listeners: SessionChangeListener[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor(eventCollector: EventCollector, gitWatcher: GitWatcher, idleDetector: IdleDetector, breakpointDetector: BreakpointDetector, store: SessionStore) {
    this.eventCollector = eventCollector;
    this.gitWatcher = gitWatcher;
    this.idleDetector = idleDetector;
    this.breakpointDetector = breakpointDetector;
    this.store = store;

    // Forward collected events into the active session and breakpoint detector
    const forwardEvent = (event: SessionEvent) => {
      if (this.session) {
        this.session.events.push(event);
        this.breakpointDetector.handleEvent(event);
        this.notifyListeners();
      }
    };

    this.eventCollector.onEvent(forwardEvent);
    this.gitWatcher.onEvent(forwardEvent);
    this.idleDetector.onEvent(forwardEvent);
  }

  async startSession(): Promise<void> {
    if (this.session) {
      console.log('CodingJournal: Session already active');
      return;
    }

    const workspace = this.getWorkspaceName();
    const branch = await this.gitWatcher.getCurrentBranch() ?? await this.getCurrentBranch();

    this.session = {
      id: `${Date.now()}`,
      startTime: new Date().toISOString(),
      endTime: null,
      workspace,
      branch,
      gitRemote: null,
      events: [],
    };

    this.addEvent('session_start', true, {});
    this.eventCollector.start();
    await this.gitWatcher.start();
    this.idleDetector.start();
    this.notifyListeners();

    console.log(`CodingJournal: Session started — ${workspace} (${branch ?? 'no branch'})`);
  }

  async endSession(): Promise<string | null> {
    if (!this.session) {
      console.log('CodingJournal: No active session to end');
      return null;
    }

    // Flush any in-progress edit block
    this.eventCollector.flushEditBlock();

    this.addEvent('session_end', true, {});
    this.session.endTime = new Date().toISOString();

    const filePath = await this.store.save(this.session);
    const savedSession = this.session;
    this.session = null;
    this.notifyListeners();

    console.log(`CodingJournal: Session ended — ${savedSession.workspace}`);
    return filePath;
  }

  addNote(text: string, triggeredBy?: EventType, promptText?: string): void {
    if (!this.session) { return; }

    this.addEvent('note', false, {
      noteText: text,
      triggeredBy,
      promptText,
    });
  }

  getSession(): Session | null {
    return this.session;
  }

  get isActive(): boolean {
    return this.session !== null;
  }

  onChange(listener: SessionChangeListener): void {
    this.listeners.push(listener);
  }

  private addEvent(type: EventType, auto: boolean, data: SessionEventData): void {
    if (!this.session) { return; }

    const event: SessionEvent = {
      id: `${Date.now()}-${this.session.events.length}`,
      timestamp: new Date().toISOString(),
      type,
      auto,
      data,
    };

    this.session.events.push(event);
    this.notifyListeners();
  }

  private notifyListeners(): void {
    if (!this.session) { return; }
    for (const listener of this.listeners) {
      listener(this.session);
    }
  }

  private getWorkspaceName(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].name;
    }
    return 'untitled';
  }

  private async getCurrentBranch(): Promise<string | null> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (gitExtension) {
        const git = gitExtension.isActive
          ? gitExtension.exports.getAPI(1)
          : (await gitExtension.activate()).getAPI(1);

        const repos = git.repositories;
        if (repos.length > 0 && repos[0].state.HEAD) {
          return repos[0].state.HEAD.name ?? null;
        }
      }
    } catch {
      // git extension not available — not critical
    }
    return null;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
