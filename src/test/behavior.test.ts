import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('vscode', async () => await import('./vscodeMock'));
import { __handleActiveEditorChangeForTest, __setAdjustingFocusForTest } from '../extension';
import { resetMocks, setConfigValues, __mocks, ViewColumn, TabInputWebview, Uri } from './vscodeMock';
import { resetAllState, setPreviewLocked, setCurrentPreviewUri, getPreviewState } from '../state';

const createTextEditor = (uriPath: string, languageId: string, viewColumn = ViewColumn.One) =>
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
		__setAdjustingFocusForTest(false);
	});

	it('opens preview and locks group for markdown when enabled', async () => {
		setConfigValues({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
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
		expect(executed).toContain('workbench.action.unlockEditorGroup');
		expect(executed).not.toContain('workbench.action.focusFirstEditorGroup');
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
