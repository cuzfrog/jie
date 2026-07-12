import process from 'node:process';
import vm from 'node:vm';
import {spawn as spawnProcess} from 'node:child_process';
import {PassThrough, Writable} from 'node:stream';
import url from 'node:url';
import * as path from 'node:path';
import {createRequire} from 'node:module';

import React, {
	type ReactElement,
	type ReactNode,
	PureComponent,
	useEffect,
	useState,
} from 'react';
import ansiEscapes from 'ansi-escapes';
import stripAnsi from 'strip-ansi';
import boxen from 'boxen';
import delay from 'delay';
import {render, Box, Text, useApp, useCursor, useInput} from './index.js';
import {type RenderMetrics} from './ink.js';
import {bsu, esu} from './write-synchronized.js';
import {createStdin, emitReadable} from '../test/helpers/create-stdin.js';
import createStdout from '../test/helpers/create-stdout.js';

const textDecoder = new TextDecoder();

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const {spawn} = require('node-pty') as typeof import('node-pty');

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const term = (fixture: string, args: string[] = []) => {
	let resolve: (value?: unknown) => void;
	let reject: (error: Error) => void;

	const exitPromise = new Promise((resolve2, reject2) => {
		resolve = resolve2;
		reject = reject2;
	});

	const env = {
		...process.env,
		// eslint-disable-next-line @typescript-eslint/naming-convention
		NODE_NO_WARNINGS: '1',
	};

	const ps = spawn(
		'node',
		[
			'--import=tsx',
			path.join(__dirname, `./fixtures/${fixture}.tsx`),
			...args,
		],
		{
			name: 'xterm-color',
			cols: 100,
			cwd: __dirname,
			env,
		},
	);

	const result = {
		write(input: string) {
			ps.write(input);
		},
		output: '',
		waitForExit: async () => exitPromise,
	};

	ps.onData(data => {
		// Strip Synchronized Update Mode sequences (bsu/esu) so tests
		// only see the actual content, not the transport wrapper.
		result.output += data
			.replaceAll('\u001B[?2026h', '')
			.replaceAll('\u001B[?2026l', '');
	});

	ps.onExit(({exitCode}) => {
		if (exitCode === 0) {
			resolve();
			return;
		}

		reject(new Error(`Process exited with non-zero exit code: ${exitCode}`));
	});

	return result;
};

const countOccurrences = (text: string, searchValue: string): number => {
	if (searchValue === '') {
		return 0;
	}

	return text.split(searchValue).length - 1;
};

const isWriteBarrierChunk = (chunk: string | Uint8Array): boolean =>
	(typeof chunk === 'string' && chunk === '') ||
	(chunk instanceof Uint8Array && chunk.length === 0);

const toRenderedChunk = (chunk: string | Uint8Array): string =>
	stripAnsi(typeof chunk === 'string' ? chunk : textDecoder.decode(chunk));

const isCursorOrSyncEscape = (chunk: string | Uint8Array): boolean => {
	const str = typeof chunk === 'string' ? chunk : textDecoder.decode(chunk);
	return str.startsWith('\u001B[?25') || str === bsu || str === esu;
};

const isRenderContent = (chunk: string | Uint8Array): boolean =>
	!isWriteBarrierChunk(chunk) && !isCursorOrSyncEscape(chunk);

const getContentWrites = (writeSpy: any): string[] =>
	(writeSpy.mock.calls as string[][])
		.map((args: string[]) => args[0]!)
		.filter((w: string) => isRenderContent(w));

const createDelayedWriteCallbackStdout = ({
	shouldDelay,
	onDelayElapsed,
	delayMs = 150,
}: {
	readonly shouldDelay: (chunk: string | Uint8Array) => boolean;
	readonly onDelayElapsed: () => void;
	readonly delayMs?: number;
}): NodeJS.WriteStream => {
	let didDelayOnce = false;

	const stdout = new Writable({
		write(
			chunk: string | Uint8Array,
			_encoding: BufferEncoding,
			callback: (error?: Error) => void,
		) {
			if (!didDelayOnce && shouldDelay(chunk)) {
				didDelayOnce = true;

				setTimeout(() => {
					onDelayElapsed();
					callback();
				}, delayMs);

				return;
			}

			callback();
		},
	}) as unknown as NodeJS.WriteStream;

	stdout.columns = 100;
	stdout.isTTY = true;
	return stdout;
};

type Issue450Fixture =
	| 'issue-450-full-height-rerender'
	| 'issue-450-full-height-rerender-with-marker'
	| 'issue-450-height-minus-one-rerender'
	| 'issue-450-full-height-with-static-rerender'
	| 'issue-450-initial-overflow'
	| 'issue-450-initial-fullscreen'
	| 'issue-450-grow-to-fullscreen-rerender'
	| 'issue-450-shrink-from-fullscreen-rerender'
	| 'issue-450-shrink-from-overflow-rerender'
	| 'issue-450-static-shrink-from-fullscreen-rerender'
	| 'issue-969-windows-full-height-rerender';

const runIssue450Fixture = async (
	fixture: Issue450Fixture,
	rows = 6,
): Promise<string> => {
	const processResult = term(fixture, [String(rows)]);
	await processResult.waitForExit();
	return processResult.output;
};

