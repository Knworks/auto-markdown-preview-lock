import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('vscode', async () => await import('./vscodeMock'));
import {
	getPreviewState,
	resetAllState,
	resetPreviewState,
	setCurrentPreviewUri,
	setLastActiveKind,
	setPreviewLocked,
} from '../state';

const uri = (path: string) => ({ fsPath: path, toString: () => path } as any);

describe('state management', () => {
	beforeEach(() => {
		resetAllState();
	});

	it('initial state is defaults', () => {
		const state = getPreviewState();
		expect(state.currentPreviewUri).toBeUndefined();
		expect(state.lastActiveKind).toBe('non-markdown');
		expect(state.isPreviewLocked).toBe(false);
	});

	it('sets preview uri and locked flag', () => {
		setCurrentPreviewUri(uri('/tmp/example.md'));
		setPreviewLocked(true);
		const state = getPreviewState();
		expect(state.currentPreviewUri?.fsPath).toBe('/tmp/example.md');
		expect(state.isPreviewLocked).toBe(true);
	});

	it('resetPreviewState clears preview but keeps lastActiveKind', () => {
		setLastActiveKind('markdown');
		setCurrentPreviewUri(uri('/tmp/example.md'));
		setPreviewLocked(true);

		resetPreviewState();
		const state = getPreviewState();
		expect(state.currentPreviewUri).toBeUndefined();
		expect(state.isPreviewLocked).toBe(false);
		expect(state.lastActiveKind).toBe('markdown');
	});

	it('resetAllState resets everything', () => {
		setLastActiveKind('markdown');
		setCurrentPreviewUri(uri('/tmp/example.md'));
		setPreviewLocked(true);

		resetAllState();
		const state = getPreviewState();
		expect(state.currentPreviewUri).toBeUndefined();
		expect(state.isPreviewLocked).toBe(false);
		expect(state.lastActiveKind).toBe('non-markdown');
	});
});
