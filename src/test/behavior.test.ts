import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('vscode', async () => await import('./vscodeMock'));
import {
	__handleActiveEditorChangeForTest,
	__handleDocumentCloseForTest,
	__handleTabsChangeForTest,
	__updateSplitModeStateFromVisibleEditorsForTest,
	__resetInternalStateForTest,
	__setAdjustingFocusForTest,
} from '../extension';
import {
	resetMocks,
	setConfigValues,
	__mocks,
	ViewColumn,
	TabInputWebview,
	TabInputText,
	TabInputTextDiff,
	Uri,
} from './vscodeMock';
import {
	resetAllState,
	setPreviewLocked,
	setCurrentPreviewUri,
	getPreviewState,
	setLastActiveColumn,
	setLastActiveKind,
	setLastNonMarkdownPlacement,
	setLockedPreviewGroupViewColumn,
	setSplitMode,
	setSplitPinnedRightUri,
} from '../state';

type ViewColumnValue = (typeof ViewColumn)[keyof typeof ViewColumn];

const createTextEditor = (uriPath: string, languageId: string, viewColumn: ViewColumnValue = ViewColumn.One) =>
	({
		document: {
			languageId,
			uri: Uri.file(uriPath),
		},
		viewColumn,
	}) as any;

describe('handleActiveEditorChange', () => {
	beforeEach(() => {
		resetMocks();
		resetAllState();
		__resetInternalStateForTest();
		__setAdjustingFocusForTest(false);
		__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.One } as any;
		__mocks.commands.executeCommand.mockImplementation(async (command: string) => {
			if (command === 'workbench.action.focusFirstEditorGroup') {
				__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.One } as any;
			}
			if (command === 'workbench.action.focusSecondEditorGroup') {
				__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.Two } as any;
			}
			if (command === 'workbench.action.focusThirdEditorGroup') {
				__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.Three } as any;
			}
			if (command === 'workbench.action.focusFourthEditorGroup') {
				__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.Four } as any;
			}
			if (command === 'workbench.action.focusFifthEditorGroup') {
				__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.Five } as any;
			}
			return undefined as any;
		});
	});

	it('opens preview and locks group for markdown when enabled', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.Five } as any;
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Five,
			},
		] as any;
		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('markdown.showPreviewToSide');
		expect(executed).toContain('workbench.action.lockEditorGroup');
		expect(executed).toContain('workbench.action.focusFifthEditorGroup');
	});

	it('does not lock the left editor group when focusing the preview group fails', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.One } as any;
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		__mocks.commands.executeCommand.mockImplementation(async (command: string) => {
			if (command === 'workbench.action.focusSecondEditorGroup') {
				throw new Error('focus failed');
			}
			return undefined as any;
		});

		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('workbench.action.lockEditorGroup');
	});

	it('skips reopening preview when same markdown already open', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		// prime state and tab
		setCurrentPreviewUri(editor.document.uri);
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		await __handleActiveEditorChangeForTest(editor);
		// No new calls since preview already tracked
		expect(__mocks.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('does not reopen preview after user manually closes it until another file is opened', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		// Preview exists (to simulate locking path).
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		await __handleActiveEditorChangeForTest(editor);

		// User closes the preview tab manually.
		__mocks.tabGroups.all = [] as any;
		await __handleTabsChangeForTest({
			closed: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
			opened: [],
			changed: [],
		} as any);

		__mocks.commands.executeCommand.mockClear();
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.commands.executeCommand.mock.calls.map((c) => c[0])).not.toContain('markdown.showPreviewToSide');

		// Opening a different file clears the suppression.
		const other = createTextEditor('/b.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(other);

		__mocks.commands.executeCommand.mockClear();
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.commands.executeCommand.mock.calls.map((c) => c[0])).toContain('markdown.showPreviewToSide');
	});

	it('closes the preview-created empty group when the user closes the markdown preview tab', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		// Preview exists on the right (group 2).
		__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.Two } as any;
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		await __handleActiveEditorChangeForTest(editor);

		// Simulate user closing the preview, leaving an empty right group.
		__mocks.tabGroups.all = [
			{
				tabs: [],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		__mocks.commands.executeCommand.mockClear();
		await __handleTabsChangeForTest({
			closed: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
			opened: [],
			changed: [],
		} as any);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.closeEditorsAndGroup');
	});

	it('unlocks the preview group when all text tabs are closed', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		setPreviewLocked(true);
		setLockedPreviewGroupViewColumn(ViewColumn.Two as any);
		__mocks.tabGroups.activeTabGroup = { viewColumn: ViewColumn.Two } as any;
		// No tabs left after closing.
		__mocks.tabGroups.all = [] as any;

		__mocks.commands.executeCommand.mockClear();
		await __handleTabsChangeForTest({
			closed: [{ input: new TabInputText(Uri.file('/a.ts')) }],
			opened: [],
			changed: [],
		} as any);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.unlockEditorGroup');
	});

	it('closes remaining tabs when multiple tabs are closed at once (close all)', async () => {
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputText(Uri.file('/remain.ts')) }],
				viewColumn: ViewColumn.One,
			},
		] as any;

		await __handleTabsChangeForTest({
			closed: [
				{ input: new TabInputText(Uri.file('/a.ts')) },
				{ input: new TabInputText(Uri.file('/b.ts')) },
			],
			opened: [],
			changed: [],
		} as any);

		expect(__mocks.tabGroups.close).toHaveBeenCalledTimes(1);
	});

	it('also closes markdown preview when close-all is emitted as multiple single close events', async () => {
		// After "Close All", VS Code may emit tab close events one by one; assume only preview remains.
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		__mocks.tabGroups.close.mockClear();
		await __handleTabsChangeForTest({
			closed: [{ input: new TabInputText(Uri.file('/a.ts')) }],
			opened: [],
			changed: [],
		} as any);
		await __handleTabsChangeForTest({
			closed: [{ input: new TabInputText(Uri.file('/b.ts')) }],
			opened: [],
			changed: [],
		} as any);

		const closeArgs = __mocks.tabGroups.close.mock.calls.map((call) => call[0]);
		expect(closeArgs.length).toBeGreaterThan(0);
	});

	it('closes preview and unlocks when switching to non-markdown', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const mdEditor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(mdEditor);

		// simulate locked preview existing
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		setPreviewLocked(true);
		const nonMdEditor = createTextEditor('/b.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(nonMdEditor);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.unlockEditorGroup');
		expect(__mocks.tabGroups.close).toHaveBeenCalled();
	});

	it('closes markdown preview and keeps the right editor when entering split mode', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: false,
			alwaysOpenInPrimaryEditor: true,
		});
		// Simulate a locked preview on the right.
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		setPreviewLocked(true);
		setLockedPreviewGroupViewColumn(ViewColumn.Two as any);

		const left = createTextEditor('/left.md', 'markdown', ViewColumn.One);
		const right = createTextEditor('/right.ts', 'typescript', ViewColumn.Two);
		__mocks.window.visibleTextEditors = [left, right] as any;

		await __handleActiveEditorChangeForTest(right);
		expect(__mocks.tabGroups.close).toHaveBeenCalledTimes(1);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.unlockEditorGroup');
		expect(executed).not.toContain('workbench.action.moveEditorToFirstGroup');
	});

	it('moves newly opened right-side editor to the left during split mode and restores the pinned right editor', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		setSplitMode(true);
		setSplitPinnedRightUri(Uri.file('/right.ts'));
		setLastActiveColumn(ViewColumn.Two as any);
		const left = createTextEditor('/left.ts', 'typescript', ViewColumn.One);
		const right = createTextEditor('/right.ts', 'typescript', ViewColumn.Two);
		__mocks.window.visibleTextEditors = [left, right] as any;
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputText(Uri.file('/left.ts')) }],
				viewColumn: ViewColumn.One,
			},
			{
				tabs: [
					{ input: new TabInputText(Uri.file('/right.ts')) },
					{ input: new TabInputText(Uri.file('/new.ts')) },
				],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		const newRight = createTextEditor('/new.ts', 'typescript', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(newRight);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.moveEditorToFirstGroup');
		expect(__mocks.window.showTextDocument).toHaveBeenCalledWith(
			newRight.document,
			expect.objectContaining({ viewColumn: ViewColumn.One }),
		);
		expect(__mocks.window.showTextDocument).toHaveBeenCalledWith(
			expect.objectContaining({ toString: expect.any(Function) }),
			expect.objectContaining({ viewColumn: ViewColumn.Two, preserveFocus: true }),
		);
	});

	it('keeps the file on the right and repins when opened-to-side from the left during split mode', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		setSplitMode(true);
		setSplitPinnedRightUri(Uri.file('/right.ts'));
		setLastActiveColumn(ViewColumn.One as any);

		const left = createTextEditor('/left.ts', 'typescript', ViewColumn.One);
		const newRight = createTextEditor('/new.ts', 'typescript', ViewColumn.Two);
		__mocks.window.visibleTextEditors = [left, newRight] as any;
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputText(Uri.file('/left.ts')) }],
				viewColumn: ViewColumn.One,
			},
			{
				tabs: [
					{ input: new TabInputText(Uri.file('/right.ts')) },
					{ input: new TabInputText(Uri.file('/new.ts')) },
				],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		await __handleActiveEditorChangeForTest(newRight);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('workbench.action.moveEditorToFirstGroup');
		expect(getPreviewState().splitPinnedRightUri?.toString()).toBe('/new.ts');
	});

	it('does not overwrite pinned right uri when a different file becomes visible on the right during split mode', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		setSplitMode(true);
		setSplitPinnedRightUri(Uri.file('/right.ts'));

		const left = createTextEditor('/left.ts', 'typescript', ViewColumn.One);
		const newRight = createTextEditor('/new.ts', 'typescript', ViewColumn.Two);
		__mocks.window.visibleTextEditors = [left, newRight] as any;
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputText(Uri.file('/left.ts')) }],
				viewColumn: ViewColumn.One,
			},
			{
				tabs: [
					{ input: new TabInputText(Uri.file('/right.ts')) },
					{ input: new TabInputText(Uri.file('/new.ts')) },
				],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		await __updateSplitModeStateFromVisibleEditorsForTest(__mocks.window.visibleTextEditors as any);
		expect(getPreviewState().splitPinnedRightUri?.toString()).toBe('/right.ts');

		await __handleActiveEditorChangeForTest(newRight);
		expect(__mocks.commands.executeCommand.mock.calls.map((c) => c[0])).toContain('workbench.action.moveEditorToFirstGroup');
	});

	it('does not open markdown preview while in split mode', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		setSplitMode(true);
		setSplitPinnedRightUri(Uri.file('/right.ts'));
		const left = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		const right = createTextEditor('/right.ts', 'typescript', ViewColumn.Two);
		__mocks.window.visibleTextEditors = [left, right] as any;

		await __handleActiveEditorChangeForTest(left);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('markdown.showPreviewToSide');
	});

	it('keeps split mode behavior even when visibleTextEditors temporarily reports a single column', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		setSplitMode(true);
		setSplitPinnedRightUri(Uri.file('/right.ts'));

		const left = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		// Transient: visibleTextEditors only includes the left editor.
		__mocks.window.visibleTextEditors = [left] as any;
		// But tabGroups still has two text editor groups.
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputText(Uri.file('/a.md')) }],
				viewColumn: ViewColumn.One,
			},
			{
				tabs: [{ input: new TabInputText(Uri.file('/right.ts')) }],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		await __handleActiveEditorChangeForTest(left);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('markdown.showPreviewToSide');
		expect(getPreviewState().isSplitMode).toBe(true);
	});

	it('skips lock/unlock when alwaysOpenInPrimaryEditor is false', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: false,
		});
		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(editor);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('workbench.action.lockEditorGroup');
	});

	it('does nothing for markdown when auto preview is disabled', async () => {
		setConfigValues({
			enableAutoPreview: false,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('ignores events when the active tab is a text diff', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.tabGroups.activeTabGroup = {
			activeTab: {
				input: new TabInputTextDiff(Uri.file('/a.md'), Uri.file('/a.md')),
			},
		} as any;
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		const editor = createTextEditor('/a.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.commands.executeCommand).not.toHaveBeenCalled();
		expect(__mocks.tabGroups.close).toHaveBeenCalledTimes(1);
	});

	it('skips close when closePreviewOnNonMarkdown is false', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: false,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		const nonMd = createTextEditor('/b.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(nonMd);
		expect(__mocks.tabGroups.close).not.toHaveBeenCalled();
	});

	it('reopens preview for different markdown document', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		// existing preview
		setCurrentPreviewUri(Uri.file('/a.md'));
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		const editor = createTextEditor('/b.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('markdown.showPreviewToSide');
	});

	it('moves editor to primary when force is true and viewColumn is secondary', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;

		const editor = createTextEditor('/c.md', 'markdown', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(editor);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.moveEditorToFirstGroup');
	});

	it('exits early when adjusting focus is true', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const editor = createTextEditor('/d.md', 'markdown', ViewColumn.One);
		__setAdjustingFocusForTest(true);
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.commands.executeCommand).not.toHaveBeenCalled();
		__setAdjustingFocusForTest(false);
	});

	it('exits when editor is undefined', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		await __handleActiveEditorChangeForTest(undefined);
		expect(__mocks.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('does not lock when preview tab is missing', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const editor = createTextEditor('/e.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('workbench.action.lockEditorGroup');
	});

	it('unlocks state when preview tab is missing on non-markdown close', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		setPreviewLocked(true);
		const nonMd = createTextEditor('/f.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(nonMd);
		expect(getPreviewState().isPreviewLocked).toBe(false);
	});

	it('handles non-markdown tab inputs without markdown preview gracefully', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: { viewType: 'custom.unknown' } }],
				viewColumn: undefined,
			},
		] as any;
		const nonMd = createTextEditor('/g.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(nonMd);
		expect(__mocks.tabGroups.close).toHaveBeenCalledTimes(0);
	});

	it('unlocks with preview tab but undefined viewColumn (no focus command)', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: undefined,
			},
		] as any;
		setPreviewLocked(true);
		const nonMd = createTextEditor('/h.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(nonMd);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		// Without a focus command for the preview group, we avoid unlocking an arbitrary group.
		expect(executed).not.toContain('workbench.action.unlockEditorGroup');
	});

	it('restores focus to previously active editor after lock/unlock flows', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		// lock path
		__mocks.window.activeTextEditor = createTextEditor('/active.ts', 'typescript', ViewColumn.One);
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputWebview('vscode.markdown.preview.editor') }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		const editor = createTextEditor('/i.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.window.showTextDocument).toHaveBeenCalled();

		// unlock path
		setPreviewLocked(true);
		__mocks.window.activeTextEditor = createTextEditor('/active2.ts', 'typescript', ViewColumn.One);
		const nonMd = createTextEditor('/j.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(nonMd);
		expect(__mocks.window.showTextDocument).toHaveBeenCalled();
	});

	it('allows user-driven non-markdown split to stay on the right when preview group is not targeted', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		// No preview tab; user intentionally opened non-markdown on column two.
		// Mark previous active column as primary to simulate explicit split.
		resetAllState();
		setLastActiveColumn(ViewColumn.One);
		setLastNonMarkdownPlacement(Uri.file('/user.ts'), ViewColumn.One);
		const nonMd = createTextEditor('/user.ts', 'typescript', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(nonMd);
		// Should not move back to first group (no move command).
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('workbench.action.moveEditorToFirstGroup');
	});

	it('reuses existing right-side non-markdown tab instead of opening a new left tab', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
	const nonMdRight = createTextEditor('/existing.ts', 'typescript', ViewColumn.Two);
	__mocks.tabGroups.all = [
		{
			tabs: [{ input: new TabInputText(Uri.file('/existing.ts')) }],
			viewColumn: ViewColumn.Two,
		},
	] as any;
		// Mark as previously split to right.
		setLastNonMarkdownPlacement(Uri.file('/existing.ts'), ViewColumn.Two);
		setLastActiveColumn(ViewColumn.One);
		setLastActiveKind('non-markdown');

		await __handleActiveEditorChangeForTest(nonMdRight);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('workbench.action.moveEditorToFirstGroup');
	});

	it('keeps explicit split when returning focus to right-side tab of the same document', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		const uri = Uri.file('/split.ts');
		// Prime state to mark user split for this document.
		resetAllState();
		setLastActiveKind('non-markdown');
		setLastActiveColumn(ViewColumn.One);
		setLastNonMarkdownPlacement(uri, ViewColumn.One);
		const splitEditor = createTextEditor('/split.ts', 'typescript', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(splitEditor);

		// Left and right tabs exist; focus moves to another file on the left.
		__mocks.tabGroups.all = [
			{
				tabs: [{ input: new TabInputText(uri) }],
				viewColumn: ViewColumn.One,
			},
			{
				tabs: [{ input: new TabInputText(uri) }],
				viewColumn: ViewColumn.Two,
			},
		] as any;
		const other = createTextEditor('/other.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(other);

		// Return focus to the right-side tab; should not be moved back left.
		__mocks.commands.executeCommand.mockClear();
		const backToRight = createTextEditor('/split.ts', 'typescript', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(backToRight);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).not.toContain('workbench.action.moveEditorToFirstGroup');

		// Activate the left tab (e.g., after attempting to close right). Should allow staying on left without reopening right.
		__mocks.commands.executeCommand.mockClear();
		const backToLeft = createTextEditor('/split.ts', 'typescript', ViewColumn.One);
		await __handleActiveEditorChangeForTest(backToLeft);
		const executedLeft = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executedLeft).not.toContain('workbench.action.focusSecondEditorGroup');
	});

	it('forgets right split tracking after the document is closed', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		// Mark prior activity so the first right-side open is treated as a user split.
		setLastActiveKind('non-markdown');
		setLastActiveColumn(ViewColumn.One);
		setLastNonMarkdownPlacement(Uri.file('/forget.ts'), ViewColumn.One);
		const rightNonMd = createTextEditor('/forget.ts', 'typescript', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(rightNonMd);

		// Close the document to clear user split tracking.
		__mocks.commands.executeCommand.mockClear();
		__handleDocumentCloseForTest(rightNonMd.document as any);

		// Next open from explorer on the right should be moved to primary because split memory was cleared.
		setLastActiveKind('markdown');
		setLastActiveColumn(ViewColumn.One);
		const reopened = createTextEditor('/forget.ts', 'typescript', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(reopened);

		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.moveEditorToFirstGroup');
	});

	it('resets split allowance after returning to markdown so explorer opens non-markdown on the left', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		// Simulate prior non-markdown activity on left.
		setLastNonMarkdownPlacement(Uri.file('/old.ts'), ViewColumn.One);
		setLastActiveColumn(ViewColumn.One);
		setLastActiveKind('non-markdown');

		// Open markdown to reset last active column.
		const md = createTextEditor('/reset.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(md);

		// Explorer-like open of non-markdown on the right should move back to primary.
		const nonMd = createTextEditor('/explorer.ts', 'typescript', ViewColumn.Two);
		await __handleActiveEditorChangeForTest(nonMd);
		const executed = __mocks.commands.executeCommand.mock.calls.map((c) => c[0]);
		expect(executed).toContain('workbench.action.moveEditorToFirstGroup');
	});

	it('halts behavior when workspace is untrusted', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.workspace.isTrusted = false;
		const editor = createTextEditor('/k.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.commands.executeCommand).not.toHaveBeenCalled();
		expect(__mocks.window.showWarningMessage).toHaveBeenCalledTimes(1);
	});

	it('logs and continues when command execution fails', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
		__mocks.commands.executeCommand.mockRejectedValueOnce(new Error('fail command'));
		const editor = createTextEditor('/l.md', 'markdown', ViewColumn.One);
		await __handleActiveEditorChangeForTest(editor);
		expect(__mocks.commands.executeCommand).toHaveBeenCalled();
	});
});