const runNonTtyFixture = async (
	fixture: string,
	args: string[] = [],
): Promise<string> => {
	let output = '';
	let errorOutput = '';
	const env: Record<string, string> = {
		...process.env,
		// eslint-disable-next-line @typescript-eslint/naming-convention
		NODE_NO_WARNINGS: '1',
	};
	// Force non-CI code path while still using a non-TTY stdout stream.
	env.CI = 'false';

	const fixtureProcess = spawnProcess(
		'node',
		[
			'--import=tsx',
			path.join(__dirname, `./fixtures/${fixture}.tsx`),
			...args,
		],
		{
			cwd: __dirname,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);

	fixtureProcess.stdout.on('data', (data: Uint8Array | string) => {
		output += typeof data === 'string' ? data : data.toString();
	});

	fixtureProcess.stderr.on('data', (data: Uint8Array | string) => {
		errorOutput += typeof data === 'string' ? data : data.toString();
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		fixtureProcess.on('error', reject);
		fixtureProcess.on('close', code => {
			resolve(code ?? 0);
		});
	});

	if (exitCode !== 0) {
		throw new Error(
			`Non-TTY fixture exited with code ${exitCode}: ${errorOutput}`,
		);
	}

	return output;
};

type Issue450FixtureResult = {
	output: string;
	clearTerminalCount: number;
	eraseLineCount: number;
};

const getIssue450ControlSequenceCounts = (output: string) => ({
	clearTerminalCount: countOccurrences(output, ansiEscapes.clearTerminal),
	eraseLineCount: countOccurrences(output, ansiEscapes.eraseLines(1)),
});

const runIssue450FixtureWithCounts = async (
	fixture: Issue450Fixture,
	rows = 6,
): Promise<Issue450FixtureResult> => {
	const output = await runIssue450Fixture(fixture, rows);
	const {clearTerminalCount, eraseLineCount} =
		getIssue450ControlSequenceCounts(output);

	return {
		output,
		clearTerminalCount,
		eraseLineCount,
	};
};

const getOutputBeforeMarker = (
		output: string,
	marker: string,
): string => {
	const markerIndex = output.indexOf(marker);
	expect(markerIndex >= 0).toBe(true);
	return markerIndex >= 0 ? output.slice(0, markerIndex) : output;
};

const runIssue450FixtureBeforeMarker = async (
		fixture: Issue450Fixture,
	marker: string,
	rows = 6,
): Promise<string> => {
	const output = await runIssue450Fixture(fixture, rows);
	return getOutputBeforeMarker(output, marker);
};

const assertIssue450DynamicFrameOutput = (
		output: string,
): void => {
	expect(output.includes('frame 8')).toBe(true);
};

class SynchronousErrorBoundary extends PureComponent<
	{
		onError: (error: Error) => void;
		children?: ReactElement;
	},
	{error?: Error}
> {
	static displayName = 'SynchronousErrorBoundary';

	static getDerivedStateFromError(error: Error) {
		return {error};
	}

	override state: {error?: Error} = {
		error: undefined,
	};

	override componentDidCatch(error: Error) {
		this.props.onError(error);
	}

	override render() {
		if (this.state.error) {
			return null;
		}

		return this.props.children;
	}
}

function SynchronousRenderErrorComponent(): React.ReactElement {
	throw new Error('Synchronous render error');
}

function ThrowingComponentWithBoundary() {
	const {exit} = useApp();

	return (
		<SynchronousErrorBoundary onError={exit}>
			<SynchronousRenderErrorComponent />
		</SynchronousErrorBoundary>
	);
}

test.skip('do not erase screen (PTY)', async () => {
	const ps = term('erase', ['4']);
	await ps.waitForExit();
	expect(ps.output.includes(ansiEscapes.clearTerminal)).toBe(false);

	for (const letter of ['A', 'B', 'C']) {
		expect(ps.output.includes(letter)).toBe(true);
	}
});

test.skip(
	'do not erase screen where <Static> is taller than viewport', async () => {
		const ps = term('erase-with-static', ['4']);

		await ps.waitForExit();
		expect(ps.output.includes(ansiEscapes.clearTerminal)).toBe(false);

		for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
			expect(ps.output.includes(letter)).toBe(true);
		}
	},
);

test.skip('erase screen (PTY)', async () => {
	const ps = term('erase', ['3']);
	await ps.waitForExit();
	expect(ps.output.includes(ansiEscapes.clearTerminal)).toBe(true);

	for (const letter of ['A', 'B', 'C']) {
		expect(ps.output.includes(letter)).toBe(true);
	}
});

test.skip(
	'erase screen where <Static> exists but interactive part is taller than viewport', async () => {
		const ps = term('erase', ['3']);
		await ps.waitForExit();
		expect(ps.output.includes(ansiEscapes.clearTerminal)).toBe(true);

		for (const letter of ['A', 'B', 'C']) {
			expect(ps.output.includes(letter)).toBe(true);
		}
	},
);

test.skip('erase screen where state changes (PTY)', async () => {
	const ps = term('erase-with-state-change', ['4']);
	await ps.waitForExit();

	// The final frame is between the last eraseLines sequence and cursorShow
	// Split on cursorShow to isolate the final rendered content before the cursor is shown
	const beforeCursorShow = ps.output.split(ansiEscapes.cursorShow)[0];
	if (!beforeCursorShow) {
		throw new Error('beforeCursorShow is undefined');
	}

	// Find the last occurrence of an eraseLines sequence
	// eraseLines(1) is the minimal erase pattern used by Ink
	const eraseLinesPattern = ansiEscapes.eraseLines(1);
	const lastEraseIndex = beforeCursorShow.lastIndexOf(eraseLinesPattern);

	const lastFrame =
		lastEraseIndex === -1
			? beforeCursorShow
			: beforeCursorShow.slice(lastEraseIndex + eraseLinesPattern.length);

	const lastFrameContent = stripAnsi(lastFrame);

	for (const letter of ['A', 'B', 'C']) {
		expect(lastFrameContent.includes(letter)).toBe(false);
	}
});

test.skip(
	'erase screen where state changes in small viewport', async () => {
	const ps = term('erase-with-state-change', ['3']);
	await ps.waitForExit();

	const frames = ps.output.split(ansiEscapes.clearTerminal);
	const lastFrame = frames.at(-1);

	for (const letter of ['A', 'B', 'C']) {
		expect(lastFrame?.includes(letter)).toBe(false);
	}
});

test.skip(
	'fullscreen mode should not add extra newline at the bottom', async () => {
		const ps = term('fullscreen-no-extra-newline', ['5']);
		await ps.waitForExit();

		expect(ps.output.includes('Bottom line')).toBe(true);

		const lastFrame = ps.output.split(ansiEscapes.clearTerminal).at(-1) ?? '';

		// Check that the bottom line is at the end without extra newlines
		// In a 5-line terminal:
		// Line 1: Fullscreen: top
		// Lines 2-4: empty (from flexGrow)
		// Line 5: Bottom line (should be usable)
		const lines = lastFrame.split('\n');

		expect(lines.length, 'Should have exactly 5 lines for 5-row terminal').toBe(5);

		expect(			lines[4]?.includes('Bottom line') ?? false,
			'Bottom line should be on line 5',
		);
	},
);

test.skip(
	'#442: full terminal-size box should not add an extra scroll line', async () => {
		const rows = 5;
		const ps = term('issue-442-full-height', [String(rows)]);
		await ps.waitForExit();

		const lastFrame = ps.output.split(ansiEscapes.clearTerminal).at(-1) ?? '';
		const lastFrameContent = stripAnsi(lastFrame);
		const lines = lastFrameContent.split('\n');

		expect(			lastFrameContent.endsWith('\n'),
			'Should not end with a trailing newline in fullscreen mode',
).toBe(false);
		expect(			lines.length,
'Should render exactly terminal row count without an extra line').toBe(rows);
		expect(lines.at(-1)?.includes('#442 bottom') ?? false).toBe(true);
	},
);

