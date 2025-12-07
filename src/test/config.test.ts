import * as assert from 'assert';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG, getAutoMdPreviewConfig } from '../config';

const withMockConfiguration = (values: Record<string, unknown>, fn: () => void): void => {
	const original = vscode.workspace.getConfiguration;
	(vscode.workspace as unknown as { getConfiguration: () => unknown }).getConfiguration = () => ({
		get: (key: string) => values[key],
	});
	try {
		fn();
	} finally {
		(vscode.workspace as unknown as { getConfiguration: () => unknown }).getConfiguration = original;
	}
};

suite('config getAutoMdPreviewConfig', () => {
	test('returns defaults when config is empty', () => {
		withMockConfiguration({}, () => {
			const config = getAutoMdPreviewConfig();
			assert.deepStrictEqual(config, DEFAULT_CONFIG);
		});
	});

	test('respects boolean overrides', () => {
		withMockConfiguration(
			{
				enableAutoPreview: false,
				closePreviewOnNonMarkdown: false,
				alwaysOpenInPrimaryEditor: false,
			},
			() => {
				const config = getAutoMdPreviewConfig();
				assert.deepStrictEqual(config, {
					enableAutoPreview: false,
					closePreviewOnNonMarkdown: false,
					alwaysOpenInPrimaryEditor: false,
				});
			},
		);
	});

	test('falls back to defaults on invalid values', () => {
		withMockConfiguration(
			{
				enableAutoPreview: 'yes',
				alwaysOpenInPrimaryEditor: 'no',
			},
			() => {
				const config = getAutoMdPreviewConfig();
				assert.deepStrictEqual(config, {
					enableAutoPreview: true,
					closePreviewOnNonMarkdown: true,
					alwaysOpenInPrimaryEditor: true,
				});
			},
		);
	});
});
