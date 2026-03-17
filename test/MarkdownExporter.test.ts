import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MarkdownExporter } from '../src/export/MarkdownExporter';
import { Session, SessionEvent } from '../src/types';

function makeEvent(type: SessionEvent['type'], data: SessionEvent['data'] = {}, timestamp = '2025-03-01T10:30:00.000Z'): SessionEvent {
  return { id: `test-${Date.now()}`, timestamp, type, auto: true, data };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '1234',
    startTime: '2025-03-01T10:00:00.000Z',
    endTime: '2025-03-01T11:00:00.000Z',
    workspace: 'my-project',
    branch: 'main',
    gitRemote: null,
    events: [],
    ...overrides,
  };
}

describe('MarkdownExporter', () => {
  let tmpDir: string;
  let exporter: MarkdownExporter;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cj-export-'));
    exporter = new MarkdownExporter();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('render', () => {
    it('renders session header with date', () => {
      const session = makeSession();
      const md = exporter.render(session);

      expect(md).toContain('# Coding Session');
      expect(md).toContain('my-project');
      expect(md).toContain('main');
    });

    it('renders commit events', () => {
      const session = makeSession({
        events: [
          makeEvent('git_commit', { commitMessage: 'fix bug', linesAdded: 10, linesRemoved: 3 }),
        ],
      });
      const md = exporter.render(session);

      expect(md).toContain('fix bug');
      expect(md).toContain('+10');
    });

    it('renders note events', () => {
      const session = makeSession({
        events: [makeEvent('note', { noteText: 'struggling with the API' })],
      });
      const md = exporter.render(session);

      expect(md).toContain('struggling with the API');
    });

    it('renders idle events', () => {
      const session = makeSession({
        events: [makeEvent('idle_end', { idleDurationMin: 12, idleType: 'long' })],
      });
      const md = exporter.render(session);

      expect(md).toContain('Long idle');
      expect(md).toContain('12m');
    });

    it('renders edit block events', () => {
      const session = makeSession({
        events: [makeEvent('edit_block', { filePath: '/home/user/project/src/index.ts', durationMin: 5, saveCount: 3 })],
      });
      const md = exporter.render(session);

      expect(md).toContain('src/index.ts');
      expect(md).toContain('3 saves');
    });

    it('renders debug events', () => {
      const session = makeSession({
        events: [
          makeEvent('debug_start', { debugType: 'node' }),
          makeEvent('debug_end', { debugType: 'node', debugDurationMin: 2 }),
        ],
      });
      const md = exporter.render(session);

      expect(md).toContain('Debug session started');
      expect(md).toContain('Debug session ended');
    });

    it('skips file_switch and git_stage events', () => {
      const session = makeSession({
        events: [
          makeEvent('file_switch', { filePath: '/some/file.ts' }),
          makeEvent('git_stage', {}),
        ],
      });
      const md = exporter.render(session);

      // These should not appear in the timeline
      const lines = md.split('\n').filter((l) => l.includes('file.ts'));
      expect(lines).toHaveLength(0);
    });

    it('computes stats correctly', () => {
      const session = makeSession({
        events: [
          makeEvent('git_commit', { linesAdded: 50, linesRemoved: 10 }),
          makeEvent('git_commit', { linesAdded: 20, linesRemoved: 5 }),
          makeEvent('note', { noteText: 'test' }),
          makeEvent('idle_end', { idleDurationMin: 8 }),
        ],
      });
      const md = exporter.render(session);

      expect(md).toContain('**Commits**: 2');
      expect(md).toContain('+70');
      expect(md).toContain('**Notes**: 1');
    });

    it('handles session with no branch', () => {
      const session = makeSession({ branch: null });
      const md = exporter.render(session);

      expect(md).not.toContain('Branch');
    });

    it('handles session with no events', () => {
      const session = makeSession({ events: [] });
      const md = exporter.render(session);

      expect(md).toContain('# Coding Session');
      expect(md).toContain('**Commits**: 0');
    });
  });

  describe('export to file', () => {
    it('writes markdown file to specified directory', async () => {
      const session = makeSession();
      const filePath = await exporter.export(session, tmpDir);

      expect(filePath).toContain('.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toContain('# Coding Session');
    });

    it('creates output directory if missing', async () => {
      const nested = path.join(tmpDir, 'deep', 'nested', 'dir');
      const session = makeSession();
      const filePath = await exporter.export(session, nested);

      expect(fs.existsSync(filePath)).toBe(true);
    });
  });
});
