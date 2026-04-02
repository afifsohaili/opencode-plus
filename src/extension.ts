import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const TERMINAL_NAME = "opencode";

// Track comments that have been sent to opencode to avoid duplicates
const sentComments = new Set<string>();

// Track last sent message per port for picker display
const portLastSent = new Map<number, { message: string; timestamp: number }>();

// Logger setup
let outputChannel: vscode.OutputChannel;
let logFilePath: string | undefined;

function initializeLogger(context: vscode.ExtensionContext) {
  // Output channel for VSCode panel
  outputChannel = vscode.window.createOutputChannel("Opencode Plus");
  context.subscriptions.push(outputChannel);
  
  // Optional: Write to file for persistent logs
  logFilePath = path.join(context.logPath, "opencode-plus.log");
  
  // Ensure log directory exists
  if (!fs.existsSync(context.logPath)) {
    fs.mkdirSync(context.logPath, { recursive: true });
  }
  
  log("Logger initialized", { logFilePath });
}

export function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  // Write to OutputChannel
  outputChannel?.appendLine(logMessage);
  if (data) {
    outputChannel?.appendLine(JSON.stringify(data, null, 2));
  }
  
  // Write to file
  if (logFilePath) {
    fs.appendFileSync(logFilePath, logMessage + "\n");
    if (data) {
      fs.appendFileSync(logFilePath, JSON.stringify(data, null, 2) + "\n");
    }
  }
  
  // Also console for debugging in dev host
  console.log(logMessage, data);
}

export function activate(context: vscode.ExtensionContext) {
  initializeLogger(context);
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
    vscode.commands.registerCommand("opencode-plus.addComment", async (reply: vscode.CommentReply) => {
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

  async function getOpencodeSessionInfo(port: number): Promise<{ title?: string; lastMessage?: string; sessionId?: string }> {
    try {
      log(`Fetching session info from port ${port}`);
      
      // Fetch sessions list
      const sessionsRes = await fetch(`http://127.0.0.1:${port}/session`);
      log(`Port ${port} sessions response status:`, sessionsRes.status);
      
      if (!sessionsRes.ok) {
        return {};
      }
      const sessions = await sessionsRes.json() as Array<{ id: string; title?: string }>;
      log(`Port ${port} sessions:`, sessions);
      
      if (!sessions || sessions.length === 0) {
        return {};
      }
      
      // Get the most recent session
      const currentSession = sessions[0];
      const title = currentSession.title;
      log(`Port ${port} using session:`, { id: currentSession.id, title });
      
      // Fetch last message
      const messagesRes = await fetch(`http://127.0.0.1:${port}/session/${currentSession.id}/message?limit=1`);
      if (!messagesRes.ok) {
        return { title, sessionId: currentSession.id };
      }
      
      const messages = await messagesRes.json() as Array<{ info?: { role?: string }; parts?: Array<{ text?: string }> }>;
      log(`Port ${port} messages:`, messages);
      
      if (!messages || messages.length === 0) {
        return { title, sessionId: currentSession.id };
      }
      
      const lastMsg = messages[0];
      const lastText = lastMsg.parts?.[0]?.text?.substring(0, 50) || '';
      
      return { title, lastMessage: lastText, sessionId: currentSession.id };
    } catch (error) {
      log(`Error fetching session info from port ${port}:`, error);
      return {};
    }
  }

  async function selectOpencodeTerminal(): Promise<vscode.Terminal | null> {
    const terminals = vscode.window.terminals.filter((t) => t.name === TERMINAL_NAME);

    if (terminals.length === 0) {
      vscode.window.showErrorMessage("No opencode terminal found. Open opencode first.");
      return null;
    }

    if (terminals.length === 1) {
      return terminals[0];
    }

    // Multiple terminals - show picker with context
    const items = [];
    
    for (let index = 0; index < terminals.length; index++) {
      const t = terminals[index];
      // @ts-ignore
      const port = t.creationOptions?.env?.["_EXTENSION_OPENCODE_PORT"];
      let description: string | undefined;
      
      if (port) {
        const portNum = parseInt(port);
        
        // Check if we've sent something to this port locally
        const lastSent = portLastSent.get(portNum);
        if (lastSent) {
          const preview = lastSent.message.length > 50 
            ? lastSent.message.substring(0, 50) + "..."
            : lastSent.message;
          description = `Last sent: "${preview}"`;
        }
        
        // If no description yet, show port
        if (!description) {
          description = `Port ${port}`;
        }
      }
      
      items.push({
        label: `opencode #${index + 1}`,
        description,
        terminal: t,
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select which opencode instance to send to",
    });

    return selected?.terminal ?? null;
  }

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

    // Select opencode terminal
    const terminal = await selectOpencodeTerminal();
    if (!terminal) {
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
    
    // Track what we sent for picker display
    portLastSent.set(parseInt(port), { message: text, timestamp: Date.now() });
    
    terminal.show();

    vscode.window.showInformationMessage(`Comment added for ${fileRef}`);
  }

  let openNewTerminalDisposable = vscode.commands.registerCommand("opencode-plus.openNewTerminal", async () => {
    await openTerminal();
  });

  let openTerminalDisposable = vscode.commands.registerCommand("opencode-plus.openTerminal", async () => {
    // An opencode terminal already exists => focus it
    const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    if (existingTerminal) {
      existingTerminal.show();
      return;
    }

    await openTerminal();
  });

  let addFilepathDisposable = vscode.commands.registerCommand("opencode-plus.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile();
    if (!fileRef) {
      return;
    }

    // Select opencode terminal
    const terminal = await selectOpencodeTerminal();
    if (!terminal) {
      return;
    }

    // @ts-ignore
    const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"];
    if (port) {
      await appendPrompt(parseInt(port), fileRef);
      // Track what we sent for picker display
      portLastSent.set(parseInt(port), { message: fileRef, timestamp: Date.now() });
    } else {
      terminal.sendText(fileRef, false);
    }
    terminal.show();
  });

  // Command to show output channel logs
  const showLogsDisposable = vscode.commands.registerCommand("opencode-plus.showLogs", () => {
    outputChannel.show();
    vscode.window.showInformationMessage(`Logs also saved to: ${logFilePath}`);
  });

  context.subscriptions.push(
    openTerminalDisposable,
    openNewTerminalDisposable,
    addFilepathDisposable,
    showLogsDisposable
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
