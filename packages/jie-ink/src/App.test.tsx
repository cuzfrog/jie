import process from 'node:process';
import * as path from 'node:path';
import url from 'node:url';
import {createRequire} from 'node:module';

import stripAnsi from 'strip-ansi';
import {run} from '../test/helpers/run.js';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const {spawn} = require('node-pty') as typeof import('node-pty');

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

test.skip('exit normally without unmount() or exit()', async () => {
	const output = await run('exit-normally');
	expect(output.includes('exited')).toBe(true);
});

test.skip('exit on unmount()', async () => {
	const output = await run('exit-on-unmount');
	expect(output.includes('exited')).toBe(true);
});

test.skip('exit when app finishes execution', async () => {
	const ps = run('exit-on-finish');
	await ps;
});

test.skip('exit on exit()', async () => {
	const output = await run('exit-on-exit');
	expect(output.includes('exited')).toBe(true);
});

test.skip('exit on exit() with error', async () => {
	const output = await run('exit-on-exit-with-error');
	expect(output.includes('errored')).toBe(true);
});

test.skip('exit on exit() with error with value property', async () => {
	const output = await run('exit-on-exit-with-error-value-property');
	expect(output.includes('errored')).toBe(true);
});

test.skip('exit on exit() with result value', async () => {
	const output = await run('exit-on-exit-with-result');
	expect(output.includes('result:hello from ink')).toBe(true);
});

test.skip('exit on exit() with object result', async () => {
	const output = await run('exit-on-exit-with-value-object');
	expect(output.includes('result:hello from ink object')).toBe(true);
});

test.skip('exit on exit() with raw mode', async () => {
	const output = await run('exit-raw-on-exit');
	expect(output.includes('exited')).toBe(true);
});

test.skip('exit on exit() with raw mode with error', async () => {
	const output = await run('exit-raw-on-exit-with-error');
	expect(output.includes('errored')).toBe(true);
});

test.skip('exit on unmount() with raw mode', async () => {
	const output = await run('exit-raw-on-unmount');
	expect(output.includes('exited')).toBe(true);
});

test.skip('exit with thrown error', async () => {
	const output = await run('exit-with-thrown-error');
	expect(output.includes('errored')).toBe(true);
});

test.skip('don’t exit while raw mode is active', async () => {
	await new Promise<void>((resolve, reject) => {
		const env: Record<string, string> = {
			...process.env,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			NODE_NO_WARNINGS: '1',
		};

		const term = spawn(
			'node',
			[
				'--import=tsx',
				path.join(__dirname, './fixtures/exit-double-raw-mode.tsx'),
			],
			{
				name: 'xterm-color',
				cols: 100,
				cwd: __dirname,
				env,
			},
		);

		let output = '';

		term.onData(data => {
			if (data === 's') {
				setTimeout(() => {
					expect(isExited).toBe(false);
					term.write('q');
				}, 500);

				setTimeout(() => {
					term.kill();
					reject(new Error('Test timed out - process did not exit in time'));
				}, 2000);
			} else {
				output += data;
			}
		});

		let isExited = false;

		term.onExit(({exitCode}) => {
			isExited = true;

			if (exitCode === 0) {
				expect(output.includes('exited')).toBe(true);
				resolve();
				return;
			}

			reject(new Error(`Process exited with code ${exitCode}`));
		});
	});
});

test.skip('exit when DEV is set', async () => {
	const output = await run('exit-normally', {
		env: {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			DEV: 'true',
		},
	});
	// Warning output depends on whether a local React DevTools server is running.
	expect(output.includes('exited')).toBe(true);
});

test.skip('exit on exit() with error and static output', async () => {
	const output = await run('exit-with-static');
	// Error is propagated, not swallowed
	expect(output.includes('errored')).toBe(true);
	// Static items rendered
	expect(output.includes('A')).toBe(true);
	expect(output.includes('B')).toBe(true);
	expect(output.includes('C')).toBe(true);
	// Static items NOT duplicated (the bug from #397)
	const cleaned = stripAnsi(output);
	expect(cleaned.split('A').length - 1).toBe(1);
});
