import * as path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'bdd',
		color: true,
		timeout: 10000,
	});

	const testsRoot = path.resolve(__dirname, './cases');

	mocha.addFile(path.resolve(testsRoot, 'previewFlow.integration.js'));

	return new Promise((resolve, reject) => {
		try {
			mocha.run((failures) => {
				if (failures > 0) {
					reject(new Error(`${failures} tests failed.`));
				} else {
					resolve();
				}
			});
		} catch (err) {
			reject(err);
		}
	});
}