test.skip(
	'#450: full-height rerenders should not repeatedly clear terminal', async () => {
		const {output, clearTerminalCount, eraseLineCount} =
			await runIssue450FixtureWithCounts('issue-450-full-height-rerender');

		assertIssue450DynamicFrameOutput(output);
		expect(			clearTerminalCount <= 1,
			`Expected at most one clearTerminal sequence, received ${clearTerminalCount}`,
).toBe(true);
		expect(			eraseLineCount > 0,
			'Expected incremental erase sequences for fullscreen rerenders',
).toBe(true);
	},
);

test.skip(
	'#969: full-height rerenders on Windows should clear terminal between frames', async () => {
		const output = await runIssue450Fixture(
			'issue-969-windows-full-height-rerender',
		);

		assertIssue450DynamicFrameOutput(output);
		// Windows consoles scroll when the bottom-right cell is written, which
		// breaks incremental erase for fullscreen frames. Each rerender must fall
		// back to a full clear there. The fixture process believes it is on
		// Windows, so ansi-escapes may emit its legacy clearTerminal variant
		// there (the host's os.release() decides), while this process resolves
		// the modern one. Count the eraseScreen prefix shared by both variants.
		const fullClearCount = countOccurrences(output, ansiEscapes.eraseScreen);
		expect(			fullClearCount >= 2,
			`Expected a full clear per fullscreen rerender, received ${fullClearCount}`,
).toBe(true);
	},
);

test.skip(
	'#450: initial overflowing frame should not clear terminal', async () => {
		const renderedMarker = '__INITIAL_OVERFLOW_FRAME_RENDERED__';
		const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
			'issue-450-initial-overflow',
			renderedMarker,
			3,
		);

		expect(			outputBeforeMarker.includes(ansiEscapes.clearTerminal),
			'Initial overflowing render should not clear terminal',
).toBe(false);
	},
);

test.skip(
	'#450: initial full-height frame should not clear terminal', async () => {
		const renderedMarker = '__INITIAL_FULLSCREEN_FRAME_RENDERED__';
		const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
			'issue-450-initial-fullscreen',
			renderedMarker,
			3,
		);

		expect(			outputBeforeMarker.includes(ansiEscapes.clearTerminal),
			'Initial full-height render should not clear terminal',
).toBe(false);
	},
);

test.skip(
	'#450 control: rows - 1 rerenders should avoid clearTerminal', async () => {
		const {output, clearTerminalCount, eraseLineCount} =
			await runIssue450FixtureWithCounts('issue-450-height-minus-one-rerender');

		assertIssue450DynamicFrameOutput(output);
		expect(clearTerminalCount).toBe(0);
		expect(			eraseLineCount > 0,
			'Expected incremental erase sequences for non-fullscreen rerenders',
).toBe(true);
	},
);

test.skip(
	'#450: full-height rerenders should not clear before unmount', async () => {
		const renderedMarker = '__FULL_HEIGHT_RERENDER_COMPLETED__';
		const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
			'issue-450-full-height-rerender-with-marker',
			renderedMarker,
		);
		const {clearTerminalCount} =
			getIssue450ControlSequenceCounts(outputBeforeMarker);

		assertIssue450DynamicFrameOutput(outputBeforeMarker);
		expect(clearTerminalCount).toBe(0);
	},
);

test.skip(
	'#450: grow from rows - 1 to full-height should not clear before unmount', async () => {
		const renderedMarker = '__GROW_TO_FULLSCREEN_RERENDER_COMPLETED__';
		const outputBeforeMarker = await runIssue450FixtureBeforeMarker(
			'issue-450-grow-to-fullscreen-rerender',
			renderedMarker,
		);
		const {clearTerminalCount} =
			getIssue450ControlSequenceCounts(outputBeforeMarker);

		assertIssue450DynamicFrameOutput(outputBeforeMarker);
		expect(clearTerminalCount).toBe(0);
	},
);

test.skip(
	'#450: shrink from full-height to rows - 1 should clear exactly once', async () => {
		const {output, clearTerminalCount} = await runIssue450FixtureWithCounts(
			'issue-450-shrink-from-fullscreen-rerender',
		);

		assertIssue450DynamicFrameOutput(output);
		expect(clearTerminalCount).toBe(1);
	},
);

test.skip(
	'#450: shrink from overflow to rows - 1 should clear exactly once', async () => {
		const {output, clearTerminalCount} = await runIssue450FixtureWithCounts(
			'issue-450-shrink-from-overflow-rerender',
		);

		assertIssue450DynamicFrameOutput(output);
		expect(clearTerminalCount).toBe(1);
	},
);

test.skip(
	'#450: <Static> with shrink from full-height should clear exactly once', async () => {
		const {output, clearTerminalCount} = await runIssue450FixtureWithCounts(
			'issue-450-static-shrink-from-fullscreen-rerender',
		);

		expect(output.includes('#450 static line')).toBe(true);
		assertIssue450DynamicFrameOutput(output);
		expect(clearTerminalCount).toBe(1);
	},
);

test.skip(
	'#450: non-TTY full-height rerenders should never clear terminal', () => {
		const rows = 6;
		const stdout = createStdout();
		stdout.rows = rows;
		const writes = captureWrites(stdout);

		function NonTtyRerenderTestComponent({
			frameCount,
		}: {
			readonly frameCount: number;
		}) {
			return (
				<Box height={rows} flexDirection="column">
					<Text>#450 top</Text>
					<Box flexGrow={1}>
						<Text>{`frame ${frameCount}`}</Text>
					</Box>
					<Text>#450 bottom</Text>
				</Box>
			);
		}

		const {rerender, unmount} = render(
			<NonTtyRerenderTestComponent frameCount={0} />,
			{stdout},
		);

		rerender(<NonTtyRerenderTestComponent frameCount={1} />);
		rerender(<NonTtyRerenderTestComponent frameCount={2} />);

		const {clearTerminalCount} = getIssue450ControlSequenceCounts(
			writes.join(''),
		);
		expect(clearTerminalCount).toBe(0);

		unmount();
	},
);

test.skip(
	'#450: non-TTY overflow transitions should never clear terminal', () => {
		const rows = 3;
		const stdout = createStdout();
		stdout.rows = rows;
		const writes = captureWrites(stdout);

		function NonTtyOverflowTransitionTestComponent({
			lineCount,
		}: {
			readonly lineCount: number;
		}) {
			const lines = [];
			for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
				lines.push(<Text key={lineNumber}>{`line ${lineNumber}`}</Text>);
			}

			return <Box flexDirection="column">{lines}</Box>;
		}

		const {rerender, unmount} = render(
			<NonTtyOverflowTransitionTestComponent lineCount={2} />,
			{stdout},
		);

		rerender(<NonTtyOverflowTransitionTestComponent lineCount={4} />);

		const {clearTerminalCount} = getIssue450ControlSequenceCounts(
			writes.join(''),
		);
		expect(clearTerminalCount).toBe(0);

		unmount();
	},
);

