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
	setLockedPreviewGroupViewColumn,
	setLastPreviewGroupViewColumn,
	setPreviewLocked,
	setSplitMode,
	setSplitPinnedRightUri,
	setSuppressAutoPreviewUri,
} from './state';

const MARKDOWN_LANGUAGE_ID = 'markdown';
const COMMAND_TIMEOUT_MS = 300;
let isAdjustingFocus = false;
let trustWarningShown = false;
let lastHandledKey: string | undefined;
let lastHandledAt = 0;
let isClosingPreviewProgrammatically = false;
let splitExitTimer: NodeJS.Timeout | undefined;
let isClosingAllTabsProgrammatically = false;
let isClosingEditorGroupsProgrammatically = false;
let ignoreTabsChangeUntil = 0;
let closeAllCandidateUntil = 0;
let closeBurstTextClosedCount = 0;
let closeBurstLastAt = 0;
let lastTextTabCountsByViewColumn: Map<vscode.ViewColumn, number> | undefined;
const userSplitNonMarkdownKeys = new Set<string>();

const isPrimaryColumn = (column: vscode.ViewColumn | undefined): boolean =>
	column === vscode.ViewColumn.One || column === undefined;

const logWarn = (...args: unknown[]) => console.warn('[auto-markdown-preview-lock]', ...args);
const logError = (...args: unknown[]) => console.error('[auto-markdown-preview-lock]', ...args);

const uriKey = (uri: vscode.Uri | undefined): string | undefined => uri?.toString();

const isDiffTab = (tab: vscode.Tab | undefined): boolean => {
	if (!tab?.input) {
		return false;
	}
	return tab.input instanceof vscode.TabInputTextDiff;
};

const isSourceControlDiffTab = (tab: vscode.Tab | undefined): boolean => {
	if (!isDiffTab(tab)) {
		return false;
	}
	const input = tab?.input as vscode.TabInputTextDiff | undefined;
	const originalScheme = input?.original?.scheme;
	const modifiedScheme = input?.modified?.scheme;
	return (
		originalScheme === 'git' ||
		modifiedScheme === 'git' ||
		originalScheme === 'vscode-scm' ||
		modifiedScheme === 'vscode-scm' ||
		originalScheme === 'scm' ||
		modifiedScheme === 'scm'
	);
};

const computeTextTabCountsByViewColumn = (): Map<vscode.ViewColumn, number> => {
	const counts = new Map<vscode.ViewColumn, number>();
	for (const group of vscode.window.tabGroups.all) {
		const column = group.viewColumn as vscode.ViewColumn | undefined;
		if (!column) {
			continue;
		}
		const textTabCount = group.tabs.filter(
			(tab) => tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputTextDiff,
		).length;
		counts.set(column, textTabCount);
	}
	return counts;
};

const didAnyTextTabGroupBecomeEmpty = (
	previous: Map<vscode.ViewColumn, number>,
	current: Map<vscode.ViewColumn, number>,
): boolean => {
	for (const [column, previousCount] of previous.entries()) {
		if (previousCount > 0 && (current.get(column) ?? 0) === 0) {
			return true;
		}
	}
	return false;
};

