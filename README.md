# opencode+ VS Code Extension

A Visual Studio Code extension that integrates [opencode](https://opencode.ai) directly into your development workflow. This is an enhanced fork of the official opencode extension with code review features.

## Prerequisites

This extension requires the [opencode CLI](https://opencode.ai) to be installed on your system. Visit [opencode.ai](https://opencode.ai) for installation instructions.

## Features

- **Quick Launch**: Use `Cmd+Esc` (Mac) or `Ctrl+Esc` (Windows/Linux) to open opencode in a split terminal view, or focus an existing terminal session if one is already running.
- **New Session**: Use `Cmd+Shift+Esc` (Mac) or `Ctrl+Shift+Esc` (Windows/Linux) to start a new opencode terminal session, even if one is already open. You can also click the opencode button in the UI.
  > **Note:** When opening a new Opencode tab, use the one with the "Opencode Plus:" prefix.
- **Continue Last Session**: Use `Cmd+Shift+C` (Mac) or `Ctrl+Shift+C` (Windows/Linux) to continue your last opencode session in a new tab.
- **Context Awareness**: Automatically share your current selection or tab with opencode.
- **File Reference Shortcuts**: Use `Cmd+Option+K` (Mac) or `Alt+Ctrl+K` (Linux/Windows) to insert file references. For example, `@File#L37-42`.
- **Send Comments by Line**: Select lines in your code and use `Cmd+Shift+A` (Mac) or `Ctrl+Shift+A` (Windows/Linux) to add comments that get sent directly to the active opencode session with the file reference included.

## Support

This is an early release. If you encounter issues or have feedback, please create an issue at https://github.com/afifsohaili/opencode-plus/issues.

## Development

1. `code .` - Open the project directory in VS Code.
2. `bun install` - Install dependencies.
3. Press `F5` to start debugging - This launches a new VS Code window with the extension loaded.

#### Making Changes

`tsc` and `esbuild` watchers run automatically during debugging (visible in the Terminal tab). Changes to the extension are automatically rebuilt in the background.

To test your changes:

1. In the debug VS Code window, press `Cmd+Shift+P`
2. Search for `Developer: Reload Window`
3. Reload to see your changes without restarting the debug session
