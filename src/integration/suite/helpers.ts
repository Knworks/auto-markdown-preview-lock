import * as path from 'path';
import * as vscode from 'vscode';

export const workspaceFile = (fileName: string): vscode.Uri => {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		throw new Error('Workspace folder is not available for integration tests.');
	}
	return vscode.Uri.joinPath(folder.uri, fileName);
};

export const openDocument = async (
	fileName: string,
	viewColumn: vscode.ViewColumn = vscode.ViewColumn.One,
): Promise<vscode.TextEditor> => {
	const uri = workspaceFile(fileName);
	const document = await vscode.workspace.openTextDocument(uri);
	return vscode.window.showTextDocument(document, {
		viewColumn,
		preserveFocus: false,
		preview: false,
	});
};

export const findPreviewTabs = (): Array<{ tab: vscode.Tab; group: vscode.TabGroup }> => {
	const previews: Array<{ tab: vscode.Tab; group: vscode.TabGroup }> = [];
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			if (tab.input instanceof vscode.TabInputWebview && tab.input.viewType.toLowerCase().includes('markdown.preview')) {
				previews.push({ tab, group });
			}
		}
	}
	return previews;
};

export const previewLabels = (): string[] => {
	return findPreviewTabs().map((entry) => entry.tab.label);
};

export const waitFor = async (predicate: () => boolean, timeoutMs = 500, intervalMs = 50): Promise<void> => {
	const start = Date.now();
	while (true) {
		if (predicate()) {
			return;
		}
		if (Date.now() - start > timeoutMs) {
			throw new Error('Condition was not met within the expected time.');
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
};

export const resetWorkspaceView = async (): Promise<void> => {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	await vscode.commands.executeCommand('workbench.action.joinAllGroups');
};

export const setWorkspaceConfig = async (key: string, value: unknown): Promise<void> => {
	const config = vscode.workspace.getConfiguration('autoMdPreview');
	await config.update(key, value, vscode.ConfigurationTarget.Workspace);
};
