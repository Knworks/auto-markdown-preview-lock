// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const MARKDOWN_LANGUAGE_ID = 'markdown';
let currentPreviewUri: vscode.Uri | undefined;
let isAdjustingFocus = false;

const previewToSide = async (editor: vscode.TextEditor): Promise<void> => {
	try {
		await vscode.commands.executeCommand('markdown.showPreviewToSide', editor.document.uri);
		currentPreviewUri = editor.document.uri;
		// Ensure the text editor retains focus after opening preview.
		await vscode.window.showTextDocument(editor.document, {
			viewColumn: editor.viewColumn,
			preserveFocus: false,
			preview: false,
		});
	} catch (error) {
		console.error('[auto-markdown-preview-lock] failed to open preview:', error);
	}
};

const isMarkdownEditor = (editor: vscode.TextEditor | undefined): editor is vscode.TextEditor => {
	return !!editor && editor.document.languageId === MARKDOWN_LANGUAGE_ID;
};

const isMarkdownPreviewTab = (tab: vscode.Tab): boolean => {
	if (!(tab.input instanceof vscode.TabInputWebview)) {
		return false;
	}
	const viewType = tab.input.viewType.toLowerCase();
	return viewType.includes('markdown.preview');
};

const findMarkdownPreviewTab = (): { tab: vscode.Tab; group: vscode.TabGroup } | undefined => {
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			if (isMarkdownPreviewTab(tab)) {
				return { tab, group };
			}
		}
	}
	return undefined;
};

const closeMarkdownPreviewIfExists = async (): Promise<void> => {
	const target = findMarkdownPreviewTab();
	if (!target) {
		currentPreviewUri = undefined;
		return;
	}

	try {
		await vscode.window.tabGroups.close(target.tab, true);
		currentPreviewUri = undefined;
	} catch (error) {
		console.error('[auto-markdown-preview-lock] failed to close markdown preview:', error);
	}
};

const ensureEditorInPrimaryColumn = async (editor: vscode.TextEditor): Promise<vscode.TextEditor> => {
	if (editor.viewColumn === vscode.ViewColumn.One) {
		return editor;
	}
	isAdjustingFocus = true;
	try {
		await vscode.commands.executeCommand('workbench.action.moveEditorToFirstGroup');
		return await vscode.window.showTextDocument(editor.document, {
			viewColumn: vscode.ViewColumn.One,
			preserveFocus: false,
			preview: false,
		});
	} finally {
		isAdjustingFocus = false;
	}
};

const handleActiveEditorChange = async (editor: vscode.TextEditor | undefined): Promise<void> => {
	if (isAdjustingFocus) {
		return;
	}

	// If focus moves to a webview or nowhere, do nothing to avoid closing the preview we just opened.
	if (!editor) {
		return;
	}

	if (!isMarkdownEditor(editor)) {
		await closeMarkdownPreviewIfExists();
		// Move non-Markdown back to primary column to avoid opening on the right preview side.
		await ensureEditorInPrimaryColumn(editor);
		return;
	}

	// Keep Markdown editing on the primary (left) column to prevent cascading groups on the right.
	const primaryEditor = await ensureEditorInPrimaryColumn(editor);

	// Skip reopening if we are already previewing the same document and the tab is present.
	if (currentPreviewUri?.toString() === primaryEditor.document.uri.toString() && findMarkdownPreviewTab()) {
		return;
	}

	// Close stale preview before opening a new one to avoid cascading groups.
	await closeMarkdownPreviewIfExists();
	await previewToSide(primaryEditor);
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
