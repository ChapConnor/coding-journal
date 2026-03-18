import { describe, it, expect } from 'vitest';

// Test the pure parsing logic from GitWatcher by extracting it
// We can't easily test the full class (requires git + vscode), but we can
// test the critical parsing functions that are most likely to break.

const SEP = '\x1e'; // ASCII record separator — matches GitWatcher implementation

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

  // Replicate commit log parsing (updated to use record separator)
  function parseCommitLog(logResult: string) {
    const parts = logResult.trim().split(SEP);
    const commitHash = parts[0];
    const timestamp = parts[parts.length - 1];
    const message = parts.slice(1, -1).join(SEP);
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
      const result = parseCommitLog(`abc123${SEP}Add new feature${SEP}2025-03-01T10:00:00+00:00\n`);
      expect(result).toEqual({
        commitHash: 'abc123',
        message: 'Add new feature',
        timestamp: '2025-03-01T10:00:00+00:00',
      });
    });

    it('handles pipe characters in commit message', () => {
      // This was previously a bug — now fixed with record separator
      const result = parseCommitLog(`abc123${SEP}fix: handle x | y case${SEP}2025-03-01T10:00:00+00:00\n`);
      expect(result.commitHash).toBe('abc123');
      expect(result.message).toBe('fix: handle x | y case');
      expect(result.timestamp).toBe('2025-03-01T10:00:00+00:00');
    });

    it('handles empty commit message', () => {
      const result = parseCommitLog(`abc123${SEP}${SEP}2025-03-01T10:00:00+00:00\n`);
      expect(result.commitHash).toBe('abc123');
      expect(result.message).toBe('');
    });

    it('handles commit message with special characters', () => {
      const result = parseCommitLog(`abc123${SEP}feat: add "quotes" & <angles>${SEP}2025-03-01T10:00:00+00:00\n`);
      expect(result.message).toBe('feat: add "quotes" & <angles>');
    });
  });
});
