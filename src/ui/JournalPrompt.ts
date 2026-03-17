import * as vscode from 'vscode';
import { PromptContext } from '../types';

export interface PromptResult {
  text: string | undefined;
  context: PromptContext;
  dismissed: boolean;
}

export class JournalPrompt implements vscode.Disposable {
  private activePromptCancel: vscode.CancellationTokenSource | null = null;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  async show(ctx: PromptContext): Promise<PromptResult> {
    // Cancel any existing prompt before showing a new one
    this.cancelActive();

    const cancelSource = new vscode.CancellationTokenSource();
    this.activePromptCancel = cancelSource;

    // Auto-dismiss timer
    const dismissSeconds = vscode.workspace
      .getConfiguration('codingJournal')
      .get<number>('promptAutoDismissSeconds', 60);

    let dismissed = false;

    this.autoDismissTimer = setTimeout(() => {
      dismissed = true;
      cancelSource.cancel();
    }, dismissSeconds * 1000);

    try {
      const text = await vscode.window.showInputBox(
        {
          placeHolder: ctx.placeholder,
          ignoreFocusOut: false,
        },
        cancelSource.token,
      );

      return {
        text: text ?? undefined,
        context: ctx,
        dismissed: dismissed && text === undefined,
      };
    } finally {
      this.clearAutoDismiss();
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
    this.clearAutoDismiss();
  }

  private clearAutoDismiss(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }

  dispose(): void {
    this.cancelActive();
  }
}
