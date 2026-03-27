import * as vscode from "vscode";

const TERMINAL_NAME = "opencode";

// Track comments that have been sent to opencode to avoid duplicates
const sentComments = new Set<string>();

export function activate(context: vscode.ExtensionContext) {
  // Create comment controller for inline comment input
  const commentController = vscode.comments.createCommentController(
    "opencode-comments",
    "Opencode Comments"
  );
  context.subscriptions.push(commentController);

  // Allow comments on all lines
  commentController.commentingRangeProvider = {
    provideCommentingRanges: (document: vscode.TextDocument) => {
      const lineCount = document.lineCount;
      return [new vscode.Range(0, 0, lineCount - 1, 0)];
    },
  };

  // Create a custom comment class to track state
  class OpencodeComment implements vscode.Comment {
    id: string;
    body: string | vscode.MarkdownString;
    mode: vscode.CommentMode;
    author: vscode.CommentAuthorInformation;
    constructor(
      body: string,
      public parent: vscode.CommentThread,
    ) {
      this.id = Math.random().toString(36).substring(7);
      this.body = body;
      this.mode = vscode.CommentMode.Preview;
      this.author = { name: "You" };
    }
  }

  // Handle reply submission (user clicked "Reply" in comment thread)
  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.addComment", async (reply: vscode.CommentReply) => {
      const thread = reply.thread;
      const text = reply.text.trim();

      if (!text) {
        return;
      }

      // Add the comment to the thread temporarily
      const newComment = new OpencodeComment(text, thread);
      thread.comments = [...thread.comments, newComment];

      // Send to opencode
      await sendCommentToOpencode(thread, text);

      // Dispose the thread (we don't persist in editor)
      thread.dispose();
    })
  );

  async function sendCommentToOpencode(thread: vscode.CommentThread, text: string) {
    // Get file reference for this thread's range
    const document = thread.uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("File must be in workspace");
      return;
    }

    const relativePath = vscode.workspace.asRelativePath(document);
    const range = thread.range;
    if (!range) {
      vscode.window.showErrorMessage("Could not get selection range");
      return;
    }

    const startLine = range.start.line + 1;
    const endLine = range.end.line + 1;
    const fileRef =
      startLine === endLine
        ? `@${relativePath}#L${startLine}`
        : `@${relativePath}#L${startLine}-${endLine}`;

    // Find opencode terminal
    const terminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    if (!terminal) {
      vscode.window.showErrorMessage("No opencode terminal found. Open opencode first.");
      return;
    }

    // @ts-ignore
    const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"];
    if (!port) {
      vscode.window.showErrorMessage("Could not find opencode port.");
      return;
    }

    // Format and send to opencode
    const formattedComment = `${fileRef}\n\n${text}\n\n`;
    await appendPrompt(parseInt(port), formattedComment);
    terminal.show();

    vscode.window.showInformationMessage(`Comment added for ${fileRef}`);
  }

  let openNewTerminalDisposable = vscode.commands.registerCommand("opencode.openNewTerminal", async () => {
    await openTerminal();
  });

  let continueInNewTabDisposable = vscode.commands.registerCommand("opencode.continueInNewTab", async () => {
    await openTerminal(true);
  });

  let openTerminalDisposable = vscode.commands.registerCommand("opencode.openTerminal", async () => {
    // An opencode terminal already exists => focus it
    const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    if (existingTerminal) {
      existingTerminal.show();
      return;
    }

    await openTerminal();
  });

  let addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile();
    if (!fileRef) {
      return;
    }

    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
      return;
    }

    if (terminal.name === TERMINAL_NAME) {
      // @ts-ignore
      const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"];
      port ? await appendPrompt(parseInt(port), fileRef) : terminal.sendText(fileRef, false);
      terminal.show();
    }
  });

  context.subscriptions.push(
    openTerminalDisposable,
    openNewTerminalDisposable,
    addFilepathDisposable,
    continueInNewTabDisposable
  );

  async function openTerminal(continueSession = false) {
    // Create a new terminal in split screen
    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
    const terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
      },
      location: {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      },
      env: {
        _EXTENSION_OPENCODE_PORT: port.toString(),
        OPENCODE_CALLER: "vscode",
      },
    });

    terminal.show();
    const continueFlag = continueSession ? " --continue" : "";
    terminal.sendText(`opencode --port ${port}${continueFlag}`);

    const fileRef = getActiveFile();
    if (!fileRef) {
      return;
    }

    // Wait for the terminal to be ready
    let tries = 10;
    let connected = false;
    do {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        await fetch(`http://localhost:${port}/app`);
        connected = true;
        break;
      } catch (e) {}

      tries--;
    } while (tries > 0);

    // If connected, append the prompt to the terminal
    if (connected) {
      await appendPrompt(port, `In ${fileRef}`);
      terminal.show();
    }
  }

  async function appendPrompt(port: number, text: string) {
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }

    const document = activeEditor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return;
    }

    // Get the relative path from workspace root
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    let filepathWithAt = `@${relativePath}`;

    // Check if there's a selection and add line numbers
    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
      // Convert to 1-based line numbers
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;

      if (startLine === endLine) {
        // Single line selection
        filepathWithAt += `#L${startLine}`;
      } else {
        // Multi-line selection
        filepathWithAt += `#L${startLine}-${endLine}`;
      }
    }

    return filepathWithAt;
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
