import { describe, it, expect } from 'vitest';

// Test the pure parsing logic from GitWatcher by extracting it
// We can't easily test the full class (requires git + vscode), but we can
// test the critical parsing functions that are most likely to break.

describe('GitWatcher parsing', () => {
  // Replicate parseShortstat logic for isolated testing
  function parseShortstat(stat: string) {
    const filesMatch = stat.match(/(\d+) file/);
    const addMatch = stat.match(/(\d+) insertion/);
    const delMatch = stat.match(/(\d+) deletion/);
    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      linesAdded: addMatch ? parseInt(addMatch[1], 10) : 0,
      linesRemoved: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  }

  // Replicate commit log parsing
  function parseCommitLog(logResult: string) {
    const [commitHash, message, timestamp] = logResult.trim().split('|');
    return { commitHash, message, timestamp };
  }

  describe('parseShortstat', () => {
    it('parses typical diff output', () => {
      const result = parseShortstat(' 3 files changed, 42 insertions(+), 10 deletions(-)');
      expect(result).toEqual({ filesChanged: 3, linesAdded: 42, linesRemoved: 10 });
    });

    it('handles insertions only', () => {
      const result = parseShortstat(' 1 file changed, 5 insertions(+)');
      expect(result).toEqual({ filesChanged: 1, linesAdded: 5, linesRemoved: 0 });
    });

    it('handles deletions only', () => {
      const result = parseShortstat(' 2 files changed, 8 deletions(-)');
      expect(result).toEqual({ filesChanged: 2, linesAdded: 0, linesRemoved: 8 });
    });

    it('handles empty string', () => {
      const result = parseShortstat('');
      expect(result).toEqual({ filesChanged: 0, linesAdded: 0, linesRemoved: 0 });
    });

    it('handles large numbers', () => {
      const result = parseShortstat(' 150 files changed, 12345 insertions(+), 6789 deletions(-)');
      expect(result).toEqual({ filesChanged: 150, linesAdded: 12345, linesRemoved: 6789 });
    });

    it('handles singular file', () => {
      const result = parseShortstat(' 1 file changed, 1 insertion(+), 1 deletion(-)');
      expect(result).toEqual({ filesChanged: 1, linesAdded: 1, linesRemoved: 1 });
    });
  });

  describe('parseCommitLog', () => {
    it('parses normal commit log', () => {
      const result = parseCommitLog('abc123|Add new feature|2025-03-01T10:00:00+00:00\n');
      expect(result).toEqual({
        commitHash: 'abc123',
        message: 'Add new feature',
        timestamp: '2025-03-01T10:00:00+00:00',
      });
    });

    it('BUG: pipe in commit message corrupts parsing', () => {
      // This documents the known bug — commit messages with | break parsing
      const result = parseCommitLog('abc123|fix: handle x | y case|2025-03-01T10:00:00+00:00\n');
      // The message gets truncated at the first pipe
      expect(result.message).toBe('fix: handle x ');
      // And the timestamp is wrong
      expect(result.timestamp).not.toBe('2025-03-01T10:00:00+00:00');
    });

    it('handles empty commit message', () => {
      const result = parseCommitLog('abc123||2025-03-01T10:00:00+00:00\n');
      expect(result.commitHash).toBe('abc123');
      expect(result.message).toBe('');
    });
  });
});
