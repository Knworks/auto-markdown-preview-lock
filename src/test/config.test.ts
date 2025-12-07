import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('vscode', async () => await import('./vscodeMock'));
import { DEFAULT_CONFIG, getAutoMdPreviewConfig } from '../config';
import { resetMocks, setConfigValues, workspace } from './vscodeMock';

describe('config getAutoMdPreviewConfig', () => {
	beforeEach(() => {
		resetMocks();
	});

	it('returns defaults when config is empty', () => {
		setConfigValues({});
		const config = getAutoMdPreviewConfig();
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it('respects boolean overrides', () => {
		setConfigValues({
			enableAutoPreview: false,
			closePreviewOnNonMarkdown: false,
			alwaysOpenInPrimaryEditor: false,
		});
		const config = getAutoMdPreviewConfig();
		expect(config).toEqual({
			enableAutoPreview: false,
			closePreviewOnNonMarkdown: false,
			alwaysOpenInPrimaryEditor: false,
		});
	});

	it('falls back to defaults on invalid values', () => {
		setConfigValues({
			enableAutoPreview: 'yes',
			alwaysOpenInPrimaryEditor: 'no',
		});
		const config = getAutoMdPreviewConfig();
		expect(config).toEqual({
			enableAutoPreview: true,
			closePreviewOnNonMarkdown: true,
			alwaysOpenInPrimaryEditor: true,
		});
	});
});
