import React, {Suspense, act, useEffect, useState} from 'react';
import ansiEscapes from 'ansi-escapes';
import delay from 'delay';
import {
	render,
	Box,
	Text,
	useInput,
	useCursor,
	useStdout,
	useStderr,
} from '../index.js';
import {createStdin, emitReadable} from '../../test/helpers/create-stdin.js';
import createStdout from '../../test/helpers/create-stdout.js';

const showCursorEscape = '[?25h';
const hideCursorEscape = '[?25l';

const getWriteCalls = (stream: NodeJS.WriteStream): string[] => {
	const writes: string[] = [];
	for (let i = 0; i < (stream.write as any).mock.calls.length; i++) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		writes.push((stream.write as any).mock.calls[i][0] as string);
	}

	return writes;
};

const waitForCondition = async (condition: () => boolean): Promise<void> => {
	if (condition()) {
		return;
	}

	const timeoutMs = 2000;
	const intervalMs = 10;
	const maxAttempts = Math.ceil(timeoutMs / intervalMs);

	await new Promise<void>((resolve, reject) => {
		let attempts = 0;
		const interval = setInterval(() => {
			try {
				if (condition()) {
					clearInterval(interval);
					resolve();
					return;
				}
			} catch (error) {
				clearInterval(interval);
				reject(
					error instanceof Error ? error : new Error('Condition check threw'),
				);
				return;
			}

			attempts++;
			if (attempts >= maxAttempts) {
				clearInterval(interval);
				reject(new Error(`Condition was not met in ${timeoutMs}ms`));
			}
		}, intervalMs);
	});
};

function InputApp() {
	const [text, setText] = useState('');
	const {setCursorPosition} = useCursor();

	useInput((input, key) => {
		if (key.backspace || key.delete) {
			setText(prev => prev.slice(0, -1));
			return;
		}

		if (!key.ctrl && !key.meta && input) {
			setText(prev => prev + input);
		}
	});

	setCursorPosition({x: 2 + text.length, y: 0});

	return (
		<Box>
			<Text>{`> ${text}`}</Text>
		</Box>
	);
}

test('cursor is shown at specified position after render', async () => {
	const stdout = createStdout();
	const stdin = createStdin();

	const {unmount} = render(<InputApp />, {stdout, stdin});
	await delay(50);

	// With isTTY=true, cli-cursor writes cursor escape sequences as separate
	// stdout.write calls (synchronized output wrappers), so we check the
	// combined output of the first render rather than a single firstCall.
	const firstRenderOutput = getWriteCalls(stdout).join('');
	// Cursor should be shown at x=2 (after "> ")
	expect(firstRenderOutput.includes(showCursorEscape)).toBe(true);
	expect(firstRenderOutput.includes(ansiEscapes.cursorTo(2))).toBe(true);

	unmount();
});

test('cursor is not hidden by useEffect after first render', async () => {
	const stdout = createStdout();
	const stdin = createStdin();

	const {unmount} = render(<InputApp />, {stdout, stdin});
	await delay(50);

	// Check all writes after the first render — none should be a bare hideCursorEscape
	// that would undo the showCursorEscape from log-update.
	// The last write to stdout should contain showCursorEscape (from log-update),
	// not be followed by a separate hideCursorEscape write from App.tsx useEffect.
	const output = getWriteCalls(stdout).join('');
	const lastShowIndex = output.lastIndexOf(showCursorEscape);
	const lastHideIndex = output.lastIndexOf(hideCursorEscape);

	expect(lastShowIndex > lastHideIndex).toBe(true);

	unmount();
});

test('cursor follows text input', async () => {
	const stdout = createStdout();
	const stdin = createStdin();

	const {unmount} = render(<InputApp />, {stdout, stdin});
	await delay(50);

	emitReadable(stdin, 'a');
	await delay(50);

	// With isTTY=true, stdout.get() (lastCall) may be a synchronized output
	// wrapper rather than the render content, so check all writes combined.
	const allOutput = getWriteCalls(stdout).join('');
	// After typing 'a', cursor should be at x=3 ("> a" = 3 chars)
	expect(allOutput.includes(showCursorEscape)).toBe(true);
	expect(allOutput.includes(ansiEscapes.cursorTo(3))).toBe(true);

	unmount();
});

