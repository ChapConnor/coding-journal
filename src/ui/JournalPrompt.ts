import * as vscode from 'vscode';
import { PromptContext } from '../types';

export interface PromptResult {
  text: string | undefined;
  context: PromptContext;
  dismissed: boolean;
}

export class JournalPrompt implements vscode.Disposable {
  private activePromptCancel: vscode.CancellationTokenSource | null = null;

  async show(ctx: PromptContext): Promise<PromptResult> {
    // Cancel any existing prompt before showing a new one
    this.cancelActive();

    const cancelSource = new vscode.CancellationTokenSource();
    this.activePromptCancel = cancelSource;

    try {
      const text = await vscode.window.showInputBox(
        {
          placeHolder: ctx.placeholder,
          prompt: 'CodingJournal \u2014 press Enter to save, Escape to skip',
          ignoreFocusOut: true,
        },
        cancelSource.token,
      );

      // If the user entered text and it's long, offer a multiline follow-up
      if (text && text.length > 80) {
        const more = await vscode.window.showInputBox(
          {
            placeHolder: 'Continue your thought... (or press Enter to finish)',
            prompt: 'CodingJournal \u2014 add more detail (optional)',
            ignoreFocusOut: true,
          },
          cancelSource.token,
        );

        const fullText = more ? text + '\n' + more : text;
        return {
          text: fullText,
          context: ctx,
          dismissed: false,
        };
      }

      return {
        text: text ?? undefined,
        context: ctx,
        dismissed: text === undefined,
      };
    } finally {
      if (this.activePromptCancel === cancelSource) {
        this.activePromptCancel = null;
      }
    }
  }

  private cancelActive(): void {
    if (this.activePromptCancel) {
      this.activePromptCancel.cancel();
      this.activePromptCancel.dispose();
      this.activePromptCancel = null;
    }
  }

  dispose(): void {
    this.cancelActive();
  }
}
