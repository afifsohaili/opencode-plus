# Opencode+ Product Vision

## Current State

The existing VSCode extension (`sdks/vscode/`) provides basic opencode integration:

- **Open Terminal** (`Cmd+Esc`) - Opens or focuses opencode terminal
- **Open New Terminal** (`Cmd+Shift+Esc`) - Opens new terminal tab
- **Add Filepath** (`Cmd+Alt+K`) - Inserts `@filepath:line` at cursor

## Vision: Opencode+

Transform the VSCode/Cursor extension into a **code review companion** that bridges the gap between IDE code review and AI-assisted discussions.

### Core Philosophy

Users review code in their IDE (Cursor/VSCode) where they have full context, syntax highlighting, and git blame. But they want to discuss changes with AI in opencode. Opencode+ makes this handoff seamless.

## Target Workflows

### Workflow 1: Quick Line Comment

**Scenario:** Reviewing a PR, spot an issue on line 45

1. Select the code in Cursor
2. Press `Cmd+Shift+C` (or right-click → "Comment in Opencode")
3. Type: "This could use early return"
4. Hit Enter
5. Switch to opencode TUI - the comment with `@file.ts:45` is already there
6. Continue the conversation with AI

**Time saved:** ~10 seconds per comment (no manual typing of file paths)

### Workflow 2: Batch Review Session

**Scenario:** Doing a thorough code review of a large PR

1. Start review mode (`Cmd+Shift+R`)
2. Cursor shows "Review Mode Active" in status bar
3. Go through file by file, adding comments with `Cmd+Shift+C`
4. Comments accumulate in a review panel
5. When done, click "Submit Review" in the panel
6. All comments are batched and sent to opencode as one prompt
7. AI responds to all comments in context

**Benefit:** Structured review workflow without context switching

### Workflow 3: Quick Templates

**Scenario:** Common review patterns

1. Select code
2. Press `Cmd+Shift+Q` for quick comment
3. Pick from templates:
   - "Consider early return"
   - "Add type annotation"
   - "Extract to function"
   - "Add error handling"
   - "Explain this logic"
4. Customizable templates in settings

**Benefit:** Faster reviews with consistent quality

### Workflow 4: AI-Assisted Review

**Scenario:** Need AI context before commenting

1. Select code
2. Right-click → "Ask AI about this"
3. Type question: "@explore what does this function do?"
4. Comment is sent to opencode with the explore agent invoked
5. AI responds with explanation
6. User can add follow-up comment or accept the explanation

**Benefit:** AI context without leaving the IDE

## Feature Specifications

### Phase 1: MVP (Core Comment Flow)

**Commands:**

- `opencode.addCommentWithFilepath` - Add comment with file reference
- Keybinding: `Cmd+Shift+C`
- Context menu: Right-click on selection

**UI:**

- Input box for comment text
- Previews the file reference that will be appended
- Toast notification on success

**Technical:**

- Uses `/tui/append-prompt` endpoint
- Detects if opencode terminal is active
- Falls back to opening terminal if not running

### Phase 2: Review Mode

**Commands:**

- `opencode.startReview` - Begin review session
- `opencode.addToReview` - Add comment to current review
- `opencode.submitReview` - Send all comments to opencode

**UI:**

- Status bar indicator: "Review: 3 comments"
- Tree view panel showing:
  - File name
  - Line range
  - Comment preview
  - Delete/edit buttons
- Submit button in panel

**Technical:**

- In-memory state during session
- Group comments by file for prompt building
- Generate structured prompt with all file references

### Phase 3: Templates & Customization

**Settings:**

```json
{
  "opencode-plus.quickComments": [
    "Consider early return",
    "Add type annotation",
    "Extract to function",
    "Add error handling",
    "Add test coverage",
    "Document this function"
  ],
  "opencode-plus.comment.autosubmit": false,
  "opencode-plus.comment.includeContext": true
}
```

**Commands:**

- `opencode.quickComment` - Pick from template list
- `opencode.addTemplate` - Add new quick comment template

### Phase 4: Advanced Features

**Diff Integration:**

- Show changed files in sidebar
- Decoration on changed lines (gutter icon)
- Click to see diff and add comment

**Git Integration:**

- Only show decoration on changed files
- Filter review to changed files only
- Compare against main branch

**AI Integration:**

- `@explore` support from IDE
- Show AI responses in panel
- Threaded conversations per comment

## User Interface Design

### Context Menu