test.skip(
	'#450: viewport shrink into overflow should clear once', async () => {
		const rows = 6;
		const stdout = createTtyStdout();
		stdout.rows = rows;
		const writes = captureWrites(stdout);

		function ResizeBoundaryTestComponent() {
			return (
				<Box height={rows} flexDirection="column">
					<Text>#450 top</Text>
					<Box flexGrow={1}>
						<Text>#450 middle</Text>
					</Box>
					<Text>#450 bottom</Text>
				</Box>
			);
		}

		const {unmount} = render(<ResizeBoundaryTestComponent />, {stdout});

		writes.length = 0;
		stdout.rows = rows - 1;
		stdout.emit('resize');
		await delay(0);

		const {clearTerminalCount} = getIssue450ControlSequenceCounts(
			writes.join(''),
		);
		expect(clearTerminalCount).toBe(1);

		unmount();
	},
);

test.skip(
	'#450: non-TTY grow-to-overflow rerender should not clear terminal', async () => {
		const output = await runNonTtyFixture(
			'issue-450-grow-to-overflow-rerender',
			['3'],
		);
		expect(output.includes(ansiEscapes.clearTerminal)).toBe(false);
	},
);

test.skip(
	'#725: non-TTY child process output is flushed', async () => {
	const output = await runNonTtyFixture('issue-725-child-process');
	const plainOutput = stripAnsi(output);

	expect(plainOutput.includes('ready-stdin-not-tty')).toBe(true);
	expect(plainOutput.includes('exited')).toBe(true);
});

test.skip(
	'useAnimation can drive non-interactive process exit', async () => {
	const output = await runNonTtyFixture('use-animation-non-interactive-exit');

	expect(stripAnsi(output).includes('exited')).toBe(true);
});

test.skip(
	'useAnimation can drive explicitly non-interactive process exit', async () => {
		const output = await runNonTtyFixture(
			'use-animation-interactive-false-exit',
		);

		expect(stripAnsi(output).includes('exited')).toBe(true);
	},
);

test.skip(
	'#450: full-height rerenders with <Static> should not repeatedly clear terminal', async () => {
		const {output, clearTerminalCount, eraseLineCount} =
			await runIssue450FixtureWithCounts(
				'issue-450-full-height-with-static-rerender',
			);

		expect(			output.includes('#450 static line'),
			'Fixture should emit static output',
).toBe(true);
		assertIssue450DynamicFrameOutput(output);
		expect(			clearTerminalCount <= 1,
			`Expected at most one clearTerminal sequence, received ${clearTerminalCount}`,
).toBe(true);
		expect(			eraseLineCount > 0,
			'Expected incremental erase sequences for fullscreen rerenders',
).toBe(true);
	},
);

test.skip('clear output (PTY)', async () => {
	const ps = term('clear');
	await ps.waitForExit();

	const secondFrame = ps.output.split(ansiEscapes.eraseLines(4))[1];

	for (const letter of ['A', 'B', 'C']) {
		expect(secondFrame?.includes(letter)).toBe(false);
	}
});

test.skip(
	'intercept console methods and display result above output', async () => {
		const ps = term('console');
		await ps.waitForExit();

		const frames = ps.output.split(ansiEscapes.eraseLines(2)).map(line => {
			return stripAnsi(line);
		});

		expect(frames).toEqual([
			'Hello World\r\n',
			'First log\r\nHello World\r\nSecond log\r\n',
		]);
	},
);

test('rerender on resize', async () => {
	const stdout = createStdout(10);

	function Test() {
		return (
			<Box borderStyle="round">
				<Text>Test</Text>
			</Box>
		);
	}

	const {unmount} = render(<Test />, {stdout});

	const contentWrites = getContentWrites(stdout.write);
	expect(stripAnsi(contentWrites[0]!)).toBe(
		boxen('Test'.padEnd(8), {borderStyle: 'round'}) + '\n',
	);

	expect(stdout.listeners('resize').length).toBe(1);

	stdout.columns = 8;
	stdout.emit('resize');
	await delay(100);

	const contentWritesAfterResize = getContentWrites(stdout.write);
	expect(
		stripAnsi(contentWritesAfterResize.at(-1)!),
	).toBe(
		boxen('Test'.padEnd(6), {borderStyle: 'round'}) + '\n',
	);

	unmount();
	expect(stdout.listeners('resize').length).toBe(0);
});

function ThrottleTestComponent({text}: {readonly text: string}) {
	return <Text>{text}</Text>;
}

function ThrottleCursorTestComponent({text}: {readonly text: string}) {
	const {setCursorPosition} = useCursor();
	setCursorPosition({x: 0, y: 0});
	return <Text>{text}</Text>;
}

test('throttle renders to maxFps', () => {
	vi.useFakeTimers();
	try {
		const stdout = createStdout();

		const {unmount, rerender} = render(<ThrottleTestComponent text="Hello" />, {
			stdout,
			maxFps: 1, // 1 Hz => ~1000 ms window
		});

		// Initial render (leading call)
		expect(getContentWrites(stdout.write).length).toBe(1);
		expect(stripAnsi(getContentWrites(stdout.write)[0]!), 'Hello\n');

		// Trigger another render inside the throttle window
		rerender(<ThrottleTestComponent text="World" />);
		expect(getContentWrites(stdout.write).length).toBe(1);

		// Advance 999 ms: still within window, no trailing call yet
		vi.advanceTimersByTime(999);
		expect(getContentWrites(stdout.write).length).toBe(1);

		// Cross the boundary: trailing render fires once
		vi.advanceTimersByTime(1);
		expect(getContentWrites(stdout.write).length).toBe(2);
		expect(stripAnsi(getContentWrites(stdout.write)[1]!), 'World\n');

		unmount();
	} finally {
		vi.useRealTimers();
	}
});

