import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionStore } from '../src/storage/SessionStore';
import { Session } from '../src/types';

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

describe('SessionStore', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cj-test-'));

    // Mock config to use our temp dir
    const { workspace } = await import('vscode');
    vi.mocked(workspace.getConfiguration).mockReturnValue({
      get: vi.fn((_key: string, defaultValue: unknown) => {
        if (_key === 'sessionStoragePath') return tmpDir;
        return defaultValue;
      }),
    } as any);

    store = new SessionStore();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('save and load', () => {
    it('saves a session and loads it back', async () => {
      const session = makeSession();
      const filePath = await store.save(session);

      expect(filePath).toContain('.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const loaded = await store.load(filePath);
      expect(loaded.id).toBe(session.id);
      expect(loaded.workspace).toBe(session.workspace);
      expect(loaded.events).toEqual(session.events);
    });

    it('generates correct filename format', async () => {
      const session = makeSession({ startTime: '2025-06-15T14:30:45.000Z' });
      const filePath = await store.save(session);
      const fileName = path.basename(filePath);

      // Should contain date and workspace name
      expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_my-project\.json$/);
    });

    it('sanitizes workspace name in filename', async () => {
      const session = makeSession({ workspace: 'my project/with @special chars!' });
      const filePath = await store.save(session);
      const fileName = path.basename(filePath);

      expect(fileName).not.toMatch(/[@!\/\s]/);
    });

    it('handles empty workspace name', async () => {
      const session = makeSession({ workspace: '' });
      const filePath = await store.save(session);
      const fileName = path.basename(filePath);

      expect(fileName).toContain('untitled');
    });
  });

  describe('load errors', () => {
    it('throws on non-existent file', async () => {
      await expect(store.load('/nonexistent/file.json')).rejects.toThrow();
    });

    it('throws on malformed JSON', async () => {
      const badFile = path.join(tmpDir, 'bad.json');
      await fs.promises.writeFile(badFile, '{ not valid json!!!', 'utf-8');

      await expect(store.load(badFile)).rejects.toThrow();
    });
  });

  describe('list', () => {
    it('returns empty array when no sessions exist', async () => {
      const sessions = await store.list();
      expect(sessions).toEqual([]);
    });

    it('lists saved sessions in reverse order', async () => {
      const s1 = makeSession({ startTime: '2025-01-01T10:00:00.000Z' });
      const s2 = makeSession({ startTime: '2025-02-01T10:00:00.000Z' });

      await store.save(s1);
      await store.save(s2);

      const sessions = await store.list();
      expect(sessions).toHaveLength(2);
      // Most recent first
      expect(sessions[0].name).toContain('2025-02');
      expect(sessions[1].name).toContain('2025-01');
    });

    it('ignores non-JSON files', async () => {
      await store.save(makeSession());
      await fs.promises.writeFile(path.join(tmpDir, 'notes.txt'), 'hello', 'utf-8');

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('deletes a saved session', async () => {
      const filePath = await store.save(makeSession());
      expect(fs.existsSync(filePath)).toBe(true);

      await store.delete(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('throws when deleting non-existent file', async () => {
      await expect(store.delete('/nonexistent/file.json')).rejects.toThrow();
    });
  });

  describe('recovery', () => {
    it('saves and loads recovery file', async () => {
      const session = makeSession({ id: 'recovery-test' });
      await store.saveRecovery(session);

      const recovered = await store.loadRecovery();
      expect(recovered).not.toBeNull();
      expect(recovered!.id).toBe('recovery-test');
    });

    it('returns null when no recovery file exists', async () => {
      const recovered = await store.loadRecovery();
      expect(recovered).toBeNull();
    });

    it('clears recovery file', async () => {
      await store.saveRecovery(makeSession());
      await store.clearRecovery();

      const recovered = await store.loadRecovery();
      expect(recovered).toBeNull();
    });

    it('clearRecovery does not throw if no recovery file', async () => {
      await expect(store.clearRecovery()).resolves.not.toThrow();
    });
  });
});
