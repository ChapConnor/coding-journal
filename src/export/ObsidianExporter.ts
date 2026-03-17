import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Session } from '../types';
import { MarkdownExporter } from './MarkdownExporter';

export class ObsidianExporter {
  private markdownExporter: MarkdownExporter;

  constructor(markdownExporter: MarkdownExporter) {
    this.markdownExporter = markdownExporter;
  }

  async export(session: Session): Promise<string> {
    const config = vscode.workspace.getConfiguration('codingJournal');
    const vaultPath = config.get<string>('obsidianVaultPath', '');

    if (!vaultPath) {
      throw new Error('CodingJournal: obsidianVaultPath is not configured.');
    }

    const mode = config.get<string>('obsidianMode', 'daily-note');

    if (mode === 'daily-note') {
      return this.appendToDailyNote(session, vaultPath);
    } else {
      return this.writeStandalone(session, vaultPath);
    }
  }

  private async writeStandalone(session: Session, vaultPath: string): Promise<string> {
    const dir = path.join(vaultPath, 'coding-sessions');
    await fs.promises.mkdir(dir, { recursive: true });

    const date = new Date(session.startTime);
    const dateStr = this.formatDate(date);
    const workspace = this.sanitize(session.workspace);
    const fileName = `${dateStr}-${workspace}.md`;
    const filePath = path.join(dir, fileName);

    const content = this.markdownExporter.render(session);
    await fs.promises.writeFile(filePath, content, 'utf-8');

    console.log(`CodingJournal: Obsidian standalone export to ${filePath}`);
    return filePath;
  }

  private async appendToDailyNote(session: Session, vaultPath: string): Promise<string> {
    const dailyNotePath = await this.findDailyNote(vaultPath);

    const sessionContent = this.markdownExporter.render(session);
    const section = `\n## Coding Sessions\n\n${sessionContent}`;

    if (await this.fileExists(dailyNotePath)) {
      const existing = await fs.promises.readFile(dailyNotePath, 'utf-8');

      if (existing.includes('## Coding Sessions')) {
        // Append under existing heading
        const updated = existing.replace(
          /## Coding Sessions\n*/,
          `## Coding Sessions\n\n${sessionContent}\n`,
        );
        await fs.promises.writeFile(dailyNotePath, updated, 'utf-8');
      } else {
        // Append new heading at end
        await fs.promises.appendFile(dailyNotePath, section, 'utf-8');
      }
    } else {
      // Create the daily note with just the coding session
      await fs.promises.mkdir(path.dirname(dailyNotePath), { recursive: true });
      const date = new Date(session.startTime);
      const header = `# ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
      await fs.promises.writeFile(dailyNotePath, header + section, 'utf-8');
    }

    console.log(`CodingJournal: Obsidian daily note export to ${dailyNotePath}`);
    return dailyNotePath;
  }

  private async findDailyNote(vaultPath: string): Promise<string> {
    const today = new Date();
    const dateStr = this.formatDate(today);

    // Check common daily note folder conventions
    const candidates = [
      path.join(vaultPath, 'Daily Notes', `${dateStr}.md`),
      path.join(vaultPath, 'daily', `${dateStr}.md`),
      path.join(vaultPath, 'journals', `${dateStr}.md`),
      path.join(vaultPath, `${dateStr}.md`),
    ];

    for (const candidate of candidates) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    // Check if any of the directories exist (even if today's note doesn't yet)
    for (const candidate of candidates) {
      const dir = path.dirname(candidate);
      if (await this.dirExists(dir)) {
        return candidate;
      }
    }

    // Default to "Daily Notes" folder
    return candidates[0];
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').substring(0, 50) || 'untitled';
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
