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

	it('keeps Settings focused while the markdown preview group is active', async () => {
		await openDocument('one.md', vscode.ViewColumn.One);
		await waitFor(() => findPreviewTabs().length === 1, 1000);

		await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
		await waitFor(
			() => vscode.window.tabGroups.activeTabGroup?.viewColumn === vscode.ViewColumn.Two,
			1000,
		);
		await vscode.commands.executeCommand('workbench.action.openSettings');
		await waitFor(
			() =>
				vscode.window.tabGroups.all.some((group) =>
					group.tabs.some((tab) => tab.label === 'Settings'),
				),
			1500,
		);
		await sleep(500);

		const settingsEntry = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs.map((tab) => ({ group, tab })))
			.find(({ tab }) => tab.label === 'Settings');
		assert.ok(settingsEntry, 'Settings tab should be open');
		assert.strictEqual(
			settingsEntry.group.viewColumn,
			vscode.ViewColumn.Two,
			'Settings should remain in the preview group',
		);
		assert.strictEqual(
			vscode.window.tabGroups.activeTabGroup?.viewColumn,
			vscode.ViewColumn.Two,
			'Settings should remain the active editor group',
		);
		assert.strictEqual(
			vscode.window.tabGroups.activeTabGroup?.activeTab?.label,
			'Settings',
			'Settings should remain the active tab',
		);
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

	it('closes the markdown source together with the preview after switching to non-markdown', async () => {
		await setWorkspaceConfig('closePreviewOnNonMarkdown', false);
		await openDocument('chapter.md', vscode.ViewColumn.One);
		await waitFor(() => previewLabels().some((label) => label.includes('chapter.md')), 800);

		await openDocument('example.py', vscode.ViewColumn.One);
		await waitFor(() => vscode.window.activeTextEditor?.document.fileName.endsWith('example.py') === true, 800);
		assert.strictEqual(findPreviewTabs().length, 1, 'preview should remain while a non-markdown editor is active');

		const chapterTab = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.find(
				(tab) =>
					tab.input instanceof vscode.TabInputText &&
					tab.input.uri.fsPath.endsWith('chapter.md'),
			);
		assert.ok(chapterTab, 'chapter.md tab should be open before closing it');

		await vscode.window.tabGroups.close(chapterTab, true);
		await waitFor(
			() =>
				findPreviewTabs().length === 0 &&
				!vscode.window.tabGroups.all
					.flatMap((group) => group.tabs)
					.some(
						(tab) =>
							tab.input instanceof vscode.TabInputText &&
							tab.input.uri.fsPath.endsWith('chapter.md'),
					),
			800,
		);
		assert.ok(
			vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.some(
					(tab) =>
						tab.input instanceof vscode.TabInputText &&
						tab.input.uri.fsPath.endsWith('example.py'),
				),
			'example.py tab should remain open',
		);
	});

	it('closes the markdown source together with its preview when it is the only text editor', async () => {
		await setWorkspaceConfig('closePreviewOnNonMarkdown', true);
		await openDocument('chapter.md', vscode.ViewColumn.One);
		await waitFor(() => previewLabels().some((label) => label.includes('chapter.md')), 800);

		const chapterTab = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.find(
				(tab) =>
					tab.input instanceof vscode.TabInputText &&
					tab.input.uri.fsPath.endsWith('chapter.md'),
			);
		assert.ok(chapterTab, 'chapter.md tab should be open before closing it');

		await waitFor(
			() => vscode.window.activeTextEditor?.document.fileName.endsWith('chapter.md') === true,
			800,
		);
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await waitFor(
			() =>
				findPreviewTabs().length === 0 &&
				!vscode.window.tabGroups.all
					.flatMap((group) => group.tabs)
					.some(
						(tab) =>
							tab.input instanceof vscode.TabInputText &&
							tab.input.uri.fsPath.endsWith('chapter.md'),
					),
			800,
		);
		await sleep(500);
		assert.strictEqual(findPreviewTabs().length, 0, 'preview should stay closed after the source close settles');
		assert.ok(
			!vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.some(
					(tab) =>
						tab.input instanceof vscode.TabInputText &&
						tab.input.uri.fsPath.endsWith('chapter.md'),
				),
			'chapter.md should stay closed after the source close settles',
		);
	});

	it('closes the markdown source together with its preview when closePreviewOnNonMarkdown is false and it is the only text editor', async () => {
		await setWorkspaceConfig('closePreviewOnNonMarkdown', false);
		await openDocument('chapter.md', vscode.ViewColumn.One);
		await waitFor(() => previewLabels().some((label) => label.includes('chapter.md')), 800);
		assert.strictEqual(findPreviewTabs().length, 1, 'exactly one preview should be open before closing the source');

		const chapterTab = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.find(
				(tab) =>
					tab.input instanceof vscode.TabInputText &&
					tab.input.uri.fsPath.endsWith('chapter.md'),
			);
		assert.ok(chapterTab, 'chapter.md tab should be open before closing it');

		await waitFor(
			() => vscode.window.activeTextEditor?.document.fileName.endsWith('chapter.md') === true,
			800,
		);
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await waitFor(
			() =>
				findPreviewTabs().length === 0 &&
				!vscode.window.tabGroups.all
					.flatMap((group) => group.tabs)
					.some(
						(tab) =>
							tab.input instanceof vscode.TabInputText &&
							tab.input.uri.fsPath.endsWith('chapter.md'),
					),
			800,
		);
		await sleep(500);
		assert.strictEqual(findPreviewTabs().length, 0, 'preview should stay closed after the source close settles');
		assert.ok(
			!vscode.window.tabGroups.all
				.flatMap((group) => group.tabs)
				.some(
					(tab) =>
						tab.input instanceof vscode.TabInputText &&
						tab.input.uri.fsPath.endsWith('chapter.md'),
				),
			'chapter.md should stay closed after the source close settles',
		);
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
		// Start from a ready preview. Initial WebView creation is covered separately above;
		// this case verifies that two user switches while a preview already exists stay deduplicated.
		await openDocument('one.md', vscode.ViewColumn.One);
		await waitFor(() => previewLabels().some((label) => label.includes('one.md')), 1200);
		await openDocument('two.md', vscode.ViewColumn.One);
		await openDocument('one.md', vscode.ViewColumn.One);

		await waitFor(() => previewLabels().some((label) => label.includes('one.md')), 1200);
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
		await waitFor(() => vscode.window.activeTextEditor?.viewColumn === vscode.ViewColumn.One, 800);
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
		await waitFor(() => vscode.window.activeTextEditor?.viewColumn === vscode.ViewColumn.One, 800);
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
