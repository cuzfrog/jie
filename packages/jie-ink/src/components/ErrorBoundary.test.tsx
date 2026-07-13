import process from 'node:process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {useEffect} from 'react';
import stripAnsi from 'strip-ansi';
import {render, useStdin, Text} from '../index.js';
import createStdout from '../../test/helpers/create-stdout.js';

// Resolve this test file's path relative to the monorepo root so the test is
// portable regardless of where it lives in the monorepo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../../../..');
const testRelDir = path.relative(monorepoRoot, __dirname);
const testPath = `${testRelDir}/ErrorBoundary.test.tsx:20:13`;

test('catch and display error', () => {
	const stdout = createStdout();

	const Test = () => {
		throw new Error('Oh no');
	};

	render(<Test />, {stdout});

	const writes: string[] = (stdout.write as any)
		.mock.calls.map((c: any) => c[0] as string)
		.filter(
			(w: string) =>
				!w.startsWith('[?25') && !w.startsWith('[?2026'),
		);
	const lastContentWrite = writes.at(-1)!;

	expect(stripAnsi(lastContentWrite).split('\n').slice(0, 14)).toEqual([
		'',
		'  ERROR  Oh no',
		'',
		` ${testPath}`,
		'',
		' 17:   const stdout = createStdout();',
		' 18:',
		' 19:   const Test = () => {',
		" 20:     throw new Error('Oh no');",
		' 21:   };',
		' 22:',
		' 23:   render(<Test />, {stdout});',
		'',
		` - <anonymous> (${testPath})`,
	]);
});

test(
	'does not emit unhandledRejection when render exits with an error and waitUntilExit is unused',
	async () => {
		const stdout = createStdout();
		const unhandledRejectionReasons: unknown[] = [];
		const onUnhandledRejection = (reason: unknown) => {
			unhandledRejectionReasons.push(reason);
		};

		process.on('unhandledRejection', onUnhandledRejection);

		try {
			const Test = () => {
				throw new Error('Oh no');
			};

			render(<Test />, {stdout});

			await new Promise<void>(resolve => {
				setImmediate(resolve);
			});
			await new Promise<void>(resolve => {
				setImmediate(resolve);
			});

			expect(unhandledRejectionReasons.length).toBe(0);
		} finally {
			process.off('unhandledRejection', onUnhandledRejection);
		}
	},
);

test('ErrorBoundary catches and displays nested component errors', () => {
	const stdout = createStdout();

	const NestedComponent = () => {
		throw new Error('Nested component error');
	};

	function Parent() {
		return (
			<Text>
				Before error
				<NestedComponent />
			</Text>
		);
	}

	render(<Parent />, {stdout});

	const writes: string[] = (stdout.write as any)
		.mock.calls.map((c: any) => c[0] as string)
		.filter(
			(w: string) =>
				!w.startsWith('[?25') && !w.startsWith('[?2026'),
		);
	const lastContentWrite = writes.at(-1)!;
	const output = stripAnsi(lastContentWrite);
	expect(output).toContain('ERROR');
	expect(output).toContain('Nested component error');
});

test('clean up raw mode when error is thrown', async () => {
	const stdout = createStdout();

	// Track setRawMode calls
	const setRawModeCalls: boolean[] = [];
	const originalSetRawMode = process.stdin.setRawMode?.bind(process.stdin);

	// Only run this test if raw mode is supported
	if (!process.stdin.isTTY) {
		return;
	}

	process.stdin.setRawMode = (mode: boolean) => {
		setRawModeCalls.push(mode);

		return originalSetRawMode?.(mode) ?? process.stdin;
	};

	function Test() {
		const {setRawMode} = useStdin();

		useEffect(() => {
			setRawMode(true);
			// Throw after enabling raw mode
			throw new Error('Error after raw mode enabled');
		}, [setRawMode]);

		return <Text>Test</Text>;
	}

	const app = render(<Test />, {stdout});

	await expect(app.waitUntilExit()).rejects.toThrow();

	// Restore original setRawMode
	if (originalSetRawMode) {
		process.stdin.setRawMode = originalSetRawMode;
	}

	// Verify raw mode was enabled then disabled
	expect(setRawModeCalls).toContain(true);
	expect(setRawModeCalls).toContain(false);
});
