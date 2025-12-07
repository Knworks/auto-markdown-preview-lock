import * as assert from 'assert';
import * as vscode from 'vscode';
import { findPreviewTabs, openDocument, previewLabels, resetWorkspaceView, setWorkspaceConfig, waitFor } from '../helpers';

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
});
