# Auto Markdown Preview Lock

A Visual Studio Code extension that automatically opens the Markdown preview when you open a Markdown file. Optional settings let you lock the right editor group to keep the preview pinned and automate preview open/close behavior.

## Feature

- Automatically opens the Markdown preview when a Markdown file becomes active.
- Keeps the code editor in the primary group while locking the preview to the side when enabled.
- Closes the preview when a non-Markdown editor becomes active (configurable).
- Lets you choose which command is used to open the Markdown preview.
- Workspace-scoped settings so each project can tune the behavior.

## Settings

| Key | Default | Description |
| --- | --- | --- |
| `autoMdPreview.enableAutoPreview` | `true` | Automatically open Markdown preview when a Markdown file becomes active. |
| `autoMdPreview.alwaysOpenInPrimaryEditor` | `true` | Keep the active text editor in the primary (first) group when opening previews. |
| `autoMdPreview.closePreviewOnNonMarkdown` | `true` | Close Markdown preview when a non-Markdown editor becomes active. |
| `autoMdPreview.openPreviewCommand` | `"markdown.showPreviewToSide"` | VS Code command ID used to open the Markdown preview for the active document. |

## Configuration

You can customize the behavior using workspace settings such as `.vscode/settings.json`:

```json
{
  "autoMdPreview.enableAutoPreview": true,
  "autoMdPreview.alwaysOpenInPrimaryEditor": true,
  "autoMdPreview.closePreviewOnNonMarkdown": true,
  "autoMdPreview.openPreviewCommand": "markdown.showPreviewToSide"
}
````

## Switching Preview Behavior

By default, the extension uses the built-in VS Code Markdown preview (`markdown.showPreviewToSide`).
If you do not change any settings, it will behave the same as before.

You can switch the preview behavior by changing the command specified in `autoMdPreview.openPreviewCommand`.

For example:

* Use the built-in Markdown preview:

```json
"autoMdPreview.openPreviewCommand": "markdown.showPreviewToSide"
```

* Use another extension (e.g. Markdown Preview Enhanced):

```json
"autoMdPreview.openPreviewCommand": "markdown-preview-enhanced.openPreview"
```

> Note: The available command IDs depend on the extensions installed in your environment.

## Privacy / Telemetry

This extension does not send any usage data (telemetry).

## License

MIT
