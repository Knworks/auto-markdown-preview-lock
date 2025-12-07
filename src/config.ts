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

const readBoolean = (
	config: vscode.WorkspaceConfiguration,
	key: keyof AutoMdPreviewConfig,
	defaultValue: boolean,
): boolean => {
	const value = config.get(key);
	if (typeof value === 'boolean') {
		return value;
	}
	console.warn(`[auto-markdown-preview-lock] Invalid config for ${key}, falling back to default ${defaultValue}`);
	return defaultValue;
};

export const getAutoMdPreviewConfig = (): AutoMdPreviewConfig => {
	const config = vscode.workspace.getConfiguration('autoMdPreview');
	return {
		enableAutoPreview: readBoolean(config, 'enableAutoPreview', DEFAULT_CONFIG.enableAutoPreview),
		closePreviewOnNonMarkdown: readBoolean(config, 'closePreviewOnNonMarkdown', DEFAULT_CONFIG.closePreviewOnNonMarkdown),
		alwaysOpenInPrimaryEditor: readBoolean(
			config,
			'alwaysOpenInPrimaryEditor',
			DEFAULT_CONFIG.alwaysOpenInPrimaryEditor,
		),
	};
};
