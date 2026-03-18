import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TwitterService } from '../src/share/TwitterService';
import { Session } from '../src/types';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '1234',
    startTime: '2025-03-01T10:00:00.000Z',
    endTime: '2025-03-01T12:30:00.000Z',
    workspace: 'my-project',
    branch: 'main',
    gitRemote: null,
    events: [],
    ...overrides,
  };
}

describe('TwitterService', () => {
  let service: TwitterService;

  beforeEach(() => {
    vi.restoreAllMocks();
    const mockSecrets = {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    };
    service = new TwitterService(mockSecrets as any);
  });

  describe('composeTweet (default template)', () => {
    it('composes a default tweet with basic session info', () => {
      const session = makeSession();
      const tweet = service.composeTweet(session);

      expect(tweet).toContain('my-project');
      expect(tweet).toContain('2h 30m');
      expect(tweet).toContain('#CodingJournal');
    });

    it('includes commit stats', () => {
      const session = makeSession({
        events: [
          { id: '1', timestamp: '2025-03-01T10:30:00.000Z', type: 'git_commit', auto: true, data: { linesAdded: 50, linesRemoved: 10, commitMessage: 'fix bug' } },
          { id: '2', timestamp: '2025-03-01T11:00:00.000Z', type: 'git_commit', auto: true, data: { linesAdded: 20, linesRemoved: 5, commitMessage: 'add test' } },
        ],
      });
      const tweet = service.composeTweet(session);

      expect(tweet).toContain('2 commits');
      expect(tweet).toContain('+70/-15');
    });

    it('includes note count', () => {
      const session = makeSession({
        events: [
          { id: '1', timestamp: '2025-03-01T10:30:00.000Z', type: 'note', auto: false, data: { noteText: 'thinking about API design' } },
        ],
      });
      const tweet = service.composeTweet(session);

      expect(tweet).toContain('1 note captured');
    });

    it('includes session-end headline note', () => {
      const session = makeSession({
        events: [
          { id: '1', timestamp: '2025-03-01T12:30:00.000Z', type: 'note', auto: false, data: { noteText: 'Great session, got tests working', triggeredBy: 'session_end' } },
        ],
      });
      const tweet = service.composeTweet(session);

      expect(tweet).toContain('Great session, got tests working');
    });

    it('truncates to 280 characters', () => {
      const session = makeSession({
        workspace: 'my-extremely-long-project-name-that-goes-on-forever',
        events: Array.from({ length: 50 }, (_, i) => ({
          id: String(i),
          timestamp: '2025-03-01T10:30:00.000Z',
          type: 'note' as const,
          auto: false,
          data: { noteText: 'a note' },
        })),
      });
      const tweet = service.composeTweet(session);

      expect(tweet.length).toBeLessThanOrEqual(280);
    });

    it('handles session with no commits or notes', () => {
      const session = makeSession();
      const tweet = service.composeTweet(session);

      expect(tweet).toContain('my-project');
      expect(tweet).toContain('2h 30m');
      // Should not mention commit/note stats when there are none
      expect(tweet).not.toMatch(/\d+ commit/);
      expect(tweet).not.toMatch(/\d+ note/);
    });
  });

  describe('composeTweet (custom template)', () => {
    it('uses custom template when provided', async () => {
      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue: unknown) => {
          if (key === 'twitterTemplate') return 'Coded on {workspace} for {duration} - {commits} commits!';
          return defaultValue;
        }),
      } as any);

      const session = makeSession({
        events: [
          { id: '1', timestamp: '2025-03-01T10:30:00.000Z', type: 'git_commit', auto: true, data: { linesAdded: 10, linesRemoved: 2 } },
        ],
      });
      const tweet = service.composeTweet(session);

      expect(tweet).toBe('Coded on my-project for 2h 30m - 1 commits!');
    });
  });
});