test('cursor moves on space input even when output is identical', async () => {
	const stdout = createStdout();
	const stdin = createStdin();

	const {unmount} = render(<InputApp />, {stdout, stdin});
	await delay(50);

	emitReadable(stdin, 'a');
	await delay(50);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const afterA = (stdout.write as any).mock.calls.length;

	emitReadable(stdin, ' ');
	await delay(50);

	// Space adds to text, cursor should move even if Ink output looks the same (padded)
	expect((stdout.write as any).mock.calls.length > afterA).toBe(true);

	// With isTTY=true, stdout.get() (lastCall) may be a synchronized output
	// wrapper rather than the render content, so check all writes combined.
	const allOutput = getWriteCalls(stdout).join('');
	// After "a ", cursor should be at x=4
	expect(allOutput.includes(ansiEscapes.cursorTo(4))).toBe(true);

	unmount();
});

test('cursor is cleared when component using useCursor unmounts', async () => {
	const stdout = createStdout();
	const stdin = createStdin();

	function CursorChild() {
		const {setCursorPosition} = useCursor();
		setCursorPosition({x: 5, y: 0});
		return <Text>child</Text>;
	}

	function Parent() {
		const [showChild, setShowChild] = useState(true);

		useInput((_input, key) => {
			if (key.return) {
				setShowChild(false);
			}
		});

		return <Box>{showChild ? <CursorChild /> : <Text>no cursor</Text>}</Box>;
	}

	const {unmount} = render(<Parent />, {stdout, stdin});
	await delay(50);

	// With isTTY=true, cli-cursor writes cursor escape sequences as separate
	// stdout.write calls, so check the combined initial render output.
	const initialRenderOutput = getWriteCalls(stdout).join('');
	expect(initialRenderOutput.includes(showCursorEscape)).toBe(true);

	const writesBeforeEnter = (stdout.write as any).mock.calls.length;

	// Unmount the child by pressing Enter
	emitReadable(stdin, '\r');
	await delay(50);

	// After child unmounts, cursor position should be cleared.
	// Only look at writes after the initial render to avoid counting
	// the initial render's cursor sequences.
	const outputAfterChildUnmount = getWriteCalls(stdout)
		.slice(writesBeforeEnter)
		.join('');
	const lastShowIndex = outputAfterChildUnmount.lastIndexOf(showCursorEscape);
	const lastHideIndex = outputAfterChildUnmount.lastIndexOf(hideCursorEscape);
	expect(lastHideIndex > lastShowIndex).toBe(true);

	unmount();
});

test('cursor position does not leak from suspended concurrent render to fallback', async () => {
	const stdout = createStdout();
	const stdin = createStdin();

	let resolvePromise: () => void;
	const promise = new Promise<void>(resolve => {
		resolvePromise = resolve;
	});

	let suspended = true;

	function CursorChild() {
		const {setCursorPosition} = useCursor();
		setCursorPosition({x: 5, y: 0}); // Render-phase side effect
		if (suspended) {
			// eslint-disable-next-line @typescript-eslint/only-throw-error
			throw promise;
		}

		return <Text>loaded</Text>;
	}

	function Test() {
		return (
			<Suspense fallback={<Text>loading</Text>}>
				<CursorChild />
			</Suspense>
		);
	}

	await act(async () => {
		render(<Test />, {stdout, stdin, concurrent: true});
	});

	const fallbackOutput = getWriteCalls(stdout).join('');
	expect(fallbackOutput.includes('loading')).toBe(true);
	expect(fallbackOutput.includes(showCursorEscape)).toBe(false);

	// Cleanup: resolve promise and unmount
	suspended = false;
	resolvePromise!();
	await act(async () => {
		await delay(50);
	});
});

