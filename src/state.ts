import * as vscode from 'vscode';

export type LastActiveKind = 'markdown' | 'non-markdown';

export type PreviewState = {
	currentPreviewUri?: vscode.Uri;
	lastActiveKind: LastActiveKind;
	lastActiveColumn?: vscode.ViewColumn;
	lastNonMarkdownUri?: vscode.Uri;
	lastNonMarkdownColumn?: vscode.ViewColumn;
	isPreviewLocked: boolean;
	lockedPreviewGroupViewColumn?: vscode.ViewColumn;
	lastPreviewGroupViewColumn?: vscode.ViewColumn;
	isSplitMode: boolean;
	splitPinnedRightUri?: vscode.Uri;
	suppressAutoPreviewUri?: vscode.Uri;
};

const defaultState: PreviewState = {
	currentPreviewUri: undefined,
	lastActiveKind: 'non-markdown',
	lastActiveColumn: undefined,
	lastNonMarkdownUri: undefined,
	lastNonMarkdownColumn: undefined,
	isPreviewLocked: false,
	lockedPreviewGroupViewColumn: undefined,
	lastPreviewGroupViewColumn: undefined,
	isSplitMode: false,
	splitPinnedRightUri: undefined,
	suppressAutoPreviewUri: undefined,
};

let state: PreviewState = { ...defaultState };

export const getPreviewState = (): PreviewState => state;

export const setCurrentPreviewUri = (uri: vscode.Uri | undefined): void => {
	state = { ...state, currentPreviewUri: uri };
};

export const setLastActiveKind = (kind: LastActiveKind): void => {
	state = { ...state, lastActiveKind: kind };
};

export const setLastActiveColumn = (column: vscode.ViewColumn | undefined): void => {
	state = { ...state, lastActiveColumn: column };
};

export const setLastNonMarkdownPlacement = (uri: vscode.Uri | undefined, column: vscode.ViewColumn | undefined): void => {
	state = { ...state, lastNonMarkdownUri: uri, lastNonMarkdownColumn: column };
};

export const setPreviewLocked = (locked: boolean): void => {
	state = {
		...state,
		isPreviewLocked: locked,
		lockedPreviewGroupViewColumn: locked ? state.lockedPreviewGroupViewColumn : undefined,
	};
};

export const setLockedPreviewGroupViewColumn = (column: vscode.ViewColumn | undefined): void => {
	state = { ...state, lockedPreviewGroupViewColumn: column };
};

export const setLastPreviewGroupViewColumn = (column: vscode.ViewColumn | undefined): void => {
	state = { ...state, lastPreviewGroupViewColumn: column };
};

export const setSplitMode = (isSplitMode: boolean): void => {
	state = { ...state, isSplitMode };
};

export const setSplitPinnedRightUri = (uri: vscode.Uri | undefined): void => {
	state = { ...state, splitPinnedRightUri: uri };
};

export const setSuppressAutoPreviewUri = (uri: vscode.Uri | undefined): void => {
	state = { ...state, suppressAutoPreviewUri: uri };
};

export const resetPreviewState = (): void => {
	state = {
		...state,
		currentPreviewUri: undefined,
		lastActiveColumn: undefined,
		lastNonMarkdownUri: undefined,
		lastNonMarkdownColumn: undefined,
		isPreviewLocked: false,
		lockedPreviewGroupViewColumn: undefined,
		lastPreviewGroupViewColumn: undefined,
	};
};

export const resetAllState = (): void => {
	state = { ...defaultState };
};
