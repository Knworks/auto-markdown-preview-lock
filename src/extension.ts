// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const MARKDOWN_LANGUAGE_ID = 'markdown';

const previewToSide = async (uri: vscode.Uri): Promise<void> => {
	try {
		await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
		// Return focus to the active editor group to avoid stealing focus to the preview.
		await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
	} catch (error) {
		console.error('[auto-markdown-preview-lock] failed to open preview:', error);
	}
};

const isMarkdownEditor = (editor: vscode.TextEditor | undefined): editor is vscode.TextEditor => {
	return !!editor && editor.document.languageId === MARKDOWN_LANGUAGE_ID;
};

const handleActiveEditorChange = async (editor: vscode.TextEditor | undefined): Promise<void> => {
	if (!isMarkdownEditor(editor)) {
		return;
	}

	await previewToSide(editor.document.uri);
};

export function activate(context: vscode.ExtensionContext) {
	console.log('Auto Markdown Preview Lock extension activated');

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			void handleActiveEditorChange(editor);
		}),
	);

	// Handle already active editor when the extension activates.
	void handleActiveEditorChange(vscode.window.activeTextEditor);
}

export function deactivate() {}