test('outputs renderTime when onRender is passed', async () => {
	const renderTimes: number[] = [];
	const onRenderStub = vi.fn((metrics: RenderMetrics) => {
		renderTimes.push(metrics.renderTime);
	});

	function Test({children}: {readonly children?: ReactNode}) {
		const [text, setText] = useState('Test');

		useInput(input => {
			setText(input);
		});

		return (
			<Box borderStyle="round">
				<Text>{text}</Text>
				{children}
			</Box>
		);
	}

	const stdin = createStdin();
	const {unmount, rerender} = render(<Test />, {
		onRender: onRenderStub,
		stdin,
	});

	// Initial render
	expect(onRenderStub.mock.calls.length).toBe(1);
	expect(renderTimes[0] >= 0).toBe(true);

	// Manual rerender
	onRenderStub.mockClear();
	rerender(
		<Test>
			<Text>Updated</Text>
		</Test>,
	);
	await delay(100);
	expect(onRenderStub.mock.calls.length).toBe(1);
	expect(renderTimes[1] >= 0).toBe(true);

	// Internal state update via useInput
	onRenderStub.mockClear();
	emitReadable(stdin, 'a');
	await delay(100);
	expect(onRenderStub.mock.calls.length).toBe(1);
	expect(renderTimes[2] >= 0).toBe(true);

	// Verify all renders were tracked
	expect(renderTimes.length).toBe(3);

	unmount();
});

test('no throttled renders after unmount', () => {
	vi.useFakeTimers();
	try {
		const stdout = createStdout();

		const {unmount, rerender} = render(<ThrottleTestComponent text="Foo" />, {
			stdout,
		});

		expect(getContentWrites(stdout.write).length).toBe(1);

		rerender(<ThrottleTestComponent text="Bar" />);
		rerender(<ThrottleTestComponent text="Baz" />);
		unmount();

		const contentCountAfterUnmount = getContentWrites(stdout.write).length;

		// Regression test for https://github.com/vadimdemedes/ink/issues/692
		vi.advanceTimersByTime(1000);
		expect(getContentWrites(stdout.write).length).toBe(contentCountAfterUnmount);
	} finally {
		vi.useRealTimers();
	}
});

test('unmount forces pending throttled render', () => {
	vi.useFakeTimers();
	try {
		const stdout = createStdout();

		const {unmount, rerender} = render(<ThrottleTestComponent text="Hello" />, {
			stdout,
			maxFps: 1, // 1 Hz => ~1000 ms throttle window
		});

		// Initial render (leading call)
		expect(getContentWrites(stdout.write).length).toBe(1);
		expect(stripAnsi(getContentWrites(stdout.write)[0]!), 'Hello\n');

		// Trigger another render inside the throttle window
		rerender(<ThrottleTestComponent text="Final" />);
		// Not rendered yet due to throttling
		expect(getContentWrites(stdout.write).length).toBe(1);

		// Unmount should flush the pending render so the final frame is visible
		unmount();

		// The final frame should have been rendered
		const allContentWrites = getContentWrites(stdout.write).map((w: string) =>
			stripAnsi(w),
		);
		expect(allContentWrites.some((call: string) => call.includes('Final'))).toBe(true);
	} finally {
		vi.useRealTimers();
	}
});

test.skip(
	'should reject waitUntilExit when app exits during synchronous render error handling', async () => {
		const stdout = createStdout();
		const {waitUntilExit} = render(<ThrowingComponentWithBoundary />, {
			stdout,
			patchConsole: false,
		});

		await expect(Promise.race([
			waitUntilExit(),
			delay(500).then(() => {
				throw new Error('waitUntilExit did not settle');
			}),
		])).rejects.toThrow('Synchronous render error');
	},
);

test('waitUntilExit resolves after stdout write callback', async () => {
	let writeCallbackFired = false;

	const stdout = new Writable({
		write(_chunk, _encoding, callback) {
			setTimeout(() => {
				writeCallbackFired = true;
				callback();
			}, 150);
		},
	}) as unknown as NodeJS.WriteStream;

	stdout.columns = 100;

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {stdout});
	const exitPromise = waitUntilExit();

	unmount();
	await exitPromise;

	expect(writeCallbackFired).toBe(true);
});

test.skip(
	'createDelayedWriteCallbackStdout delays only the first matching chunk', async () => {
		let delayCount = 0;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return !isWriteBarrierChunk(chunk);
			},
			onDelayElapsed() {
				delayCount++;
			},
			delayMs: 80,
		});

		const writeChunk = async (chunk: string | Uint8Array): Promise<void> =>
			new Promise<void>(resolve => {
				stdout.write(chunk, () => {
					resolve();
				});
			});

		await writeChunk('');
		expect(delayCount).toBe(0);

		let didDelayedWriteResolve = false;
		const delayedWritePromise = (async () => {
			await writeChunk('Hello');
			didDelayedWriteResolve = true;
		})();

		await delay(20);
		expect(didDelayedWriteResolve).toBe(false);
		await delayedWritePromise;
		expect(delayCount).toBe(1);

		let didImmediateWriteResolve = false;
		const immediateWritePromise = (async () => {
			await writeChunk('World');
			didImmediateWriteResolve = true;
		})();

		await delay(0);
		expect(didImmediateWriteResolve).toBe(true);
		await immediateWritePromise;
		expect(delayCount).toBe(1);
	},
);

test.skip(
	'waitUntilRenderFlush resolves after stdout write callback', async () => {
		let didInitialWriteCallbackFire = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return !isWriteBarrierChunk(chunk);
			},
			onDelayElapsed() {
				didInitialWriteCallbackFire = true;
			},
		});

		const {unmount: _unmount, waitUntilExit: _waitUntilExit, waitUntilRenderFlush} = render(
			<Text>Hello</Text>,
			{
				stdout,
			},
		);

		
		await waitUntilRenderFlush();

		expect(didInitialWriteCallbackFire).toBe(true);
	},
);

test.skip(
	'waitUntilRenderFlush flushes pending throttled render', async () => {
		const stdout = createStdout();
		const {unmount: _unmount, rerender, waitUntilExit: _waitUntilExit, waitUntilRenderFlush} = render(
			<ThrottleTestComponent text="Hello" />,
			{
				stdout,
				maxFps: 1,
			},
		);


		expect(getContentWrites(stdout.write).length).toBe(1);

		rerender(<ThrottleTestComponent text="World" />);
		expect(getContentWrites(stdout.write).length).toBe(1);

		await waitUntilRenderFlush();

		expect(getContentWrites(stdout.write).length).toBe(2);
		expect(stripAnsi(getContentWrites(stdout.write)[1]!), 'World\n');
	},
);

test.skip(
	'waitUntilRenderFlush resolves when stdout is not writable', async () => {
		const stdout = createStdout();
		const {unmount: _unmount, rerender, waitUntilExit: _waitUntilExit, waitUntilRenderFlush} = render(
			<ThrottleTestComponent text="Hello" />,
			{
				stdout,
				maxFps: 1,
			},
		);


		expect(getContentWrites(stdout.write).length).toBe(1);

		rerender(<ThrottleTestComponent text="World" />);
		expect(getContentWrites(stdout.write).length).toBe(1);

		(stdout as NodeJS.WriteStream & {writable?: boolean}).writable = false;
		await waitUntilRenderFlush();

		expect(getContentWrites(stdout.write).length).toBe(1);
	},
);

