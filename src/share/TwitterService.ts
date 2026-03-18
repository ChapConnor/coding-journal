import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as https from 'https';
import { Session } from '../types';

const TWITTER_API_URL = 'https://api.twitter.com/2/tweets';

interface TwitterCredentials {
  apiKey: string;
  apiKeySecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export class TwitterService implements vscode.Disposable {
  private secrets: vscode.SecretStorage;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  /** Store Twitter credentials securely in VS Code's secret storage. */
  async setCredentials(creds: TwitterCredentials): Promise<void> {
    await this.secrets.store('codingJournal.twitter', JSON.stringify(creds));
  }

  /** Clear stored credentials. */
  async clearCredentials(): Promise<void> {
    await this.secrets.delete('codingJournal.twitter');
  }

  /** Check if credentials are configured. */
  async hasCredentials(): Promise<boolean> {
    const raw = await this.secrets.get('codingJournal.twitter');
    return raw !== undefined;
  }

  /** Post a session summary tweet. Returns true on success. */
  async shareSession(session: Session): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('codingJournal');
    if (!config.get<boolean>('twitterAutoShare', false)) {
      return false;
    }

    const creds = await this.getCredentials();
    if (!creds) {
      console.log('CodingJournal: Twitter auto-share enabled but no credentials configured');
      return false;
    }

    const text = this.composeTweet(session);

    try {
      await this.postTweet(text, creds);
      vscode.window.showInformationMessage('CodingJournal: Session shared on X!');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`CodingJournal: Failed to share on X \u2014 ${msg}`);
      return false;
    }
  }

  /** Compose tweet text from a session. */
  composeTweet(session: Session): string {
    const config = vscode.workspace.getConfiguration('codingJournal');
    const template = config.get<string>('twitterTemplate', '');

    if (template) {
      return this.applyTemplate(template, session);
    }

    return this.defaultTweet(session);
  }

  private defaultTweet(session: Session): string {
    const elapsed = this.formatDuration(session);
    const commits = session.events.filter(e => e.type === 'git_commit').length;
    const notes = session.events.filter(e => e.type === 'note').length;

    let linesAdded = 0;
    let linesRemoved = 0;
    for (const e of session.events) {
      if (e.type === 'git_commit') {
        linesAdded += e.data.linesAdded ?? 0;
        linesRemoved += e.data.linesRemoved ?? 0;
      }
    }

    const parts: string[] = [];
    parts.push(`Just wrapped a ${elapsed} coding session on ${session.workspace}`);

    if (commits > 0) {
      parts.push(`${commits} commit${commits !== 1 ? 's' : ''} (+${linesAdded}/-${linesRemoved})`);
    }
    if (notes > 0) {
      parts.push(`${notes} note${notes !== 1 ? 's' : ''} captured`);
    }

    // Include the session-end note if there is one (the "headline")
    const endNote = [...session.events].reverse().find(
      e => e.type === 'note' && e.data.triggeredBy === 'session_end'
    );
    if (endNote?.data.noteText) {
      const noteText = endNote.data.noteText.length > 100
        ? endNote.data.noteText.substring(0, 97) + '...'
        : endNote.data.noteText;
      parts.push(`\n\n"${noteText}"`);
    }

    parts.push('\n\nLogged with #CodingJournal');

    const tweet = parts.join(' \u00B7 ');
    // Twitter limit is 280 chars
    return tweet.length > 280 ? tweet.substring(0, 277) + '...' : tweet;
  }

  private applyTemplate(template: string, session: Session): string {
    const elapsed = this.formatDuration(session);
    const commits = session.events.filter(e => e.type === 'git_commit').length;
    const notes = session.events.filter(e => e.type === 'note').length;

    let linesAdded = 0;
    let linesRemoved = 0;
    for (const e of session.events) {
      if (e.type === 'git_commit') {
        linesAdded += e.data.linesAdded ?? 0;
        linesRemoved += e.data.linesRemoved ?? 0;
      }
    }

    const tweet = template
      .replace(/\{workspace\}/g, session.workspace)
      .replace(/\{branch\}/g, session.branch ?? '')
      .replace(/\{duration\}/g, elapsed)
      .replace(/\{commits\}/g, String(commits))
      .replace(/\{notes\}/g, String(notes))
      .replace(/\{linesAdded\}/g, String(linesAdded))
      .replace(/\{linesRemoved\}/g, String(linesRemoved));

    return tweet.length > 280 ? tweet.substring(0, 277) + '...' : tweet;
  }

  private async getCredentials(): Promise<TwitterCredentials | null> {
    const raw = await this.secrets.get('codingJournal.twitter');
    if (!raw) { return null; }
    try {
      return JSON.parse(raw) as TwitterCredentials;
    } catch {
      return null;
    }
  }

  private postTweet(text: string, creds: TwitterCredentials): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ text });
      const oauthParams = this.buildOAuthParams(creds, body);

      const req = https.request(
        TWITTER_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': oauthParams,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 201) {
              resolve();
            } else {
              reject(new Error(`Twitter API ${res.statusCode}: ${data}`));
            }
          });
        },
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /** Build OAuth 1.0a Authorization header for Twitter API v2. */
  private buildOAuthParams(creds: TwitterCredentials, _body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const params: Record<string, string> = {
      oauth_consumer_key: creds.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: creds.accessToken,
      oauth_version: '1.0',
    };

    // Build signature base string
    const paramString = Object.keys(params)
      .sort()
      .map(k => `${this.percentEncode(k)}=${this.percentEncode(params[k])}`)
      .join('&');

    const baseString = [
      'POST',
      this.percentEncode(TWITTER_API_URL),
      this.percentEncode(paramString),
    ].join('&');

    // Sign with consumer secret + token secret
    const signingKey = `${this.percentEncode(creds.apiKeySecret)}&${this.percentEncode(creds.accessTokenSecret)}`;
    const signature = crypto
      .createHmac('sha1', signingKey)
      .update(baseString)
      .digest('base64');

    params['oauth_signature'] = signature;

    // Build Authorization header
    const header = Object.keys(params)
      .sort()
      .map(k => `${this.percentEncode(k)}="${this.percentEncode(params[k])}"`)
      .join(', ');

    return `OAuth ${header}`;
  }

  private percentEncode(str: string): string {
    return encodeURIComponent(str).replace(/[!'()*]/g, c =>
      '%' + c.charCodeAt(0).toString(16).toUpperCase()
    );
  }

  private formatDuration(session: Session): string {
    const start = new Date(session.startTime).getTime();
    const end = session.endTime ? new Date(session.endTime).getTime() : Date.now();
    const totalMin = Math.floor((end - start) / 60000);
    if (totalMin < 60) { return `${totalMin}m`; }
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  dispose(): void {
    // nothing to clean up
  }
}
