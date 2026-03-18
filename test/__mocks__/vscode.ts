// Minimal vscode mock for unit testing outside VS Code

import { vi } from 'vitest';

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
  })),
  onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
};

export const window = {
  createStatusBarItem: vi.fn(() => ({
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn(),
  onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeActiveTerminal: vi.fn(() => ({ dispose: vi.fn() })),
  onDidOpenTerminal: vi.fn(() => ({ dispose: vi.fn() })),
  setStatusBarMessage: vi.fn(),
  createWebviewPanel: vi.fn(() => ({
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn(),
      asWebviewUri: vi.fn((uri: unknown) => uri),
      cspSource: 'mock-csp',
    },
    reveal: vi.fn(),
    onDidDispose: vi.fn(),
    dispose: vi.fn(),
  })),
};

export const debug = {
  onDidStartDebugSession: vi.fn(() => ({ dispose: vi.fn() })),
  onDidTerminateDebugSession: vi.fn(() => ({ dispose: vi.fn() })),
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export class Uri {
  static file(path: string) {
    return { fsPath: path, scheme: 'file' };
  }
  static joinPath(base: { fsPath: string }, ...segments: string[]) {
    return { fsPath: [base.fsPath, ...segments].join('/') };
  }
}

export const env = {
  openExternal: vi.fn(),
};

export const extensions = {
  getExtension: vi.fn(() => null),
};

export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
  cancel = vi.fn();
  dispose = vi.fn();
}