test.skip(
	'waitUntilRenderFlush waits for rerender write callback', async () => {
		let didSecondWriteCallbackFire = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return (
					!isWriteBarrierChunk(chunk) &&
					toRenderedChunk(chunk).includes('World')
				);
			},
			onDelayElapsed() {
				didSecondWriteCallbackFire = true;
			},
		});

		const {unmount: _unmount, rerender, waitUntilExit: _waitUntilExit, waitUntilRenderFlush} = render(
			<Text>Hello</Text>,
			{stdout},
		);


		await waitUntilRenderFlush();
		rerender(<Text>World</Text>);
		await waitUntilRenderFlush();

		expect(didSecondWriteCallbackFire).toBe(true);
	},
);

test.skip(
	'waitUntilRenderFlush waits for concurrent rerender commit', async () => {
		let renderedOutput = '';

		const stdout = new Writable({
			write(
				chunk: string | Uint8Array,
				_encoding: BufferEncoding,
				callback: (error?: Error) => void,
			) {
				renderedOutput += toRenderedChunk(chunk);
				callback();
			},
		}) as unknown as NodeJS.WriteStream;

		stdout.columns = 100;
		stdout.isTTY = true;

		const {unmount: _unmount, rerender, waitUntilExit: _waitUntilExit, waitUntilRenderFlush} = render(
			<Text>Hello</Text>,
			{
				stdout,
				concurrent: true,
			},
		);

		
		await waitUntilRenderFlush();
		rerender(<Text>World</Text>);
		await waitUntilRenderFlush();

		expect(renderedOutput.includes('World')).toBe(true);
	},
);

test.skip(
	'waitUntilRenderFlush waits for all concurrent waiters on the same rerender', async () => {
		let didWorldWriteCallbackFire = false;
		let didAnyWaiterResolveBeforeWorldWriteCallback = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return (
					!isWriteBarrierChunk(chunk) &&
					toRenderedChunk(chunk).includes('World')
				);
			},
			onDelayElapsed() {
				didWorldWriteCallbackFire = true;
			},
		});

		const {unmount: _unmount, rerender, waitUntilExit: _waitUntilExit, waitUntilRenderFlush} = render(
			<Text>Hello</Text>,
			{stdout},
		);


		await waitUntilRenderFlush();
		rerender(<Text>World</Text>);

		const waitForFlush = async () => {
			await waitUntilRenderFlush();

			if (!didWorldWriteCallbackFire) {
				didAnyWaiterResolveBeforeWorldWriteCallback = true;
			}
		};

		await Promise.all([waitForFlush(), waitForFlush()]);

		expect(didWorldWriteCallbackFire).toBe(true);
		expect(didAnyWaiterResolveBeforeWorldWriteCallback).toBe(false);
	},
);

test.skip(
	'useApp waitUntilRenderFlush resolves after the first frame write callback', async () => {
		let didInitialWriteCallbackFire = false;
		let didWaitUntilRenderFlushResolve = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return !isWriteBarrierChunk(chunk);
			},
			onDelayElapsed() {
				didInitialWriteCallbackFire = true;
			},
		});

		function Test() {
			const {exit, waitUntilRenderFlush} = useApp();

			useEffect(() => {
				void (async () => {
					await waitUntilRenderFlush();
					didWaitUntilRenderFlushResolve = true;
					exit();
				})();
			}, [exit, waitUntilRenderFlush]);

			return <Text>Hello</Text>;
		}

		const {waitUntilExit} = render(<Test />, {stdout});
		await waitUntilExit();

		expect(didInitialWriteCallbackFire).toBe(true);
		expect(didWaitUntilRenderFlushResolve).toBe(true);
	},
);

test.skip(
	'useApp waitUntilRenderFlush waits for state update frame flush', async () => {
		let didWorldWriteCallbackFire = false;
		let didWaitUntilRenderFlushResolve = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return (
					!isWriteBarrierChunk(chunk) &&
					toRenderedChunk(chunk).includes('World')
				);
			},
			onDelayElapsed() {
				didWorldWriteCallbackFire = true;
			},
		});

		function Test() {
			const {exit, waitUntilRenderFlush} = useApp();
			const [text, setText] = useState('Hello');

			useEffect(() => {
				setText('World');
			}, []);

			useEffect(() => {
				if (text !== 'World') {
					return;
				}

				void (async () => {
					await waitUntilRenderFlush();
					didWaitUntilRenderFlushResolve = true;
					exit();
				})();
			}, [exit, text, waitUntilRenderFlush]);

			return <Text>{text}</Text>;
		}

		const {waitUntilExit} = render(<Test />, {stdout});
		await waitUntilExit();

		expect(didWorldWriteCallbackFire).toBe(true);
		expect(didWaitUntilRenderFlushResolve).toBe(true);
	},
);

test.skip(
	'useApp waitUntilRenderFlush waits for state update queued in same effect tick', async () => {
		let didWorldWriteCallbackFire = false;
		let didWaitUntilRenderFlushResolveBeforeWorldWrite = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return (
					!isWriteBarrierChunk(chunk) &&
					toRenderedChunk(chunk).includes('World')
				);
			},
			onDelayElapsed() {
				didWorldWriteCallbackFire = true;
			},
		});

		function Test() {
			const {exit, waitUntilRenderFlush} = useApp();
			const [text, setText] = useState('Hello');

			useEffect(() => {
				void (async () => {
					setText('World');
					await waitUntilRenderFlush();

					if (!didWorldWriteCallbackFire) {
						didWaitUntilRenderFlushResolveBeforeWorldWrite = true;
					}

					exit();
				})();
			}, [exit, waitUntilRenderFlush]);

			return <Text>{text}</Text>;
		}

		const {waitUntilExit} = render(<Test />, {
			stdout,
			concurrent: true,
		});
		await waitUntilExit();

		expect(didWorldWriteCallbackFire).toBe(true);
		expect(didWaitUntilRenderFlushResolveBeforeWorldWrite).toBe(false);
	},
);

test('waitUntilRenderFlush resolves after unmount', async () => {
	const stdout = createStdout();
	const {unmount, waitUntilExit, waitUntilRenderFlush} = render(
		<Text>Hello</Text>,
		{
			stdout,
		},
	);

	unmount();
	await waitUntilExit();
	await waitUntilRenderFlush();
});

test.skip(
	'waitUntilRenderFlush waits for unmount write callback', async () => {
		let didUnmountWriteCallbackFire = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return isWriteBarrierChunk(chunk);
			},
			onDelayElapsed() {
				didUnmountWriteCallbackFire = true;
			},
		});

		const {unmount, waitUntilRenderFlush} = render(<Text>Hello</Text>, {
			stdout,
		});

		unmount();
		await waitUntilRenderFlush();

		expect(didUnmountWriteCallbackFire).toBe(true);
	},
);

