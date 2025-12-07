# Auto Markdown Preview Lock

A Visual Studio Code extension that automatically opens the Markdown preview when you open a Markdown file. Optional settings let you lock the right editor group to keep the preview pinned and automate preview open/close behavior.

## Feature

- Automatically opens the Markdown preview when a Markdown file becomes active.
- Keeps the code editor in the primary group while locking the preview to the side when enabled.
- Closes the preview when a non-Markdown editor becomes active (configurable).
- Workspace-scoped settings so each project can tune the behavior.

## Settings

| Key | Default | Description |
| --- | --- | --- |
| `autoMdPreview.enableAutoPreview` | `true` | Automatically open Markdown preview when a Markdown file becomes active. |
| `autoMdPreview.alwaysOpenInPrimaryEditor` | `true` | Keep the active text editor in the primary (first) group when opening previews. |
| `autoMdPreview.closePreviewOnNonMarkdown` | `true` | Close Markdown preview when a non-Markdown editor becomes active. |

## Privacy / Telemetry

This extension does not send any usage data (telemetry).

## License

MIT
