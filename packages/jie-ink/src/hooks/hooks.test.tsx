import stripAnsi from 'strip-ansi';
import term from '../../test/helpers/term.js';

test.skip('useInput - ignore input if not active (PTY)', async () => {
	const ps = term('use-input-multiple');
	ps.write('x');
	await ps.waitForExit();
	expect(ps.output).not.toContain('xx');
	expect(ps.output).toContain('x');
	expect(ps.output).toContain('exited');
});

// For some reason this test is flaky, so we have to resort to retrying it up to 3 times.
test.skip(
	'useInput - handle Ctrl+C when `exitOnCtrlC` is `false` (PTY)',
	async () => {
		const run = async () => {
			const ps = term('use-input-ctrl-c');
			ps.write('');
			await ps.waitForExit();
			expect(ps.output).toContain('exited');
		};

		let lastError: unknown;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				await run();
				lastError = undefined;
				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (lastError) throw lastError;
	},
);

test.skip(
	'useInput - no MaxListenersExceededWarning with many useInput hooks (PTY)',
	async () => {
		const ps = term('use-input-many');
		await ps.waitForExit();
		expect(ps.output).not.toContain('MaxListenersExceededWarning');
		expect(ps.output).toContain('exited');
	},
);

test.skip(
	'useInput - handle Ctrl+C via kitty codepoint-3 form when `exitOnCtrlC` is `false` (PTY)',
	async () => {
		const run = async () => {
			const ps = term('use-input-ctrl-c');
			// Ctrl+C via kitty codepoint 3 form (modifier 5 = ctrl(4) + 1)
			ps.write('[3;5u');
			await ps.waitForExit();
			expect(ps.output).toContain('exited');
		};

		let lastError: unknown;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				await run();
				lastError = undefined;
				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (lastError) throw lastError;
	},
);

test.skip('useStdout - write to stdout (PTY)', async () => {
	const ps = term('use-stdout');
	await ps.waitForExit();

	const lines = stripAnsi(ps.output).split('\r\n');

	expect(lines.slice(1, -1)).toEqual([
		'Hello from Ink to stdout',
		'Hello World',
		'exited',
	]);
});

// `node-pty` doesn't support streaming stderr output, so I need to figure out
// how to test useStderr() hook. child_process.spawn() can't be used, because
// Ink fails with "raw mode unsupported" error.
test.todo('useStderr - write to stderr', () => {});