test.skip(
	'waitUntilRenderFlush after unmount does not register beforeExit listener', async () => {
		const stdout = createStdout();
		const {unmount, waitUntilRenderFlush} = render(<Text>Hello</Text>, {
			stdout,
		});
		const beforeWaitListenerCount = process.listenerCount('beforeExit');

		unmount();
		await waitUntilRenderFlush();

		expect(process.listenerCount('beforeExit')).toBe(beforeWaitListenerCount);
	},
);

test('waitUntilRenderFlush resolves after exit with error', async () => {
	const stdout = createStdout();

	function Test() {
		const {exit} = useApp();

		useEffect(() => {
			exit(new Error('boom'));
		}, [exit]);

		return <Text>Hello</Text>;
	}

	const {waitUntilExit, waitUntilRenderFlush} = render(<Test />, {stdout});

	// Verify exit rejects with the error.
	await expect(waitUntilExit()).rejects.toThrow('boom');

	// Flush must resolve (not reject) even after an error exit.
	await waitUntilRenderFlush();
});

test.skip(
	'issue 596: useEffect can run before the first frame write callback', async () => {
		let didInitialWriteCallbackFire = false;
		let didUseEffectRun = false;

		const stdout = createDelayedWriteCallbackStdout({
			shouldDelay(chunk) {
				return !isWriteBarrierChunk(chunk);
			},
			onDelayElapsed() {
				didInitialWriteCallbackFire = true;
			},
		});

		function Test() {
			useEffect(() => {
				didUseEffectRun = true;
			}, []);

			return <Text>Hello</Text>;
		}

		const {unmount, waitUntilExit} = render(<Test />, {stdout});

		await delay(20);
		expect(didUseEffectRun).toBe(true);
		expect(didInitialWriteCallbackFire).toBe(false);

		unmount();
		await waitUntilExit();

		expect(didInitialWriteCallbackFire).toBe(true);
	},
);

test.skip(
	'waitUntilExit resolves first exit value when duplicate exits happen during teardown', async () => {
		let barrierWriteCallback: (() => void) | undefined;

		const stdout = new Writable({
			write(
				chunk: string | Uint8Array,
				_encoding: BufferEncoding,
				callback: (error?: Error) => void,
			) {
				if (isWriteBarrierChunk(chunk)) {
					barrierWriteCallback = callback;
					return;
				}

				callback();
			},
		}) as unknown as NodeJS.WriteStream;

		stdout.columns = 100;

		function Test() {
			const {exit} = useApp();

			useEffect(() => {
				exit('first');
				setTimeout(() => {
					exit('second');
				}, 0);
			}, [exit]);

			return <Text>Hello</Text>;
		}

		const {waitUntilExit} = render(<Test />, {stdout});
		const exitPromise = waitUntilExit();

		await delay(0);

		if (!barrierWriteCallback) {
			throw new Error('Expected unmount to queue a write barrier callback');
		}

		barrierWriteCallback();
		const result = await exitPromise;
		expect(result).toBe('first');
	},
);

test.skip(
	'waitUntilExit resolves first exit value when exit is re-entered during unmount writes', async () => {
		let exit: ((errorOrResult?: unknown) => void) | undefined;
		let shouldReenterExit = false;
		let didReenterExit = false;

		const stdout = new Writable({
			write(_chunk, _encoding, callback) {
				if (shouldReenterExit && !didReenterExit && exit) {
					didReenterExit = true;
					exit('second');
				}

				callback();
			},
		}) as unknown as NodeJS.WriteStream;

		stdout.columns = 100;
		stdout.isTTY = true;

		function Test() {
			const {exit: appExit} = useApp();

			useEffect(() => {
				exit = appExit;
				shouldReenterExit = true;
				appExit('first');
			}, [appExit]);

			return <Text>Hello</Text>;
		}

		const {waitUntilExit} = render(<Test />, {stdout});
		const result = await waitUntilExit();

		expect(didReenterExit).toBe(true);
		expect(result, 'first');
	},
);

test.skip(
	'waitUntilExit resolves first exit value when exit is re-entered during unmount writes in debug mode', async () => {
		let exit: ((errorOrResult?: unknown) => void) | undefined;
		let shouldReenterExit = false;
		let didReenterExit = false;

		const stdout = new Writable({
			write(_chunk, _encoding, callback) {
				if (shouldReenterExit && !didReenterExit && exit) {
					didReenterExit = true;
					exit('second');
				}

				callback();
			},
		}) as unknown as NodeJS.WriteStream;

		stdout.columns = 100;
		stdout.isTTY = true;

		function Test() {
			const {exit: appExit} = useApp();

			useEffect(() => {
				exit = appExit;
				shouldReenterExit = true;
				appExit('first');
			}, [appExit]);

			return <Text>Hello</Text>;
		}

		const {waitUntilExit} = render(<Test />, {stdout, debug: true});
		const result = await waitUntilExit();

		expect(didReenterExit).toBe(true);
		expect(result, 'first');
	},
);

test.skip(
	'waitUntilExit resolves first exit value when exit is re-entered during unmount writes with screen reader', async () => {
		let exit: ((errorOrResult?: unknown) => void) | undefined;
		let shouldReenterExit = false;
		let didReenterExit = false;

		const stdout = new Writable({
			write(_chunk, _encoding, callback) {
				if (shouldReenterExit && !didReenterExit && exit) {
					didReenterExit = true;
					exit('second');
				}

				callback();
			},
		}) as unknown as NodeJS.WriteStream;

		stdout.columns = 100;
		stdout.isTTY = true;

		function Test() {
			const {exit: appExit} = useApp();

			useEffect(() => {
				exit = appExit;
				shouldReenterExit = true;
				appExit('first');
			}, [appExit]);

			return <Text>Hello</Text>;
		}

		const {waitUntilExit} = render(<Test />, {
			stdout,
			isScreenReaderEnabled: true,
			patchConsole: false,
		});
		const result = await waitUntilExit();

		expect(didReenterExit).toBe(true);
		expect(result, 'first');
	},
);

test('exit rejects on cross-realm Error', async () => {
	const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
	stdout.columns = 100;

	const foreignError = vm.runInNewContext(`new Error('boom')`) as Error;

	function Test() {
		const {exit} = useApp();

		useEffect(() => {
			setTimeout(() => {
				exit(foreignError);
			}, 0);
		}, [exit]);

		return <Text>Hello</Text>;
	}

	const {waitUntilExit} = render(<Test />, {stdout, patchConsole: false});

	await expect(waitUntilExit()).rejects.toThrow('boom');
});

