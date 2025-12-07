import * as vscode from 'vscode';

export type LastActiveKind = 'markdown' | 'non-markdown';

export type PreviewState = {
	currentPreviewUri?: vscode.Uri;
	lastActiveKind: LastActiveKind;
	isPreviewLocked: boolean;
};

const defaultState: PreviewState = {
	currentPreviewUri: undefined,
	lastActiveKind: 'non-markdown',
	isPreviewLocked: false,
};

let state: PreviewState = { ...defaultState };

export const getPreviewState = (): PreviewState => state;

export const setCurrentPreviewUri = (uri: vscode.Uri | undefined): void => {
	state = { ...state, currentPreviewUri: uri };
};

export const setLastActiveKind = (kind: LastActiveKind): void => {
	state = { ...state, lastActiveKind: kind };
};

export const setPreviewLocked = (locked: boolean): void => {
	state = { ...state, isPreviewLocked: locked };
};

export const resetPreviewState = (): void => {
	state = { ...state, currentPreviewUri: undefined, isPreviewLocked: false };
};

export const resetAllState = (): void => {
	state = { ...defaultState };
};
