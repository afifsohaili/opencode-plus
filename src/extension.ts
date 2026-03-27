// This method is called when your extension is deactivated
export function deactivate() {}

import * as vscode from "vscode"

const TERMINAL_NAME = "opencode"

export function activate(context: vscode.ExtensionContext) {
  let openNewTerminalDisposable = vscode.commands.registerCommand("opencode.openNewTerminal", async () => {
    await openTerminal()
  })

  let continueInNewTabDisposable = vscode.commands.registerCommand("opencode.continueInNewTab", async () => {
    await openTerminal(true)
  })

  let openTerminalDisposable = vscode.commands.registerCommand("opencode.openTerminal", async () => {
    // An opencode terminal already exists => focus it
    const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
    if (existingTerminal) {
      existingTerminal.show()
      return
    }

    await openTerminal()
  })

  let addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    const terminal = vscode.window.activeTerminal
    if (!terminal) {
      return
    }

    if (terminal.name === TERMINAL_NAME) {
      // @ts-ignore
      const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"]
      port ? await appendPrompt(parseInt(port), fileRef) : terminal.sendText(fileRef, false)
      terminal.show()
    }
  })

  let addCommentDisposable = vscode.commands.registerCommand("opencode.addComment", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    const comment = await vscode.window.showInputBox({
      prompt: `Comment for ${fileRef}`,
      placeHolder: "Enter your comment...",
      ignoreFocusOut: true,
    })

    if (!comment) {
      return
    }

    // Find an opencode terminal
    const terminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
    if (!terminal) {
      vscode.window.showErrorMessage("No opencode terminal found. Open opencode first.")
      return
    }

    // @ts-ignore
    const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"]
    if (!port) {
      vscode.window.showErrorMessage("Could not find opencode port.")
      return
    }

    // Format: @filepath:line-line\n\ncomment
    const formattedComment = `${fileRef}\n\n${comment}\n\n`

    await appendPrompt(parseInt(port), formattedComment)
    terminal.show()

    vscode.window.showInformationMessage(`Comment added for ${fileRef}`)
  })

  context.subscriptions.push(openTerminalDisposable, openNewTerminalDisposable, addFilepathDisposable, continueInNewTabDisposable, addCommentDisposable)

  async function openTerminal(continueSession = false) {
    // Create a new terminal in split screen
    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
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
    })

    terminal.show()
    const continueFlag = continueSession ? " --continue" : ""
    terminal.sendText(`opencode --port ${port}${continueFlag}`)

    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    // Wait for the terminal to be ready
    let tries = 10
    let connected = false
    do {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        await fetch(`http://localhost:${port}/app`)
        connected = true
        break
      } catch (e) {}

      tries--
    } while (tries > 0)

    // If connected, append the prompt to the terminal
    if (connected) {
      await appendPrompt(port, `In ${fileRef}`)
      terminal.show()
    }
  }

  async function appendPrompt(port: number, text: string) {
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    })
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
      return
    }

    const document = activeEditor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) {
      return
    }

    // Get the relative path from workspace root
    const relativePath = vscode.workspace.asRelativePath(document.uri)
    let filepathWithAt = `@${relativePath}`

    // Check if there's a selection and add line numbers
    const selection = activeEditor.selection
    if (!selection.isEmpty) {
      // Convert to 1-based line numbers
      const startLine = selection.start.line + 1
      const endLine = selection.end.line + 1

      if (startLine === endLine) {
        // Single line selection
        filepathWithAt += `#L${startLine}`
      } else {
        // Multi-line selection
        filepathWithAt += `#L${startLine}-${endLine}`
      }
    }

    return filepathWithAt
  }
}
