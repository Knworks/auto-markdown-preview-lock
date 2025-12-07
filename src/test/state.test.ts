import * as assert from 'assert';
import {
	getPreviewState,
	resetAllState,
	resetPreviewState,
	setCurrentPreviewUri,
	setLastActiveKind,
	setPreviewLocked,
} from '../state';
import * as vscode from 'vscode';

suite('state management', () => {
	setup(() => {
		resetAllState();
	});

	test('initial state is defaults', () => {
		const state = getPreviewState();
		assert.strictEqual(state.currentPreviewUri, undefined);
		assert.strictEqual(state.lastActiveKind, 'non-markdown');
		assert.strictEqual(state.isPreviewLocked, false);
	});

	test('sets preview uri and locked flag', () => {
		const uri = vscode.Uri.file('/tmp/example.md');
		setCurrentPreviewUri(uri);
		setPreviewLocked(true);
		const state = getPreviewState();
		assert.strictEqual(state.currentPreviewUri?.fsPath, uri.fsPath);
		assert.strictEqual(state.isPreviewLocked, true);
	});

	test('resetPreviewState clears preview but keeps lastActiveKind', () => {
		setLastActiveKind('markdown');
		setCurrentPreviewUri(vscode.Uri.file('/tmp/example.md'));
		setPreviewLocked(true);

		resetPreviewState();
		const state = getPreviewState();
		assert.strictEqual(state.currentPreviewUri, undefined);
		assert.strictEqual(state.isPreviewLocked, false);
		assert.strictEqual(state.lastActiveKind, 'markdown');
	});

	test('resetAllState resets everything', () => {
		setLastActiveKind('markdown');
		setCurrentPreviewUri(vscode.Uri.file('/tmp/example.md'));
		setPreviewLocked(true);

		resetAllState();
		const state = getPreviewState();
		assert.strictEqual(state.currentPreviewUri, undefined);
		assert.strictEqual(state.isPreviewLocked, false);
		assert.strictEqual(state.lastActiveKind, 'non-markdown');
	});
});