test('screen does not scroll up on subsequent renders', async () => {
	const stdout = createStdout();
	const stdin = createStdin();

	function MultiLineApp() {
		const [text, setText] = useState('');
		const {setCursorPosition} = useCursor();

		useInput((input, key) => {
			if (!key.ctrl && !key.meta && input) {
				setText(prev => prev + input);
			}
		});

		setCursorPosition({x: 2 + text.length, y: 1});

		return (
			<Box flexDirection="column">
				<Text>Header</Text>
				<Text>{`> ${text}`}</Text>
			</Box>
		);
	}

	const {unmount} = render(<MultiLineApp />, {stdout, stdin});
	await delay(50);

	const writesBeforeInput = (stdout.write as any).mock.calls.length;

	emitReadable(stdin, 'x');
	await delay(50);

	// With isTTY=true, stdout.get() (lastCall) may be a synchronized output
	// wrapper rather than the render content, so check writes from the
	// second render combined.
	const secondRenderOutput = getWriteCalls(stdout)
		.slice(writesBeforeInput)
		.join('');
	// When cursor was at y=1 (line 1), next render should first cursorDown to bottom,
	// then erase. The write should contain cursorDown to return to bottom.
	// It should NOT just erase from cursor position (which would scroll screen up).
	expect(secondRenderOutput.includes(hideCursorEscape)).toBe(true);
	// The write should include the new text
	expect(secondRenderOutput.includes('x')).toBe(true);

	unmount();
});

function StdoutWriteApp() {
	const {setCursorPosition} = useCursor();
	const {write} = useStdout();

	setCursorPosition({x: 2, y: 0});

	useEffect(() => {
		write('from stdout hook\n');
	}, [write]);

	return <Text>Hello</Text>;
}

function StderrWriteApp() {
	const {setCursorPosition} = useCursor();
	const {write} = useStderr();

	setCursorPosition({x: 2, y: 0});

	useEffect(() => {
		write('from stderr hook\n');
	}, [write]);

	return <Text>Hello</Text>;
}

type HookWriteCase = {
	readonly testName: string;
	readonly App: () => React.JSX.Element;
	readonly includeStderr?: boolean;
	readonly assertTargetWrite: (
		output: string,
		stderr: NodeJS.WriteStream | undefined,
	) => void;
};

const hookWriteCases: HookWriteCase[] = [
	{
		testName: 'cursor remains visible after useStdout().write()',
		App: StdoutWriteApp,
		assertTargetWrite(output) {
			expect(output.includes('from stdout hook')).toBe(true);
		},
	},
	{
		testName: 'cursor remains visible after useStderr().write()',
		App: StderrWriteApp,
		includeStderr: true,
		assertTargetWrite(_output, stderr) {
			expect((stderr?.write as any).mock.calls.length > 0).toBe(true);
		},
	},
];

for (const testCase of hookWriteCases) {
	test(testCase.testName, async () => {
		const stdout = createStdout();
		const stdin = createStdin();
		const stderr = testCase.includeStderr ? createStdout() : undefined;

		const {unmount} = render(
			<testCase.App />,
			stderr ? {stdout, stderr, stdin} : {stdout, stdin},
		);
		await delay(50);

		const output = getWriteCalls(stdout).join('');
		const lastShowIndex = output.lastIndexOf(showCursorEscape);
		const lastHideIndex = output.lastIndexOf(hideCursorEscape);

		testCase.assertTargetWrite(output, stderr);
		expect(lastShowIndex > lastHideIndex).toBe(true);

		unmount();
	});
}

function DebugStdoutWriteApp() {
	const {write} = useStdout();

	useEffect(() => {
		write('from stdout hook\n');
	}, [write]);

	return <Text>Hello</Text>;
}

function DebugStderrWriteApp() {
	const {write} = useStderr();

	useEffect(() => {
		write('from stderr hook\n');
	}, [write]);

	return <Text>Hello</Text>;
}

test('debug mode: useStdout().write() replays latest frame', async () => {
	const stdout = createStdout();
	const {unmount} = render(<DebugStdoutWriteApp />, {stdout, debug: true});
	await waitForCondition(() =>
		getWriteCalls(stdout).some(write =>
			write.includes('from stdout hook\nHello'),
		),
	);

	const writes = getWriteCalls(stdout);
	const hookWrite = writes.find(write =>
		write.includes('from stdout hook\nHello'),
	);

	expect(hookWrite).toBeTruthy();
	expect(writes.includes('')).toBe(false);

	unmount();
});

test('debug mode: useStdout().write() does not leak into stderr', async () => {
	const stdout = createStdout();
	const stderr = createStdout();
	const {unmount} = render(<DebugStdoutWriteApp />, {
		stdout,
		stderr,
		debug: true,
	});
	await waitForCondition(() =>
		getWriteCalls(stdout).some(write =>
			write.includes('from stdout hook\nHello'),
		),
	);

	const stderrWrites = getWriteCalls(stderr);
	expect(stderrWrites.some(write => write.includes('from stdout hook\n'))).toBe(false);
	expect(stderrWrites.some(write => write.includes('Hello'))).toBe(false);
	expect(stderrWrites.includes('')).toBe(false);

	unmount();
});

