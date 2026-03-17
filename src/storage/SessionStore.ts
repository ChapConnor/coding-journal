import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { Session } from '../types';

export class SessionStore {
  private storagePath: string;

  constructor() {
    this.storagePath = this.resolveStoragePath();
  }

  async save(session: Session): Promise<string> {
    await this.ensureDir(this.storagePath);

    const fileName = this.buildFileName(session);
    const filePath = path.join(this.storagePath, fileName);

    await fs.promises.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
    console.log(`CodingJournal: Session saved to ${filePath}`);
    return filePath;
  }

  async load(filePath: string): Promise<Session> {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Session;
  }

  async list(): Promise<{ filePath: string; name: string }[]> {
    await this.ensureDir(this.storagePath);

    const files = await fs.promises.readdir(this.storagePath);
    return files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .map((f) => ({
        filePath: path.join(this.storagePath, f),
        name: f.replace('.json', ''),
      }));
  }

  async delete(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath);
  }

  getStoragePath(): string {
    return this.storagePath;
  }

  /** Save an in-progress session for crash recovery. */
  async saveRecovery(session: Session): Promise<string> {
    await this.ensureDir(this.storagePath);
    const filePath = path.join(this.storagePath, '_recovery.json');
    await fs.promises.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
    return filePath;
  }

  /** Load a crashed session if one exists. */
  async loadRecovery(): Promise<Session | null> {
    const filePath = path.join(this.storagePath, '_recovery.json');
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  /** Remove the recovery file after a clean session end. */
  async clearRecovery(): Promise<void> {
    const filePath = path.join(this.storagePath, '_recovery.json');
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Already gone — fine
    }
  }

  private buildFileName(session: Session): string {
    // Format: YYYY-MM-DD_HH-MM-SS_{workspace}.json
    const date = new Date(session.startTime);
    const pad = (n: number) => String(n).padStart(2, '0');

    const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const timePart = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    const workspace = this.sanitize(session.workspace);

    return `${datePart}_${timePart}_${workspace}.json`;
  }

  private sanitize(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) || 'untitled';
  }

  private resolveStoragePath(): string {
    const config = vscode.workspace.getConfiguration('codingJournal');
    const configured = config.get<string>('sessionStoragePath', '~/.codingjournals/sessions');
    return this.expandHome(configured);
  }

  private expandHome(p: string): string {
    if (p.startsWith('~/') || p === '~') {
      return path.join(os.homedir(), p.slice(1));
    }
    return p;
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.promises.mkdir(dir, { recursive: true });
  }
}
