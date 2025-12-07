// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getAutoMdPreviewConfig } from './config';
import {
	getPreviewState,
	resetPreviewState,
	setCurrentPreviewUri,
	setLastActiveKind,
	setPreviewLocked,
} from './state';

const MARKDOWN_LANGUAGE_ID = 'markdown';
let isAdjustingFocus = false;

const focusCommandForViewColumn = (viewColumn: vscode.ViewColumn | undefined): string | undefined => {
	switch (viewColumn) {
		case vscode.ViewColumn.One:
			return 'workbench.action.focusFirstEditorGroup';
		case vscode.ViewColumn.Two:
			return 'workbench.action.focusSecondEditorGroup';
		case vscode.ViewColumn.Three:
			return 'workbench.action.focusThirdEditorGroup';
		case vscode.ViewColumn.Four:
			return 'workbench.action.focusFourthEditorGroup';
		case vscode.ViewColumn.Five:
			return 'workbench.action.focusFifthEditorGroup';
		case vscode.ViewColumn.Six:
			return 'workbench.action.focusSixthEditorGroup';
		case vscode.ViewColumn.Seven:
			return 'workbench.action.focusSeventhEditorGroup';
		case vscode.ViewColumn.Eight:
			return 'workbench.action.focusEighthEditorGroup';
		case vscode.ViewColumn.Nine:
			return 'workbench.action.focusNinthEditorGroup';
		default:
			return undefined;
	}
};

const openPreview = async (editor: vscode.TextEditor): Promise<void> => {
	try {
		await vscode.commands.executeCommand('markdown.showPreviewToSide', editor.document.uri);
		setCurrentPreviewUri(editor.document.uri);
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

const lockPreviewGroupIfNeeded = async (
	shouldLock: boolean,
	fallbackEditor: vscode.TextEditor,
): Promise<void> => {
	if (!shouldLock) {
		return;
	}
	const target = findMarkdownPreviewTab();
	if (!target) {
		setPreviewLocked(false);
		return;
	}

	const activeBefore = vscode.window.activeTextEditor;
	const focusCommand = focusCommandForViewColumn(target.group.viewColumn);

	try {
		if (focusCommand) {
			await vscode.commands.executeCommand(focusCommand);
		}
		await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
		setPreviewLocked(true);
	} catch (error) {
		console.error('[auto-markdown-preview-lock] failed to lock preview group:', error);
	} finally {
		// Restore focus to the main editor.
		if (activeBefore) {
			await vscode.window.showTextDocument(fallbackEditor.document, {
				viewColumn: fallbackEditor.viewColumn,
				preserveFocus: false,
				preview: false,
			});
		}
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
		resetPreviewState();
		return;
	}

	try {
		await vscode.window.tabGroups.close(target.tab, true);
		resetPreviewState();
		setPreviewLocked(false);
	} catch (error) {
		console.error('[auto-markdown-preview-lock] failed to close markdown preview:', error);
	}
};

const ensureEditorInPrimaryColumn = async (
	editor: vscode.TextEditor,
	forcePrimary: boolean,
): Promise<vscode.TextEditor> => {
	if (!forcePrimary || editor.viewColumn === vscode.ViewColumn.One) {
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

	const settings = getAutoMdPreviewConfig();

	// If focus moves to a webview or nowhere, do nothing to avoid closing the preview we just opened.
	if (!editor) {
		return;
	}

	if (!isMarkdownEditor(editor)) {
		setLastActiveKind('non-markdown');
		if (settings.closePreviewOnNonMarkdown) {
			await closeMarkdownPreviewIfExists();
		}
		// Move non-Markdown back to primary column to avoid opening on the right preview side.
		await ensureEditorInPrimaryColumn(editor, settings.alwaysOpenInPrimaryEditor);
		return;
	}

	if (!settings.enableAutoPreview) {
		setLastActiveKind('markdown');
		await ensureEditorInPrimaryColumn(editor, settings.alwaysOpenInPrimaryEditor);
		return;
	}

	// Keep Markdown editing on the primary (left) column to prevent cascading groups on the right.
	const primaryEditor = await ensureEditorInPrimaryColumn(editor, settings.alwaysOpenInPrimaryEditor);
	setLastActiveKind('markdown');

	// Skip reopening if we are already previewing the same document and the tab is present.
	const state = getPreviewState();
	if (state.currentPreviewUri?.toString() === primaryEditor.document.uri.toString() && findMarkdownPreviewTab()) {
		return;
	}

	// Close stale preview before opening a new one to avoid cascading groups.
	await closeMarkdownPreviewIfExists();
	await openPreview(primaryEditor);
	await lockPreviewGroupIfNeeded(settings.alwaysOpenInPrimaryEditor, primaryEditor);
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
