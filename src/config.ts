import * as vscode from 'vscode';

export type AutoMdPreviewConfig = {
	enableAutoPreview: boolean;
	closePreviewOnNonMarkdown: boolean;
	alwaysOpenInPrimaryEditor: boolean;
};

export const DEFAULT_CONFIG: AutoMdPreviewConfig = {
	enableAutoPreview: true,
	closePreviewOnNonMarkdown: true,
	alwaysOpenInPrimaryEditor: true,
};


const read = <T>(
	config: vscode.WorkspaceConfiguration,
	key: keyof AutoMdPreviewConfig,
	defaultValue: T,
): T => {
	const value = config.get(key);
	if (typeof value === typeof defaultValue) {
		return value as T;
	}
	console.warn(`[auto-markdown-preview-lock] Invalid config for ${key}, falling back to default ${defaultValue}`);
	return defaultValue;
};

export const getAutoMdPreviewConfig = (): AutoMdPreviewConfig => {
	const config = vscode.workspace.getConfiguration('autoMdPreview');
	return {
		enableAutoPreview: read<boolean>(config, 'enableAutoPreview', DEFAULT_CONFIG.enableAutoPreview),
		closePreviewOnNonMarkdown: read<boolean>(config, 'closePreviewOnNonMarkdown', DEFAULT_CONFIG.closePreviewOnNonMarkdown),
		alwaysOpenInPrimaryEditor: read<boolean>(
			config,
			'alwaysOpenInPrimaryEditor',
			DEFAULT_CONFIG.alwaysOpenInPrimaryEditor,
		),
	};
};
