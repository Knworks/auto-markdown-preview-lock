// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getAutoMdPreviewConfig } from './config';
import {
	getPreviewState,
	PreviewState,
	resetPreviewState,
	setCurrentPreviewUri,
	setLastActiveKind,
	setLastActiveColumn,
	setLastNonMarkdownPlacement,
	setPreviewLocked,
} from './state';

const MARKDOWN_LANGUAGE_ID = 'markdown';
const COMMAND_TIMEOUT_MS = 300;
let isAdjustingFocus = false;
let trustWarningShown = false;
let lastHandledKey: string | undefined;
let lastHandledAt = 0;
const userSplitNonMarkdownKeys = new Set<string>();

const isPrimaryColumn = (column: vscode.ViewColumn | undefined): boolean =>
	column === vscode.ViewColumn.One || column === undefined;

const logWarn = (...args: unknown[]) => console.warn('[auto-markdown-preview-lock]', ...args);
const logError = (...args: unknown[]) => console.error('[auto-markdown-preview-lock]', ...args);

const uriKey = (uri: vscode.Uri | undefined): string | undefined => uri?.toString();

const executeCommandSafely = async (command: string, args: unknown[] = [], timeoutMs = COMMAND_TIMEOUT_MS) => {
	let timeout: NodeJS.Timeout | undefined;
	const timeoutPromise = new Promise((_, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`Command ${command} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		await Promise.race([vscode.commands.executeCommand(command, ...args), timeoutPromise]);
	} catch (error) {
		logWarn(`Command ${command} failed or timed out`, error);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
};

const handleDocumentClose = (document: vscode.TextDocument): void => {
	const key = uriKey(document.uri);
	if (key) {
		userSplitNonMarkdownKeys.delete(key);
	}

	const state = getPreviewState();
	if (state.lastNonMarkdownUri?.toString() === document.uri.toString()) {
		setLastNonMarkdownPlacement(undefined, undefined);
	}

	setLastActiveKind('markdown');
	setLastActiveColumn(undefined);
	lastHandledKey = undefined;
	lastHandledAt = 0;
};

const isWorkspaceTrusted = async (): Promise<boolean> => {
	if (vscode.workspace.isTrusted === false) {
		if (!trustWarningShown) {
			trustWarningShown = true;
			/* c8 ignore next */
			await vscode.window.showWarningMessage(
				'Auto Markdown Preview Lock is disabled because the workspace is not trusted.',
			);
		}
		return false;
	}
	return true;
};

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
		await executeCommandSafely('markdown.showPreviewToSide', [editor.document.uri]);
		setCurrentPreviewUri(editor.document.uri);
		// Ensure the text editor retains focus after opening preview.
		await vscode.window.showTextDocument(editor.document, {
			viewColumn: editor.viewColumn,
			preserveFocus: false,
			preview: false,
		});
	} catch (error) {
		/* c8 ignore next */
		logError('failed to open preview:', error);
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
			await executeCommandSafely(focusCommand);
		}
		await executeCommandSafely('workbench.action.lockEditorGroup');
		setPreviewLocked(true);
	} catch (error) {
		/* c8 ignore next */
		logError('failed to lock preview group:', error);
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

const unlockPreviewGroupIfNeeded = async (state: PreviewState, fallbackEditor: vscode.TextEditor): Promise<void> => {
	if (!state.isPreviewLocked) {
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
		await executeCommandSafely(focusCommand);
	}
		await executeCommandSafely('workbench.action.unlockEditorGroup');
		setPreviewLocked(false);
	}
	/* c8 ignore start */
	catch (error) {
		logError('failed to unlock preview group:', error);
	}
	/* c8 ignore end */
	finally {
		if (activeBefore) {
			await vscode.window.showTextDocument(fallbackEditor.document, {
				viewColumn: fallbackEditor.viewColumn,
				preserveFocus: false,
				preview: false,
			});
		}
	}
};

const isMarkdownEditor = (editor: vscode.TextEditor | undefined): boolean => {
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

const findTabByUri = (uri: vscode.Uri): { tab: vscode.Tab; group: vscode.TabGroup } | undefined => {
	const target = uri.toString();
	let fallback: { tab: vscode.Tab; group: vscode.TabGroup } | undefined;
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			const input = tab.input;
			if (input instanceof vscode.TabInputText && input.uri.toString() === target) {
				// Prefer non-primary (right) groups when multiple matches exist.
				if (group.viewColumn && group.viewColumn !== vscode.ViewColumn.One) {
					return { tab, group };
				}
				fallback = { tab, group };
			}
		}
	}
	return fallback;
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
	}
	/* c8 ignore start */
	catch (error) {
		console.error('[auto-markdown-preview-lock] failed to close markdown preview:', error);
	}
	/* c8 ignore end */
};

const ensureEditorInPrimaryColumn = async (
	editor: vscode.TextEditor,
	forcePrimary: boolean,
	options?: {
		previewGroupViewColumn?: vscode.ViewColumn;
		allowUserSplit?: boolean;
		lastActiveColumn?: vscode.ViewColumn;
	},
): Promise<vscode.TextEditor> => {
	if (!forcePrimary) {
		return editor;
	}

	const previewGroupViewColumn = options?.previewGroupViewColumn;
	const allowUserSplit = options?.allowUserSplit ?? false;
	const lastActiveColumn = options?.lastActiveColumn;

	// Respect explicit user-driven splits when they target non-primary columns and do not collide with the preview group.
	if (
		allowUserSplit &&
		lastActiveColumn === vscode.ViewColumn.One &&
		editor.viewColumn !== vscode.ViewColumn.One &&
		(previewGroupViewColumn === undefined || editor.viewColumn !== previewGroupViewColumn)
	) {
		return editor;
	}

	if (editor.viewColumn === vscode.ViewColumn.One) {
		return editor;
	}
	isAdjustingFocus = true;
	try {
		await executeCommandSafely('workbench.action.moveEditorToFirstGroup');
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

	const now = Date.now();
	const key = editor
		? `${editor.document.uri.toString()}::${editor.viewColumn ?? 0}::${editor.document.languageId}`
		: 'none';
	if (key === lastHandledKey && now - lastHandledAt < 200) {
		return;
	}
	lastHandledKey = key;
	lastHandledAt = now;

	const settings = getAutoMdPreviewConfig();

	// If focus moves to a webview or nowhere, do nothing to avoid closing the preview we just opened.
	if (!editor) {
		return;
	}

	const activeEditor = editor as vscode.TextEditor;
	const activeColumn = activeEditor.viewColumn;
	let currentEditor = activeEditor;

	if (!isMarkdownEditor(activeEditor)) {
		const previousState = getPreviewState();
		setLastActiveKind('non-markdown');
		if (settings.closePreviewOnNonMarkdown) {
			const state = getPreviewState();
		await unlockPreviewGroupIfNeeded(state, activeEditor);
		await closeMarkdownPreviewIfExists();
	}
	const currentKey = uriKey(activeEditor.document.uri);
	const isUserSplit =
		previousState.lastActiveKind === 'non-markdown' &&
		previousState.lastActiveColumn === vscode.ViewColumn.One &&
		!isPrimaryColumn(activeColumn) &&
		previousState.lastNonMarkdownUri?.toString() === activeEditor.document.uri.toString();

	if (isUserSplit && currentKey) {
		userSplitNonMarkdownKeys.add(currentKey);
	}

	const existingTab = currentKey ? findTabByUri(activeEditor.document.uri) : undefined;
	const isKnownUserSplit = currentKey ? userSplitNonMarkdownKeys.has(currentKey) : false;
	const groupViewColumn = existingTab?.group.viewColumn as vscode.ViewColumn | undefined;
	const hasRightTab = groupViewColumn !== undefined && groupViewColumn !== vscode.ViewColumn.One;
	const shouldStickToRight =
		!isPrimaryColumn(activeColumn) &&
		(isUserSplit || (isKnownUserSplit && hasRightTab));

	const shouldReuseExistingRight =
		existingTab &&
		hasRightTab &&
		shouldStickToRight &&
		!isPrimaryColumn(activeColumn);

	if (shouldReuseExistingRight && groupViewColumn) {
		await vscode.window.showTextDocument(activeEditor.document, {
			viewColumn: groupViewColumn,
			preserveFocus: false,
			preview: false,
		});
		setLastActiveColumn(groupViewColumn);
		setLastNonMarkdownPlacement(activeEditor.document.uri, groupViewColumn);
		return;
	}

	// Move non-Markdown back to primary column to avoid opening on the right preview side.
	if (!shouldStickToRight) {
		currentEditor = await ensureEditorInPrimaryColumn(activeEditor, settings.alwaysOpenInPrimaryEditor, {
			previewGroupViewColumn: findMarkdownPreviewTab()?.group.viewColumn,
			allowUserSplit: shouldStickToRight,
			lastActiveColumn: previousState.lastActiveColumn,
		});
	}
	setLastActiveColumn(currentEditor.viewColumn);
	setLastNonMarkdownPlacement(currentEditor.document.uri, currentEditor.viewColumn);
	return;
	}

	if (!settings.enableAutoPreview) {
		setLastActiveKind('markdown');
		setLastNonMarkdownPlacement(undefined, undefined);
		setLastActiveColumn(undefined);
		await ensureEditorInPrimaryColumn(activeEditor, settings.alwaysOpenInPrimaryEditor);
		return;
	}

	const trusted = await isWorkspaceTrusted();
	if (!trusted) {
		return;
	}

	// Keep Markdown editing on the primary (left) column to prevent cascading groups on the right.
	const previewTab = findMarkdownPreviewTab();
	const primaryEditor = await ensureEditorInPrimaryColumn(activeEditor, settings.alwaysOpenInPrimaryEditor, {
		previewGroupViewColumn: previewTab?.group.viewColumn,
		allowUserSplit: false,
		lastActiveColumn: getPreviewState().lastActiveColumn,
	});
	setLastActiveKind('markdown');
	setLastNonMarkdownPlacement(undefined, undefined);
	setLastActiveColumn(primaryEditor.viewColumn);

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

/* c8 ignore next 20 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Auto Markdown Preview Lock extension activated');

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			void handleActiveEditorChange(editor);
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			handleDocumentClose(document);
		}),
	);

	// Handle already active editor when the extension activates.
	void handleActiveEditorChange(vscode.window.activeTextEditor);
}

export function deactivate() {}

// Export for unit tests.
export const __handleActiveEditorChangeForTest = handleActiveEditorChange;
export const __handleDocumentCloseForTest = handleDocumentClose;
export const __setAdjustingFocusForTest = (value: boolean) => {
	isAdjustingFocus = value;
};