const executeCommandSafely = async (
	command: string,
	args: unknown[] = [],
	timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<boolean> => {
	let timeout: NodeJS.Timeout | undefined;
	const timeoutPromise = new Promise((_, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`Command ${command} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		await Promise.race([vscode.commands.executeCommand(command, ...args), timeoutPromise]);
		return true;
	} catch (error) {
		logWarn(`Command ${command} failed or timed out`, error);
		return false;
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
	if (state.splitPinnedRightUri?.toString() === document.uri.toString()) {
		setSplitPinnedRightUri(undefined);
	}
	if (state.suppressAutoPreviewUri?.toString() === document.uri.toString()) {
		setSuppressAutoPreviewUri(undefined);
	}
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
		const previewTab = findMarkdownPreviewTab();
		setLastPreviewGroupViewColumn(previewTab?.group.viewColumn as vscode.ViewColumn | undefined);
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
	const targetColumn = target.group.viewColumn as vscode.ViewColumn | undefined;
	if (!targetColumn || targetColumn === vscode.ViewColumn.One) {
		setPreviewLocked(false);
		return;
	}
	const focusCommand = focusCommandForViewColumn(targetColumn);

	try {
		if (!focusCommand) {
			setPreviewLocked(false);
			return;
		}
		const focused = await executeCommandSafely(focusCommand);
		const activeGroupColumn = vscode.window.tabGroups.activeTabGroup?.viewColumn as vscode.ViewColumn | undefined;
		if (!focused || activeGroupColumn !== targetColumn) {
			setPreviewLocked(false);
			return;
		}

		const locked = await executeCommandSafely('workbench.action.lockEditorGroup');
		if (!locked) {
			setPreviewLocked(false);
			return;
		}
		setLockedPreviewGroupViewColumn(targetColumn);
		setLastPreviewGroupViewColumn(targetColumn);
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
		// Never leave the primary (left) group locked.
		if (fallbackEditor.viewColumn === vscode.ViewColumn.One || fallbackEditor.viewColumn === undefined) {
			await executeCommandSafely('workbench.action.unlockEditorGroup');
		}
	}
};

const unlockPreviewGroupIfNeeded = async (
	state: PreviewState,
	fallbackEditor?: vscode.TextEditor,
): Promise<void> => {
	if (!state.isPreviewLocked) {
		return;
	}
	const target = findMarkdownPreviewTab();
	if (!target) {
		const targetColumn = state.lockedPreviewGroupViewColumn;
		const focusCommand = focusCommandForViewColumn(targetColumn);
		isAdjustingFocus = true;
		try {
			if (focusCommand && targetColumn) {
				const focused = await executeCommandSafely(focusCommand);
				const activeGroupColumn = vscode.window.tabGroups.activeTabGroup?.viewColumn as vscode.ViewColumn | undefined;
				if (focused && activeGroupColumn === targetColumn) {
					await executeCommandSafely('workbench.action.unlockEditorGroup');
				}
			}
			setPreviewLocked(false);
		}
		/* c8 ignore start */
		catch (error) {
			logError('failed to unlock preview group:', error);
		}
		/* c8 ignore end */
		finally {
			isAdjustingFocus = false;
		}
		return;
	}

	const activeBefore = vscode.window.activeTextEditor;
	const targetColumn = target.group.viewColumn as vscode.ViewColumn | undefined;
	const focusCommand = focusCommandForViewColumn(targetColumn);

	try {
		if (focusCommand && targetColumn) {
			const focused = await executeCommandSafely(focusCommand);
			const activeGroupColumn = vscode.window.tabGroups.activeTabGroup?.viewColumn as vscode.ViewColumn | undefined;
			if (focused && activeGroupColumn === targetColumn) {
				await executeCommandSafely('workbench.action.unlockEditorGroup');
			}
		}
		setPreviewLocked(false);
	}
	/* c8 ignore start */
	catch (error) {
		logError('failed to unlock preview group:', error);
	}
	/* c8 ignore end */
	finally {
		if (activeBefore && fallbackEditor) {
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
		isClosingPreviewProgrammatically = true;
		await vscode.window.tabGroups.close(target.tab, true);
		resetPreviewState();
		setPreviewLocked(false);
	}
	/* c8 ignore start */
	catch (error) {
		console.error('[auto-markdown-preview-lock] failed to close markdown preview:', error);
	}
	/* c8 ignore end */
	finally {
		isClosingPreviewProgrammatically = false;
	}
};

const computeIsSplitModeFromVisibleEditors = (
	editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors,
): boolean => {
	const columns = new Set<number>();
	for (const editor of editors) {
		if (editor.viewColumn !== undefined) {
			columns.add(editor.viewColumn);
		}
	}
	return columns.size >= 2;
};

const computeIsSplitModeFromTabGroups = (): boolean => {
	const columns = new Set<number>();
	for (const group of vscode.window.tabGroups.all) {
		const viewColumn = group.viewColumn;
		if (!viewColumn) {
			continue;
		}
		const hasTextTab = group.tabs.some(
			(tab) => tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputTextDiff,
		);
		if (hasTextTab) {
			columns.add(viewColumn);
		}
	}
	return columns.size >= 2;
};

const computeIsSplitModeNow = (editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors): boolean =>
	computeIsSplitModeFromVisibleEditors(editors) || computeIsSplitModeFromTabGroups();

const visibleTextEditorColumns = (
	editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors,
): vscode.ViewColumn[] => {
	const columns = new Set<number>();
	for (const editor of editors) {
		if (editor.viewColumn !== undefined) {
			columns.add(editor.viewColumn);
		}
	}
	return [...columns].sort((a, b) => a - b) as vscode.ViewColumn[];
};

const derivePinnedRightUriFromTabGroups = (): vscode.Uri | undefined => {
	for (const group of vscode.window.tabGroups.all) {
		const viewColumn = group.viewColumn as vscode.ViewColumn | undefined;
		if (!viewColumn || viewColumn === vscode.ViewColumn.One) {
			continue;
		}
		for (const tab of group.tabs) {
			const input = tab.input;
			if (input instanceof vscode.TabInputText) {
				return input.uri;
			}
			if (input instanceof vscode.TabInputTextDiff) {
				return input.modified;
			}
		}
	}
	return undefined;
};

const ensureAtMostTwoTextEditorGroups = async (): Promise<void> => {
	const columns = visibleTextEditorColumns();
	if (columns.length <= 2) {
		return;
	}
	const activeBefore = vscode.window.activeTextEditor;
	ignoreTabsChangeUntil = Math.max(ignoreTabsChangeUntil, Date.now() + 750);
	isClosingEditorGroupsProgrammatically = true;
	try {
		for (const column of columns.slice(2).reverse()) {
			const focusCommand = focusCommandForViewColumn(column);
			if (focusCommand) {
				await executeCommandSafely(focusCommand);
				await executeCommandSafely('workbench.action.closeEditorsAndGroup');
			}
		}
	} finally {
		isClosingEditorGroupsProgrammatically = false;
		ignoreTabsChangeUntil = Math.max(ignoreTabsChangeUntil, Date.now() + 750);
	}

	if (activeBefore && (activeBefore.viewColumn === vscode.ViewColumn.One || activeBefore.viewColumn === vscode.ViewColumn.Two)) {
		await vscode.window.showTextDocument(activeBefore.document, {
			viewColumn: activeBefore.viewColumn,
			preserveFocus: false,
			preview: false,
		});
	}
};

const closeEditorGroupIfEmpty = async (viewColumn: vscode.ViewColumn | undefined): Promise<void> => {
	if (!viewColumn || viewColumn === vscode.ViewColumn.One) {
		return;
	}
	const group = vscode.window.tabGroups.all.find(
		(candidate) => (candidate.viewColumn as vscode.ViewColumn | undefined) === viewColumn,
	);
	if (!group || group.tabs.length !== 0) {
		return;
	}
	const focusCommand = focusCommandForViewColumn(viewColumn);
	if (!focusCommand) {
		return;
	}
	const focused = await executeCommandSafely(focusCommand);
	const activeGroupColumn = vscode.window.tabGroups.activeTabGroup?.viewColumn as vscode.ViewColumn | undefined;
	if (!focused || activeGroupColumn !== viewColumn) {
		return;
	}
	await executeCommandSafely('workbench.action.closeEditorsAndGroup');
};

const closeAllEmptyNonPrimaryGroups = async (): Promise<void> => {
	const emptyColumns = vscode.window.tabGroups.all
		.filter((group) => group.tabs.length === 0)
		.map((group) => group.viewColumn as vscode.ViewColumn | undefined)
		.filter((column): column is vscode.ViewColumn => column !== undefined && column !== vscode.ViewColumn.One)
		.sort((a, b) => b - a);

	if (emptyColumns.length === 0) {
		return;
	}
	ignoreTabsChangeUntil = Math.max(ignoreTabsChangeUntil, Date.now() + 750);
	for (const column of emptyColumns) {
		await closeEditorGroupIfEmpty(column);
	}
};

const updateSplitModeStateFromVisibleEditors = async (
	editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors,
): Promise<void> => {
	const isSplitMode = computeIsSplitModeNow(editors);
	const previous = getPreviewState();
	if (previous.isSplitMode && !isSplitMode) {
		if (splitExitTimer) {
			return;
		}
		splitExitTimer = setTimeout(() => {
			splitExitTimer = undefined;
			void (async () => {
				if (computeIsSplitModeNow()) {
					return;
				}
				const state = getPreviewState();
				if (!state.isSplitMode) {
					return;
				}
				setSplitMode(false);
				setSplitPinnedRightUri(undefined);
				const active = vscode.window.activeTextEditor;
				if (active) {
					await handleActiveEditorChange(active);
				}
			})();
		}, 150);
		return;
	}

	if (splitExitTimer) {
		clearTimeout(splitExitTimer);
		splitExitTimer = undefined;
	}

	if (previous.isSplitMode === isSplitMode) {
		return;
	}

	setSplitMode(isSplitMode);
	if (!isSplitMode) {
		setSplitPinnedRightUri(undefined);
		return;
	}

	await ensureAtMostTwoTextEditorGroups();

	const pinnedRight =
		editors.find((editor) => !isPrimaryColumn(editor.viewColumn))?.document.uri ?? derivePinnedRightUriFromTabGroups();
	setSplitPinnedRightUri(pinnedRight);

	const fallbackEditor = vscode.window.activeTextEditor;
	if (fallbackEditor) {
		await unlockPreviewGroupIfNeeded(getPreviewState(), fallbackEditor);
		await closeMarkdownPreviewIfExists();
	}
};

const handleTabsChange = async (event: vscode.TabChangeEvent): Promise<void> => {
	const now = Date.now();
	const ignoreCloseAllHeuristics = ignoreTabsChangeUntil !== 0 && now <= ignoreTabsChangeUntil;
	const previousTextTabCountsByViewColumn = lastTextTabCountsByViewColumn;
	const textGroupBecameEmpty =
		previousTextTabCountsByViewColumn !== undefined &&
		didAnyTextTabGroupBecomeEmpty(previousTextTabCountsByViewColumn, computeTextTabCountsByViewColumn());

	try {
		if (isClosingAllTabsProgrammatically) {
			return;
		}
		if (isClosingEditorGroupsProgrammatically) {
			return;
		}
		if (isClosingPreviewProgrammatically) {
			return;
		}
		const state = getPreviewState();
		const closedPreview = event.closed?.some(isMarkdownPreviewTab) ?? false;
		if (closedPreview) {
			const lastPreviewGroupViewColumn =
				state.lastPreviewGroupViewColumn ?? (state.lockedPreviewGroupViewColumn as vscode.ViewColumn | undefined);
			if (state.currentPreviewUri) {
				setSuppressAutoPreviewUri(state.currentPreviewUri);
			}
			const fallbackEditor = vscode.window.activeTextEditor;
			if (fallbackEditor) {
				await unlockPreviewGroupIfNeeded(state, fallbackEditor);
			}
			if (!computeIsSplitModeNow()) {
				await closeEditorGroupIfEmpty(lastPreviewGroupViewColumn);
			}
		}

		const hasAnyTextTab = vscode.window.tabGroups.all.some((group) =>
			group.tabs.some(
				(tab) => tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputTextDiff,
			),
		);
		if (!hasAnyTextTab && state.isPreviewLocked) {
			await unlockPreviewGroupIfNeeded(state);
		}
		// When nothing is open, ensure the primary group is not left locked.
		if (!hasAnyTextTab) {
			const focused = await executeCommandSafely('workbench.action.focusFirstEditorGroup');
			if (focused) {
				await executeCommandSafely('workbench.action.unlockEditorGroup');
			}
		}

		const closedTextCount =
			event.opened?.length === 0
				? (event.closed ?? []).filter(
						(tab) => tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputTextDiff,
					).length
				: 0;

		// When a "Close All" action empties only one group (side-by-side), close the remaining splits for the same document.
		if (textGroupBecameEmpty && hasAnyTextTab && closedTextCount > 0 && (event.opened?.length ?? 0) === 0) {
			if (ignoreCloseAllHeuristics) {
				return;
			}

			const closedTextUris = new Set(
				(event.closed ?? [])
					.map((tab) => tab.input)
					.filter((input): input is vscode.TabInputText => input instanceof vscode.TabInputText)
					.map((input) => input.uri.toString()),
			);
			const remainingSplitsForClosedUris = vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.filter(
					(tab) =>
						tab.input instanceof vscode.TabInputText && closedTextUris.has(tab.input.uri.toString()),
				);

			// If there are no remaining splits for the closed document(s), this is likely a normal single-tab close.
			if (remainingSplitsForClosedUris.length === 0) {
				return;
			}

			isClosingAllTabsProgrammatically = true;
			try {
				if (state.isPreviewLocked) {
					await unlockPreviewGroupIfNeeded(state);
				}
				await closeMarkdownPreviewIfExists();
				await vscode.window.tabGroups.close(remainingSplitsForClosedUris, true);
				await closeAllEmptyNonPrimaryGroups();
				const focused = await executeCommandSafely('workbench.action.focusFirstEditorGroup');
				if (focused) {
					await executeCommandSafely('workbench.action.unlockEditorGroup');
				}
			} finally {
				isClosingAllTabsProgrammatically = false;
				closeAllCandidateUntil = 0;
				closeBurstTextClosedCount = 0;
				closeBurstLastAt = 0;
			}
			return;
		}

		// If all text tabs are closed (e.g. "Close All" with a single tab), never leave the markdown preview behind.
		if (!hasAnyTextTab && closedTextCount > 0) {
			if (state.isPreviewLocked) {
				await unlockPreviewGroupIfNeeded(state);
			}
			await closeMarkdownPreviewIfExists();
			await closeAllEmptyNonPrimaryGroups();
		}

		if (closedTextCount > 0) {
			if (ignoreCloseAllHeuristics) {
				return;
			}
			if (now - closeBurstLastAt > 250) {
				closeBurstTextClosedCount = 0;
			}
			closeBurstTextClosedCount += closedTextCount;
			closeBurstLastAt = now;
			if (closeBurstTextClosedCount >= 2) {
				closeAllCandidateUntil = now + 500;
			}
		}

		const isCloseAllLike = (event.opened?.length ?? 0) === 0 && (event.closed?.length ?? 0) >= 2;
		if (isCloseAllLike) {
			if (ignoreCloseAllHeuristics) {
				return;
			}
			isClosingAllTabsProgrammatically = true;
			try {
				if (state.isPreviewLocked) {
					await unlockPreviewGroupIfNeeded(state);
				}
				await closeMarkdownPreviewIfExists();
				const remainingTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
				if (remainingTabs.length > 0) {
					await vscode.window.tabGroups.close(remainingTabs, true);
				}
				await closeAllEmptyNonPrimaryGroups();
			} finally {
				isClosingAllTabsProgrammatically = false;
			}
		}

		const isCloseAllCandidate = closeAllCandidateUntil !== 0 && now <= closeAllCandidateUntil;
		if (isCloseAllCandidate && !hasAnyTextTab) {
			if (ignoreCloseAllHeuristics) {
				return;
			}
			isClosingAllTabsProgrammatically = true;
			try {
				await closeMarkdownPreviewIfExists();
				const remainingTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
				if (remainingTabs.length > 0) {
					await vscode.window.tabGroups.close(remainingTabs, true);
				}
				await closeAllEmptyNonPrimaryGroups();
			} finally {
				isClosingAllTabsProgrammatically = false;
				closeAllCandidateUntil = 0;
				closeBurstTextClosedCount = 0;
				closeBurstLastAt = 0;
			}
		}
	} finally {
		lastTextTabCountsByViewColumn = computeTextTabCountsByViewColumn();
	}
};;;

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
	const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
	if (isDiffTab(activeTab)) {
		const diffInput = activeTab?.input as vscode.TabInputTextDiff | undefined;
		const diffKey = diffInput ? `diff:${diffInput.original.toString()}::${diffInput.modified.toString()}` : 'diff';
		if (diffKey === lastHandledKey && now - lastHandledAt < 200) {
			return;
		}
		lastHandledKey = diffKey;
		lastHandledAt = now;

		if (isSourceControlDiffTab(activeTab)) {
			const activeGroupColumn = vscode.window.tabGroups.activeTabGroup?.viewColumn as vscode.ViewColumn | undefined;
			const state = getPreviewState();
			if (state.isPreviewLocked) {
				await unlockPreviewGroupIfNeeded(state);
				const focusCommand = focusCommandForViewColumn(activeGroupColumn);
				if (focusCommand) {
					await executeCommandSafely(focusCommand);
				}
			}
			await closeMarkdownPreviewIfExists();
			await executeCommandSafely('workbench.action.joinAllGroups');
			setSplitMode(false);
			setSplitPinnedRightUri(undefined);
			return;
		}
		await closeMarkdownPreviewIfExists();
		return;
	}

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

	const stateBefore = getPreviewState();
	if (
		stateBefore.suppressAutoPreviewUri &&
		stateBefore.suppressAutoPreviewUri.toString() !== activeEditor.document.uri.toString()
	) {
		setSuppressAutoPreviewUri(undefined);
	}

	const isSplitModeNow = stateBefore.isSplitMode || computeIsSplitModeNow();
	if (isSplitModeNow) {
		const activeColumnBeforeGroupCleanup = activeColumn;
		await ensureAtMostTwoTextEditorGroups();
		if (
			activeColumnBeforeGroupCleanup !== undefined &&
			activeColumnBeforeGroupCleanup > vscode.ViewColumn.Two
		) {
			// The active editor group may have been closed while consolidating groups; wait for the next editor change event.
			return;
		}
		if (!stateBefore.isSplitMode) {
			await updateSplitModeStateFromVisibleEditors();
		}

		const fallbackEditor = vscode.window.activeTextEditor ?? activeEditor;
		await unlockPreviewGroupIfNeeded(getPreviewState(), fallbackEditor);
		await closeMarkdownPreviewIfExists();

		const state = getPreviewState();
		const pinnedRightUri = state.splitPinnedRightUri;
		const isRightColumn = !isPrimaryColumn(activeColumn);

		if (isRightColumn) {
			if (!pinnedRightUri) {
				// First observed right editor becomes the pinned one.
				setSplitPinnedRightUri(activeEditor.document.uri);
			} else if (pinnedRightUri.toString() === activeEditor.document.uri.toString()) {
				// Keep the pinned right editor as-is.
			} else if (stateBefore.lastActiveColumn === vscode.ViewColumn.One) {
				// User explicitly opened to the side from the left: keep it on the right and repin.
				setSplitPinnedRightUri(activeEditor.document.uri);
			} else {
				// "Open" while focus is on the right should still land on the left; restore the pinned right editor.
				currentEditor = await ensureEditorInPrimaryColumn(activeEditor, true);
				const pinnedTab = findTabByUri(pinnedRightUri);
				const pinnedColumn = pinnedTab?.group.viewColumn as vscode.ViewColumn | undefined;
				if (pinnedColumn && pinnedColumn !== vscode.ViewColumn.One) {
					isAdjustingFocus = true;
					try {
						await vscode.window.showTextDocument(pinnedRightUri, {
							viewColumn: pinnedColumn,
							preserveFocus: true,
							preview: false,
						});
					} finally {
						isAdjustingFocus = false;
					}
				}
			}
		}

		setLastActiveKind(isMarkdownEditor(activeEditor) ? 'markdown' : 'non-markdown');
		setLastActiveColumn(currentEditor.viewColumn);
		if (isMarkdownEditor(currentEditor)) {
			setLastNonMarkdownPlacement(undefined, undefined);
		} else {
			setLastNonMarkdownPlacement(currentEditor.document.uri, currentEditor.viewColumn);
		}
		return;
	}

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

	const updatedState = getPreviewState();
	if (updatedState.suppressAutoPreviewUri?.toString() === primaryEditor.document.uri.toString()) {
		return;
	}

	// Skip reopening if we are already previewing the same document and the tab is present.
	if (
		updatedState.currentPreviewUri?.toString() === primaryEditor.document.uri.toString() &&
		findMarkdownPreviewTab()
	) {
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
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			void updateSplitModeStateFromVisibleEditors(editors);
		}),
		vscode.window.tabGroups.onDidChangeTabs((event) => {
			void handleTabsChange(event);
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
export const __handleTabsChangeForTest = handleTabsChange;
export const __updateSplitModeStateFromVisibleEditorsForTest = updateSplitModeStateFromVisibleEditors;
export const __resetInternalStateForTest = () => {
	isAdjustingFocus = false;
	trustWarningShown = false;
	lastHandledKey = undefined;
	lastHandledAt = 0;
	isClosingPreviewProgrammatically = false;
	isClosingAllTabsProgrammatically = false;
	isClosingEditorGroupsProgrammatically = false;
	ignoreTabsChangeUntil = 0;
	closeAllCandidateUntil = 0;
	closeBurstTextClosedCount = 0;
	closeBurstLastAt = 0;
	lastTextTabCountsByViewColumn = undefined;
	userSplitNonMarkdownKeys.clear();
	if (splitExitTimer) {
		clearTimeout(splitExitTimer);
		splitExitTimer = undefined;
	}
};;
export const __setAdjustingFocusForTest = (value: boolean) => {
	isAdjustingFocus = value;
};