test('debug mode: useStderr().write() replays latest frame without empty writes', async () => {
	const stdout = createStdout();
	const stderr = createStdout();
	const {unmount} = render(<DebugStderrWriteApp />, {
		stdout,
		stderr,
		debug: true,
	});
	await waitForCondition(() =>
		getWriteCalls(stderr).some(write => write.includes('from stderr hook\n')),
	);
	await waitForCondition(() => getWriteCalls(stdout).length > 1);

	const stdoutWrites = getWriteCalls(stdout);
	const stderrWrites = getWriteCalls(stderr);
	const stdoutWritesAfterInitialRender = stdoutWrites.slice(1);

	expect(stderrWrites.some(write => write.includes('from stderr hook\n'))).toBe(true);
	expect(stderrWrites.some(write => write.includes('Hello'))).toBe(false);
	expect(stdoutWritesAfterInitialRender.length > 0).toBe(true);
	expect(stdoutWritesAfterInitialRender.some(write => write.includes('Hello'))).toBe(true);
	expect(
		stdoutWritesAfterInitialRender.some(write => write.includes('from stderr hook\n')),
	).toBe(false);
	expect(stdoutWrites.includes('')).toBe(false);
	expect(stderrWrites.includes('')).toBe(false);

	unmount();
});

function DebugStderrWriteAfterRerenderApp() {
	const [text, setText] = useState('Initial');
	const {write} = useStderr();

	useEffect(() => {
		setText('Updated');
	}, []);

	useEffect(() => {
		if (text === 'Updated') {
			write('from stderr hook\n');
		}
	}, [text, write]);

	return <Text>{text}</Text>;
}

function DebugStdoutWriteAfterRerenderApp() {
	const [text, setText] = useState('Initial');
	const {write} = useStdout();

	useEffect(() => {
		setText('Updated');
	}, []);

	useEffect(() => {
		if (text === 'Updated') {
			write('from stdout hook\n');
		}
	}, [text, write]);

	return <Text>{text}</Text>;
}

test('debug mode: useStdout().write() replays rerendered frame', async () => {
	const stdout = createStdout();
	const {unmount} = render(<DebugStdoutWriteAfterRerenderApp />, {
		stdout,
		debug: true,
	});
	await waitForCondition(() =>
		getWriteCalls(stdout).some(write =>
			write.includes('from stdout hook\nUpdated'),
		),
	);

	const stdoutWrites = getWriteCalls(stdout);

	expect(stdoutWrites.some(write => write.includes('from stdout hook\nUpdated'))).toBe(true);
	expect(stdoutWrites.some(write => write.includes('from stdout hook\nInitial'))).toBe(false);
	expect(stdoutWrites.includes('')).toBe(false);

	unmount();
});

test('debug mode: useStderr().write() replays rerendered frame', async () => {
	const stdout = createStdout();
	const stderr = createStdout();
	const {unmount} = render(<DebugStderrWriteAfterRerenderApp />, {
		stdout,
		stderr,
		debug: true,
	});
	await waitForCondition(() =>
		getWriteCalls(stderr).some(write => write.includes('from stderr hook\n')),
	);
	await waitForCondition(() =>
		getWriteCalls(stdout)
			.slice(1)
			.some(write => write.includes('Updated')),
	);

	const stdoutWrites = getWriteCalls(stdout);
	const stderrWrites = getWriteCalls(stderr);
	const stdoutWritesAfterInitialRender = stdoutWrites.slice(1);

	expect(stderrWrites.some(write => write.includes('from stderr hook\n'))).toBe(true);
	expect(stderrWrites.some(write => write.includes('Updated'))).toBe(false);
	expect(stderrWrites.some(write => write.includes('Initial'))).toBe(false);
	expect(stdoutWritesAfterInitialRender.some(write => write.includes('Updated'))).toBe(true);
	expect(stdoutWritesAfterInitialRender.some(write => write.includes('Initial'))).toBe(false);
	expect(
		stdoutWritesAfterInitialRender.some(write => write.includes('from stderr hook\n')),
	).toBe(false);
	expect(stdoutWrites.includes('')).toBe(false);
	expect(stderrWrites.includes('')).toBe(false);

	unmount();
});