```
Right-click on selected code:
├── Add Comment to Opencode
├── Quick Comment >
│   ├── Consider early return
│   ├── Add type annotation
│   └── ...
└── Ask AI about this
```

### Status Bar

```
[OpenCode+] [R:3]     <-- "R:3" means 3 comments in review
           ↑
     Click to open review panel
```

### Review Panel

```
┌─────────────────────────────┐
│ Review Session              │
│ [Submit Review] [Discard]   │
├─────────────────────────────┤
│ src/utils/parser.ts         │
│ ├── Line 15: Early return?  │ [×]
│ └── Line 23: Add types      │ [×]
│                             │
│ src/api/handlers.ts         │
│ └── Line 45: Extract fn     │ [×]
└─────────────────────────────┘
```

### Input Box

```
┌──────────────────────────────────────┐
│ Comment for @src/utils.ts:15         │
│                                      │
│ [________________________________]   │
│                                      │
│ [Cancel] [Add Comment]               │
└──────────────────────────────────────┘
```

## Technical Architecture

### Extension Structure

```
src/
├── extension.ts          # Activation, registration
├── commands/
│   ├── terminal.ts       # Existing terminal commands
│   ├── comment.ts        # Comment workflow
│   └── review.ts         # Review mode commands
├── providers/
│   ├── reviewTree.ts     # Tree view for review panel
│   └── decoration.ts     # Gutter decorations
├── utils/
│   ├── api.ts            # HTTP calls to opencode
│   ├── file.ts           # File path utilities
│   └── reviewState.ts    # State management
└── types/
    └── index.ts          # TypeScript interfaces
```

### State Management

```typescript
interface ReviewState {
  active: boolean
  comments: ReviewComment[]
  startTime: number
}

interface ReviewComment {
  id: string
  file: string
  lineStart: number
  lineEnd: number
  comment: string
  timestamp: number
}
```

### API Integration

```typescript
// Communication with opencode server
class OpencodeAPI {
  async appendPrompt(text: string): Promise<void>
  async isServerRunning(): Promise<boolean>
  async getPort(): Promise<number>
}
```

## Keybindings

| Keybinding      | Command           | When          |
| --------------- | ----------------- | ------------- |
| `Cmd+Esc`       | Open opencode     | Always        |
| `Cmd+Shift+Esc` | Open new tab      | Always        |
| `Cmd+Alt+K`     | Add filepath      | Always        |
| `Cmd+Shift+C`   | Add comment       | Has selection |
| `Cmd+Shift+Q`   | Quick comment     | Has selection |
| `Cmd+Shift+R`   | Start/Stop review | Always        |
| `Cmd+Shift+S`   | Submit review     | Review active |

## Distribution

### Packaging

```bash
# Build production VSIX
bun run package

# Output: opencode-plus-1.0.0.vsix
```

### Installation

```bash
# For Cursor
cursor --install-extension opencode-plus-1.0.0.vsix

# For VSCode
code --install-extension opencode-plus-1.0.0.vsix
```

### Marketplace

- **VS Code Marketplace**: For VSCode users
- **Open VSX Registry**: For Cursor/VSCodium users
- **GitHub Releases**: Direct VSIX download

## Success Metrics

- [ ] Time to add comment: <3 seconds
- [ ] Comments per review session tracked
- [ ] User retention after 1 week: >50%
- [ ] Feature requests from users
- [ ] Stars on GitHub

## Roadmap

### v1.0 - MVP

- [ ] Add comment with file path
- [ ] Basic error handling
- [ ] Documentation

### v1.1 - Review Mode

- [ ] Review session state
- [ ] Review panel UI
- [ ] Batch submit

### v1.2 - Templates

- [ ] Quick comment templates
- [ ] Customizable templates
- [ ] Template management UI

### v1.3 - Git Integration

- [ ] Changed file detection
- [ ] Gutter decorations
- [ ] Diff view integration

### v2.0 - AI Features

- [ ] @explore from IDE
- [ ] AI responses in panel
- [ ] Threaded conversations

## Open Questions

1. Should we support multiple opencode servers (multi-project)?
2. How to handle very long comments in the review panel?
3. Should comments persist across VSCode restarts?
4. Integration with GitHub PRs directly?

## Contributing

This is a fork of the official opencode VSCode extension. Changes should be:

1. Focused on code review workflows
2. Non-breaking for existing users
3. Well-documented
4. Tested in both VSCode and Cursor

## License

Same as original opencode extension (Apache 2.0)