test.skip(
	'exit with cross-realm Error rejects after stdout write callback', async () => {
		let writeCallbackFired = false;
		let barrierWriteCallbackFired = false;

		const stdout = new Writable({
			write(chunk: string | Uint8Array, _encoding, callback) {
				setTimeout(() => {
					writeCallbackFired = true;

					if (isWriteBarrierChunk(chunk)) {
						barrierWriteCallbackFired = true;
					}

					callback();
				}, 150);
			},
		}) as unknown as NodeJS.WriteStream;

		stdout.columns = 100;

		const foreignError = vm.runInNewContext(`new Error('boom')`) as Error;

		function Test() {
			const {exit} = useApp();

			useEffect(() => {
				setTimeout(() => {
					exit(foreignError);
				}, 0);
			}, [exit]);

			return <Text>Hello</Text>;
		}

		const {waitUntilExit} = render(<Test />, {stdout, patchConsole: false});

		await expect(waitUntilExit()).rejects.toThrow('boom');

		expect(writeCallbackFired).toBe(true);
		expect(barrierWriteCallbackFired).toBe(true);
	},
);

test('unmount does not write to ended stdout stream', async () => {
	const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
	stdout.columns = 100;

	const writeErrors: Error[] = [];
	stdout.on('error', error => {
		writeErrors.push(error);
	});

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {stdout});
	const exitPromise = waitUntilExit();

	stdout.end();
	unmount();
	await exitPromise;
	await delay(0);

	expect(		writeErrors.some(
			error =>
				(error as NodeJS.ErrnoException).code === 'ERR_STREAM_WRITE_AFTER_END',
		),
).toBe(false);
});

test.skip(
	'unmount cancels pending throttled log writes when stdout is ended', () => {
		const clock = {tick: vi.advanceTimersByTime, countTimers: () => 0, runAll: () => {}};
		try {
			const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
			stdout.columns = 100;

			const writeErrors: Error[] = [];
			stdout.on('error', error => {
				writeErrors.push(error);
			});

			const {rerender, unmount} = render(
				<ThrottleTestComponent text="Hello" />,
				{
					stdout,
					maxFps: 1,
				},
			);

			rerender(<ThrottleTestComponent text="World" />);
			stdout.end();
			unmount();
			clock.tick(1000);

			expect(				writeErrors.some(
					error =>
						(error as NodeJS.ErrnoException).code ===
						'ERR_STREAM_WRITE_AFTER_END',
				),
			).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	},
);

test.skip(
	'unmount cancels pending throttled render when stdout is ended', () => {
		const clock = {tick: vi.advanceTimersByTime, countTimers: () => 0, runAll: () => {}};
		try {
			const baselineStdout = new PassThrough() as unknown as NodeJS.WriteStream;
			baselineStdout.columns = 100;

			const baselineApp = render(<ThrottleTestComponent text="Hello" />, {
				stdout: baselineStdout,
				maxFps: 1,
			});
			baselineStdout.end();
			baselineApp.unmount();
			const baselineTimers = clock.countTimers();
			clock.runAll();

			const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
			stdout.columns = 100;

			const {rerender, unmount} = render(
				<ThrottleTestComponent text="Hello" />,
				{
					stdout,
					maxFps: 1,
				},
			);
			rerender(<ThrottleTestComponent text="World" />);
			stdout.end();
			unmount();

			expect(clock.countTimers()).toBe(baselineTimers);
		} finally {
			vi.useRealTimers();
		}
	},
);

const createTtyStdout = (columns?: number) => {
	const stdout = createStdout(columns);
	(stdout as any).isTTY = true;
	return stdout;
};

const withFakeClock = (
	run: (clock: {tick: (ms: number) => void}) => void,
) => {
	vi.useFakeTimers();
	try {
		run({tick: (ms: number) => vi.advanceTimersByTime(ms)});
	} finally {
		vi.useRealTimers();
	}
};

const captureWrites = (stdout: NodeJS.WriteStream): string[] => {
	const writes: string[] = [];
	const originalWrite = stdout.write;
	(stdout as any).write = (...args: any[]) => {
		writes.push(args[0] as string);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
		return (originalWrite as any)(...args);
	};

	return writes;
};

const assertNoBsuEsuForUnchangedTrailingRerender = (
		element: React.ReactElement,
) => {
	withFakeClock(clock => {
		const stdout = createTtyStdout();
		const writes = captureWrites(stdout);
		const {unmount, rerender} = render(element, {stdout, maxFps: 1});
		try {
			expect(writes.includes(bsu)).toBe(true);

			writes.length = 0;
			rerender(element);
			clock.tick(1000);

			expect(writes.includes(bsu)).toBe(false);
			expect(writes.includes(esu)).toBe(false);
		} finally {
			unmount();
		}
	});
};

test('no bsu/esu when output is unchanged', () => {
	assertNoBsuEsuForUnchangedTrailingRerender(
		<ThrottleTestComponent text="Hello" />,
	);
});

test('no bsu/esu when output and cursor are unchanged', () => {
	assertNoBsuEsuForUnchangedTrailingRerender(
		<ThrottleCursorTestComponent text="Hello" />,
	);
});

test('bsu/esu wraps throttledLog trailing call', () => {
	withFakeClock(clock => {
		const stdout = createTtyStdout();
		const writes = captureWrites(stdout);
		const {unmount, rerender} = render(<ThrottleTestComponent text="Hello" />, {
			stdout,
			maxFps: 1,
		});
		try {
			// Leading call writes: bsu, content, esu
			const leadingWrites = new Set(writes);
			expect(leadingWrites.has(bsu)).toBe(true);
			expect(leadingWrites.has(esu)).toBe(true);

			// Trigger a rerender inside the throttle window (will be deferred as trailing)
			writes.length = 0;
			rerender(<ThrottleTestComponent text="World" />);

			// No immediate write yet (throttled)
			const midWrites = [...writes];
			expect(				midWrites.some(w => w.includes('World')),
				'trailing call should not write immediately',
).toBe(false);

			// Advance past throttle window to trigger trailing call
			writes.length = 0;
			clock.tick(1000);

			// Trailing call should also be wrapped with bsu/esu
			expect(writes.includes(bsu)).toBe(true);
			expect(writes.includes(esu)).toBe(true);

			// Verify bsu comes before content and esu comes after
			const bsuIdx = writes.indexOf(bsu);
			const esuIdx = writes.indexOf(esu);
			expect(bsuIdx < esuIdx, 'bsu should come before esu').toBe(true);
		} finally {
			unmount();
		}
	});
});
