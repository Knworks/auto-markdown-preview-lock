import { vi } from 'vitest';

export const commands = {
	executeCommand: vi.fn(),
};

export const tabGroups = {
	all: [] as any[],
	close: vi.fn(),
	activeTabGroup: undefined as any,
};

export const window = {
	tabGroups,
	activeTextEditor: undefined as any,
	showWarningMessage: vi.fn(),
	showTextDocument: vi.fn(async (document: any, options?: any) => ({
		document,
		viewColumn: options?.viewColumn ?? 1,
	})),
	onDidChangeActiveTextEditor: vi.fn(),
};

export const workspace = {
	isTrusted: true,
	getConfiguration: vi.fn(() => ({
		get: (_key: string) => undefined,
	})),
};

export const ViewColumn = {
	One: 1,
	Two: 2,
	Three: 3,
	Four: 4,
	Five: 5,
	Six: 6,
	Seven: 7,
	Eight: 8,
	Nine: 9,
} as const;

export class TabInputWebview {
	constructor(public viewType: string) {}
}

export const Uri = {
	file: (path: string) =>
		({
			fsPath: path,
			toString: () => path,
		}) as any,
};

export const __mocks = {
	commands,
	window,
	workspace,
	tabGroups,
};

export const resetMocks = () => {
	commands.executeCommand.mockReset();
	tabGroups.all = [];
	tabGroups.close.mockReset();
	window.activeTextEditor = undefined;
	window.showTextDocument.mockReset();
	window.onDidChangeActiveTextEditor.mockReset();
	window.showWarningMessage.mockReset();
	workspace.getConfiguration.mockReset();
	workspace.isTrusted = true;
};

export const setConfigValues = (values: Record<string, unknown>) => {
	workspace.getConfiguration.mockReturnValue({
		get: (key: string) => values[key],
	});
};

export default {
	commands,
	window,
	workspace,
	Uri,
	TabInputWebview,
	ViewColumn,
};
