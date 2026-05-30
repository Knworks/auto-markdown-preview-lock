import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	findPreviewTabs,
	hasTextEditorInColumn,
	openDocument,
	previewLabels,
	resetWorkspaceView,
	setWorkspaceConfig,
	sleep,
	waitFor,
} from '../helpers';

describe('Integration | Auto Markdown Preview Lock', () => {
	before(async () => {
		await resetWorkspaceView();
	});

	after(async () => {
		await resetWorkspaceView();
		await setWorkspaceConfig('enableAutoPreview', undefined);
		await setWorkspaceConfig('alwaysOpenInPrimaryEditor', undefined);
		await setWorkspaceConfig('closePreviewOnNonMarkdown', undefined);
	});

	beforeEach(async () => {
		await resetWorkspaceView();
		await setWorkspaceConfig('enableAutoPreview', true);
		await setWorkspaceConfig('alwaysOpenInPrimaryEditor', true);
		await setWorkspaceConfig('closePreviewOnNonMarkdown', true);
	});

	it('follows markdown switches and closes on non-markdown', async () => {
		await openDocument('one.md', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 1, 800);
		assert.ok(previewLabels().some((label) => label.includes('one.md')), 'preview should follow first markdown');

		await openDocument('two.md', vscode.ViewColumn.One);
		await waitFor(() => previewLabels().some((label) => label.includes('two.md')), 800);
		assert.strictEqual(findPreviewTabs().length, 1, 'only one preview tab should remain after switching markdown files');
		assert.ok(previewLabels().every((label) => label.includes('two.md')), 'preview should update to the second markdown');

		await openDocument('plain.txt', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 0, 800);
		assert.ok(vscode.window.tabGroups.all.length <= 2, 'preview close should not create extra groups');
	});

	it('differs when alwaysOpenInPrimaryEditor is disabled with right-side focus', async () => {
		// Lock ON (default): active editor should move back to the primary group.
		await setWorkspaceConfig('alwaysOpenInPrimaryEditor', true);
		await openDocument('one.md', vscode.ViewColumn.Two);
		await waitFor(() => findPreviewTabs().length === 1, 800);
		assert.ok(vscode.window.tabGroups.all.length <= 2, 'lock on should avoid cascading groups');

		// Lock OFF: keep focus on the right group, allowing the preview to open relative to it.
		await resetWorkspaceView();
		await setWorkspaceConfig('alwaysOpenInPrimaryEditor', false);
		await openDocument('two.md', vscode.ViewColumn.Two);
		await waitFor(() => findPreviewTabs().length === 1, 800);
		assert.ok(vscode.window.tabGroups.all.length >= 2, 'lock off should keep the right group available');
	});

	it('continues running even if preview command fails', async () => {
		await resetWorkspaceView();
		const originalExecuteCommand = vscode.commands.executeCommand;
		(vscode.commands as any).executeCommand = (async (command: string, ...args: unknown[]) => {
			if (command === 'markdown.showPreviewToSide') {
				throw new Error('forced preview failure');
			}
			return originalExecuteCommand.apply(vscode.commands, [command, ...args]);
		}) as typeof vscode.commands.executeCommand;

		try {
			await openDocument('one.md', vscode.ViewColumn.One);
			// The preview command fails; ensure the editor remains usable.
			await openDocument('plain.txt', vscode.ViewColumn.One);
			await waitFor(() => vscode.window.activeTextEditor?.document.languageId === 'plaintext', 400);
		} finally {
			(vscode.commands as any).executeCommand = originalExecuteCommand;
		}

		// After restoring the command, preview should work again.
		await setWorkspaceConfig('alwaysOpenInPrimaryEditor', true);
		await openDocument('two.md', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 1, 800);
	});

	// --- rapid-switching regression tests ---

	it('handles md switch during initial preview cold-start without stray editors', async () => {
		// Open one.md then immediately open two.md before the WebView finishes loading.
		// The extension should queue the second event and process it after the first completes.
		await openDocument('one.md', vscode.ViewColumn.One);
		await openDocument('two.md', vscode.ViewColumn.One);

		await waitFor(() => previewLabels().some((l) => l.includes('two.md')), 1200);
		assert.strictEqual(findPreviewTabs().length, 1, 'only one preview tab should exist after cold-start switch');
		assert.ok(previewLabels().some((l) => l.includes('two.md')), 'preview should follow two.md after the queued switch');
		assert.ok(!hasTextEditorInColumn(vscode.ViewColumn.Two), 'Col2 should not have a stray text editor after cold-start switch');
	});

	it('does not create duplicate previews during rapid md→md→md switching', async () => {
		await openDocument('one.md', vscode.ViewColumn.One);
		await sleep(100);
		await openDocument('two.md', vscode.ViewColumn.One);
		await sleep(100);
		await openDocument('one.md', vscode.ViewColumn.One);

		await waitFor(() => previewLabels().some((l) => l.includes('one.md')), 1200);
		assert.strictEqual(findPreviewTabs().length, 1, 'only one preview tab should exist after rapid md→md→md switching');
		assert.ok(!hasTextEditorInColumn(vscode.ViewColumn.Two), 'Col2 should not have a stray text editor after rapid md switching');
	});

	it('recovers correctly from rapid md→non-md→md switching', async () => {
		// Stabilise with one.md, then rapidly switch through plain.txt to two.md.
		// The intermediate non-markdown should not leave a stray editor in Col2.
		await openDocument('one.md', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 1, 800);

		await openDocument('plain.txt', vscode.ViewColumn.One);
		await sleep(50);
		await openDocument('two.md', vscode.ViewColumn.One);

		await waitFor(() => previewLabels().some((l) => l.includes('two.md')), 1200);
		assert.strictEqual(findPreviewTabs().length, 1, 'only one preview tab should exist after rapid md→non-md→md');
		assert.strictEqual(
			vscode.window.activeTextEditor?.viewColumn,
			vscode.ViewColumn.One,
			'active text editor should be in Col1 after rapid switching',
		);
		assert.ok(!hasTextEditorInColumn(vscode.ViewColumn.Two), 'Col2 should not have a stray text editor after md→non-md→md');
	});

	it('opens preview when switching from non-markdown to markdown', async () => {
		await openDocument('plain.txt', vscode.ViewColumn.One);
		await sleep(300);
		await openDocument('one.md', vscode.ViewColumn.One);

		await waitFor(() => findPreviewTabs().length === 1, 800);
		assert.ok(previewLabels().some((l) => l.includes('one.md')), 'preview should open for one.md when switching from non-markdown');
		assert.strictEqual(
			vscode.window.activeTextEditor?.viewColumn,
			vscode.ViewColumn.One,
			'text editor should remain in Col1 after non-md→md switch',
		);
		assert.ok(!hasTextEditorInColumn(vscode.ViewColumn.Two), 'Col2 should not have a stray text editor after non-md→md switch');
	});

	it('closes preview correctly after rapid four-way switching ending on non-markdown', async () => {
		// Sequence: one.md → plain.txt → two.md → plain.txt
		// Only the last event (plain.txt) should determine the final state.
		await openDocument('one.md', vscode.ViewColumn.One);
		await sleep(100);
		await openDocument('plain.txt', vscode.ViewColumn.One);
		await sleep(100);
		await openDocument('two.md', vscode.ViewColumn.One);
		await sleep(100);
		await openDocument('plain.txt', vscode.ViewColumn.One);

		await waitFor(() => findPreviewTabs().length === 0, 1200);
		assert.strictEqual(findPreviewTabs().length, 0, 'preview should be closed when the sequence ends on non-markdown');
		assert.ok(
			vscode.window.tabGroups.all.every((g) => !g.tabs.some((t) => t.input instanceof vscode.TabInputWebview)),
			'no WebView tab should remain after four-way rapid switching ending on non-markdown',
		);
	});

	it('opens preview normally after Close All', async () => {
		// Stabilise with one.md then simulate a user "Close All Editors" action.
		await openDocument('one.md', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 1, 800);

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await sleep(300);

		await openDocument('two.md', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 1, 1000);
		assert.ok(previewLabels().some((l) => l.includes('two.md')), 'preview should open normally for two.md after Close All');
		assert.ok(!hasTextEditorInColumn(vscode.ViewColumn.Two), 'Col2 should not have a stray text editor after Close All recovery');
	});

	it('opens preview correctly after exiting split mode', async () => {
		// Establish split mode: plain.txt on the left, sample.ts on the right.
		await openDocument('plain.txt', vscode.ViewColumn.One);
		await openDocument('sample.ts', vscode.ViewColumn.Two);
		await sleep(400);

		// Close the right-side tab to exit split mode; wait for the splitExitTimer (150 ms).
		const col2Group = vscode.window.tabGroups.all.find(
			(g) => (g.viewColumn as vscode.ViewColumn | undefined) === vscode.ViewColumn.Two,
		);
		if (col2Group && col2Group.tabs.length > 0) {
			await vscode.window.tabGroups.close(col2Group.tabs[0], true);
		}
		await sleep(400);

		// Opening a markdown file should trigger the normal preview flow without stray editors.
		await openDocument('one.md', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 1, 1000);
		assert.ok(previewLabels().some((l) => l.includes('one.md')), 'preview should show one.md after split mode exit');
		assert.ok(!hasTextEditorInColumn(vscode.ViewColumn.Two), 'Col2 should not have a stray text editor after split mode exit');
	});
});
