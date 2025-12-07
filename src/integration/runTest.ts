import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');
		const extensionTestsPath = path.resolve(__dirname, './suite/index');
		const workspacePath = path.resolve(__dirname, '../../src/integration/fixtures/workspace');

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [workspacePath, '--disable-extensions'],
		});
	} catch (error) {
		console.error('Failed to run integration tests', error);
		process.exit(1);
	}
}

void main();
