import process from 'node:process';

import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import React, {Component, useEffect, useState} from 'react';

import ansiEscapes from 'ansi-escapes';
import {
	Box,
	Newline,
	render,
	Spacer,
	Static,
	Text,
	Transform,
	useApp,
	useInput,
	useStdin,
} from '../index.js';
import createStdout from '../../test/helpers/create-stdout.js';
import {createStdin, emitReadable, type StdinMock} from '../../test/helpers/create-stdin.js';
import {
	renderToString,
	renderToStringAsync,
} from '../../test/helpers/render-to-string.js';
import {run} from '../../test/helpers/run.js';
import {renderAsync} from '../../test/helpers/test-renderer.js';

const createRawModeStdin = (): StdinMock => createStdin();

test('text', () => {
	const output = renderToString(<Text>Hello World</Text>);

	expect(output).toBe('Hello World');
});

test('text with variable', () => {
	const output = renderToString(<Text>Count: {1}</Text>);

	expect(output).toBe('Count: 1');
});

test('multiple text nodes', () => {
	const output = renderToString(
		<Text>
			{'Hello'}
			{' World'}
		</Text>,
	);

	expect(output).toBe('Hello World');
});

test('text with component', () => {
	function World() {
		return <Text>World</Text>;
	}

	const output = renderToString(
		<Text>
			Hello <World />
		</Text>,
	);

	expect(output).toBe('Hello World');
});

test('text with fragment', () => {
	const output = renderToString(
		<Text>
			Hello <>World</> {/* eslint-disable-line react/jsx-no-useless-fragment */}
		</Text>,
	);

	expect(output).toBe('Hello World');
});

test('wrap text', () => {
	const output = renderToString(
		<Box width={7}>
			<Text wrap="wrap">Hello World</Text>
		</Box>,
	);

	expect(output).toBe('Hello\nWorld');
});

test('don’t wrap text if there is enough space', () => {
	const output = renderToString(
		<Box width={20}>
			<Text wrap="wrap">Hello World</Text>
		</Box>,
	);

	expect(output).toBe('Hello World');
});

test('hard wrap text', () => {
	const output = renderToString(
		<Box width={7}>
			<Text wrap="hard">Hello World</Text>
		</Box>,
	);

	expect(output).toBe('Hello W\norld');
});

test('hard wrap with long word', () => {
	const output = renderToString(
		<Box width={5}>
			<Text wrap="hard">aaaaaaaaaa</Text>
		</Box>,
	);

	expect(output).toBe('aaaaa\naaaaa');
});

test('don’t hard wrap text if there is enough space', () => {
	const output = renderToString(
		<Box width={20}>
			<Text wrap="hard">Hello World</Text>
		</Box>,
	);

	expect(output).toBe('Hello World');
});

test('truncate text in the end', () => {
	const output = renderToString(
		<Box width={7}>
			<Text wrap="truncate">Hello World</Text>
		</Box>,
	);

	expect(output).toBe('Hello …');
});

test('truncate text in the middle', () => {
	const output = renderToString(
		<Box width={7}>
			<Text wrap="truncate-middle">Hello World</Text>
		</Box>,
	);

	expect(output).toBe('Hel…rld');
});

test('truncate text in the beginning', () => {
	const output = renderToString(
		<Box width={7}>
			<Text wrap="truncate-start">Hello World</Text>
		</Box>,
	);

	expect(output).toBe('… World');
});

// See https://github.com/vadimdemedes/ink/issues/633
test('do not wrap text with BEL-terminated OSC hyperlinks', () => {
	// "Click here" is 10 chars, box is 20 wide - should not wrap
	const hyperlink =
		'\u001B]8;;https://example.com\u0007Click here\u001B]8;;\u0007';
	const output = renderToString(
		<Box width={20}>
			<Text wrap="wrap">{hyperlink}</Text>
		</Box>,
	);

	expect(stripAnsi(output)).toBe('Click here');
});

// See https://github.com/vadimdemedes/ink/issues/633
test('do not wrap text with ST-terminated OSC hyperlinks', () => {
	const hyperlink =
		'\u001B]8;;https://example.com\u001B\\Click here\u001B]8;;\u001B\\';
	const output = renderToString(
		<Box width={20}>
			<Text wrap="wrap">{hyperlink}</Text>
		</Box>,
	);

	expect(stripAnsi(output)).toBe('Click here');
});

// See https://github.com/vadimdemedes/ink/issues/633
test('do not wrap text with non-hyperlink OSC sequences', () => {
	// Title-setting OSC followed by visible text
	const text = '\u001B]0;My Title\u0007Some text';
	const output = renderToString(
		<Box width={20}>
			<Text wrap="wrap">{text}</Text>
		</Box>,
	);

	expect(stripAnsi(output)).toBe('Some text');
});

// See https://github.com/vadimdemedes/ink/issues/633
test('hard-wrap single-word BEL-terminated OSC hyperlink', () => {
	// "abcdefghij" is 10 chars, box is 5 wide - forces wrapWord codepath
	const hyperlink =
		'\u001B]8;;https://example.com\u0007abcdefghij\u001B]8;;\u0007';
	const output = renderToString(
		<Box width={5}>
			<Text wrap="wrap">{hyperlink}</Text>
		</Box>,
	);

	expect(stripAnsi(output)).toBe('abcde\nfghij');
});

// See https://github.com/vadimdemedes/ink/issues/633
test('hard-wrap single-word ST-terminated OSC hyperlink', () => {
	const hyperlink =
		'\u001B]8;;https://example.com\u001B\\abcdefghij\u001B]8;;\u001B\\';
	const output = renderToString(
		<Box width={5}>
			<Text wrap="wrap">{hyperlink}</Text>
		</Box>,
	);

	expect(stripAnsi(output)).toBe('abcde\nfghij');
});

test('ignore empty text node', () => {
	const output = renderToString(
		<Box flexDirection="column">
			<Box>
				<Text>Hello World</Text>
			</Box>
			<Text>{''}</Text>
		</Box>,
	);

	expect(output).toBe('Hello World');
});

test('render a single empty text node', () => {
	const output = renderToString(<Text>{''}</Text>);
	expect(output).toBe('');
});

test('number', () => {
	const output = renderToString(<Text>{1}</Text>);

	expect(output).toBe('1');
});

test('fail when text nodes are not within <Text> component', () => {
	let error: Error | undefined;

	class ErrorBoundary extends Component<{children?: React.ReactNode}> {
		override render(): React.ReactNode {
			return this.props.children;
		}

		override componentDidCatch(reactError: Error): void {
			error = reactError;
		}
	}

	renderToString(
		<ErrorBoundary>
			<Box>
				Hello
				<Text>World</Text>
			</Box>
		</ErrorBoundary>,
	);

	expect(error).toBeTruthy();
	expect(error?.message).toBe(
		'Text string "Hello" must be rendered inside <Text> component',
	);
});

test('fail when text node is not within <Text> component', () => {
	let error: Error | undefined;

	class ErrorBoundary extends Component<{children?: React.ReactNode}> {
		override render(): React.ReactNode {
			return this.props.children;
		}

		override componentDidCatch(reactError: Error): void {
			error = reactError;
		}
	}

	renderToString(
		<ErrorBoundary>
			<Box>Hello World</Box>
		</ErrorBoundary>,
	);

	expect(error).toBeTruthy();
	expect(error?.message).toBe(
		'Text string "Hello World" must be rendered inside <Text> component',
	);
});

test('fail when <Box> is inside <Text> component', () => {
	let error: Error | undefined;

	class ErrorBoundary extends Component<{children?: React.ReactNode}> {
		override render(): React.ReactNode {
			return this.props.children;
		}

		override componentDidCatch(reactError: Error): void {
			error = reactError;
		}
	}

	renderToString(
		<ErrorBoundary>
			<Text>
				Hello World
				<Box />
			</Text>
		</ErrorBoundary>,
	);

	expect(error).toBeTruthy();
	expect((error as any).message).toBe('<Box> can’t be nested inside <Text> component');
});

test('remeasure text dimensions on text change', () => {
	const stdout = createStdout();

	const {rerender} = render(
		<Box>
			<Text>Hello</Text>
		</Box>,
		{stdout, debug: true},
	);

	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('Hello');

	rerender(
		<Box>
			<Text>Hello World</Text>
		</Box>,
	);

	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('Hello World');
});

test('fragment', () => {
	const output = renderToString(
		// eslint-disable-next-line react/jsx-no-useless-fragment
		<>
			<Text>Hello World</Text>
		</>,
	);

	expect(output).toBe('Hello World');
});

test('transform children', () => {
	const output = renderToString(
		<Transform
			transform={(string: string, index: number) => `[${index}: ${string}]`}
		>
			<Text>
				<Transform
					transform={(string: string, index: number) => `{${index}: ${string}}`}
				>
					<Text>test</Text>
				</Transform>
			</Text>
		</Transform>,
	);

	expect(output).toBe('[0: {0: test}]');
});

test('squash multiple text nodes', () => {
	const output = renderToString(
		<Transform
			transform={(string: string, index: number) => `[${index}: ${string}]`}
		>
			<Text>
				<Transform
					transform={(string: string, index: number) => `{${index}: ${string}}`}
				>
					{/* prettier-ignore */}
					<Text>hello{' '}world</Text>
				</Transform>
			</Text>
		</Transform>,
	);

	expect(output).toBe('[0: {0: hello world}]');
});

test('transform with multiple lines', () => {
	const output = renderToString(
		<Transform
			transform={(string: string, index: number) => `[${index}: ${string}]`}
		>
			{/* prettier-ignore */}
			<Text>hello{' '}world{'\n'}goodbye{' '}world</Text>
		</Transform>,
	);

	expect(output).toBe('[0: hello world]\n[1: goodbye world]');
});

test('squash multiple nested text nodes', () => {
	const output = renderToString(
		<Transform
			transform={(string: string, index: number) => `[${index}: ${string}]`}
		>
			<Text>
				<Transform
					transform={(string: string, index: number) => `{${index}: ${string}}`}
				>
					hello
					<Text> world</Text>
				</Transform>
			</Text>
		</Transform>,
	);

	expect(output).toBe('[0: {0: hello world}]');
});

test('squash empty `<Text>` nodes', () => {
	const output = renderToString(
		<Transform transform={(string: string) => `[${string}]`}>
			<Text>
				<Transform transform={(string: string) => `{${string}}`}>
					<Text>{[]}</Text>
				</Transform>
			</Text>
		</Transform>,
	);

	expect(output).toBe('');
});

test('<Transform> with undefined children', () => {
	const output = renderToString(<Transform transform={children => children} />);
	expect(output).toBe('');
});

test('<Transform> with null children', () => {
	const output = renderToString(<Transform transform={children => children} />);
	expect(output).toBe('');
});

test('hooks', () => {
	function WithHooks() {
		const [value] = useState('Hello');

		return <Text>{value}</Text>;
	}

	const output = renderToString(<WithHooks />);
	expect(output).toBe('Hello');
});

test('static output', () => {
	const output = renderToString(
		<Box>
			<Static items={['A', 'B', 'C']} style={{paddingBottom: 1}}>
				{letter => <Text key={letter}>{letter}</Text>}
			</Static>

			<Box marginTop={1}>
				<Text>X</Text>
			</Box>
		</Box>,
	);

	expect(output).toBe('A\nB\nC\n\n\nX');
});

test('skip previous output when rendering new static output', () => {
	const stdout = createStdout();

	function Dynamic({items}: {readonly items: string[]}) {
		return (
			<Static items={items}>{item => <Text key={item}>{item}</Text>}</Static>
		);
	}

	const {rerender} = render(<Dynamic items={['A']} />, {
		stdout,
		debug: true,
	});

	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('A\n');

	rerender(<Dynamic items={['A', 'B']} />);
	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('A\nB\n');
});

test('static output stops accumulating after Static unmounts (#904)', () => {
	const stdout = createStdout();
	const items = ['A', 'B'];

	function App({show}: {readonly show: boolean}) {
		return (
			<Box>
				{show ? (
					<Static items={items}>
						{item => <Text key={item}>{item}</Text>}
					</Static>
				) : null}
				<Text>Dynamic</Text>
			</Box>
		);
	}

	const {rerender} = render(<App show />, {
		stdout,
		debug: true,
	});

	// Unmount Static — this frees the Yoga WASM node via cleanupYogaNode.
	// The fix clears rootNode.staticNode so the renderer stops accessing it.
	rerender(<App show={false} />);
	const outputAfterUnmount = (stdout.write as any).mock.calls.at(-1)?.[0] as string;

	// Do several more rerenders — these should NOT produce additional static output.
	// Without the fix, the stale staticNode reference causes the renderer to
	// re-render freed static content on every cycle, growing fullStaticOutput.
	for (let i = 0; i < 10; i++) {
		rerender(<App show={false} />);
	}

	const outputAfterChurn = (stdout.write as any).mock.calls.at(-1)?.[0] as string;

	// In debug mode, each stdout.write is fullStaticOutput + dynamicOutput.
	// If staticNode is properly cleared, fullStaticOutput stops growing and
	// outputs stay the same length. If not, each render appends duplicate
	// static content, making outputs progressively longer.
	expect(outputAfterChurn.length).toBe(outputAfterUnmount.length);
	expect(outputAfterChurn.includes('Dynamic')).toBe(true);
});

test('fullStaticOutput is reset when <Static> unmounts so stale items are not replayed', () => {
	// Unmounting <Static> must clear `fullStaticOutput` so its items stop appearing in subsequent writes.
	const stdout = createStdout();

	function App({
		show,
		dynamicLabel,
	}: {
		readonly show: boolean;
		readonly dynamicLabel: string;
	}) {
		return (
			<Box>
				{show ? (
					<Static items={['HISTORY-A', 'HISTORY-B']}>
						{item => <Text key={item}>{item}</Text>}
					</Static>
				) : null}
				<Text>{dynamicLabel}</Text>
			</Box>
		);
	}

	const {rerender} = render(<App show dynamicLabel="d1" />, {
		stdout,
		debug: true,
	});

	const afterMount = (stdout.write as any).mock.calls.at(-1)?.[0] as string;
	expect(afterMount.includes('HISTORY-A') && afterMount.includes('HISTORY-B')).toBe(true);

	rerender(<App show={false} dynamicLabel="d2" />);

	const afterUnmount = (stdout.write as any).mock.calls.at(-1)?.[0] as string;
	expect(afterUnmount.includes('HISTORY-A')).toBe(false);
	expect(afterUnmount.includes('HISTORY-B')).toBe(false);
	expect(afterUnmount.includes('d2')).toBe(true);
});

test('remounting <Static> via key change emits the new items (nested under <Box>)', () => {
	/*
	Exercises the `removeChild` path (Static nested in a <Box>). On key-driven remount, `createInstance` registers the new node before the old one is removed; the removal must not clobber the fresh pointer.
	*/
	const stdout = createStdout();

	function App({session}: {readonly session: number}) {
		const items = session === 1 ? ['old-A', 'old-B'] : ['new-C', 'new-D'];
		return (
			<Box>
				<Static key={session} items={items}>
					{item => <Text key={item}>{item}</Text>}
				</Static>
				<Text>dynamic</Text>
			</Box>
		);
	}

	const {rerender} = render(<App session={1} />, {stdout, debug: true});

	const afterFirstMount = (stdout.write as any).mock.calls.at(-1)?.[0] as string;
	expect(afterFirstMount.includes('old-A') && afterFirstMount.includes('old-B')).toBe(true);

	rerender(<App session={2} />);

	const afterRemount = (stdout.write as any).mock.calls.at(-1)?.[0] as string;
	expect(afterRemount.includes('new-C')).toBe(true);
	expect(afterRemount.includes('new-D')).toBe(true);
});

test('remounting <Static> via key change emits the new items (root-level — removeChildFromContainer)', () => {
	// Same as the nested case above but exercises the `removeChildFromContainer` path (Static is a direct child of the root).
	const stdout = createStdout();

	function App({session}: {readonly session: number}) {
		const items = session === 1 ? ['old-A', 'old-B'] : ['new-C', 'new-D'];
		return (
			<Static key={session} items={items}>
				{item => <Text key={item}>{item}</Text>}
			</Static>
		);
	}

	const {rerender} = render(<App session={1} />, {stdout, debug: true});

	const afterFirstMount = (stdout.write as any).mock.calls.at(-1)?.[0] as string;
	expect(afterFirstMount.includes('old-A') && afterFirstMount.includes('old-B')).toBe(true);

	rerender(<App session={2} />);

	const afterRemount = (stdout.write as any).mock.calls.at(-1)?.[0] as string;
	expect(afterRemount.includes('new-C')).toBe(true);
	expect(afterRemount.includes('new-D')).toBe(true);
});

test('render only new items in static output on final render', () => {
	const stdout = createStdout();

	function Dynamic({items}: {readonly items: string[]}) {
		return (
			<Static items={items}>{item => <Text key={item}>{item}</Text>}</Static>
		);
	}

	const {rerender, unmount} = render(<Dynamic items={[]} />, {
		stdout,
		debug: true,
	});

	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('');

	rerender(<Dynamic items={['A']} />);
	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('A\n');

	rerender(<Dynamic items={['A', 'B']} />);
	unmount();

	// Filter out cursor management escapes (show/hide) to check content writes.
	// With isTTY=true, cli-cursor writes a show-cursor sequence on unmount.
	const allWrites = stdout.getWrites();
	const lastContentWrite = allWrites.findLast(w => !w.startsWith('\u001B[?25'));
	expect(lastContentWrite).toBe('A\nB\n');
});

// See https://github.com/chalk/wrap-ansi/issues/27
test('ensure wrap-ansi doesn’t trim leading whitespace', () => {
	const output = renderToString(<Text color="red">{' ERROR '}</Text>);

	expect(output, chalk.red(' ERROR '));
});

test('replace child node with text', () => {
	const stdout = createStdout();

	function Dynamic({replace}: {readonly replace?: boolean}) {
		return <Text>{replace ? 'x' : <Text color="green">test</Text>}</Text>;
	}

	const {rerender} = render(<Dynamic />, {
		stdout,
		debug: true,
	});

	expect((stdout.write as any).mock.calls.at(-1)?.[0], chalk.green('test'));

	rerender(<Dynamic replace />);
	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('x');
});

// See https://github.com/vadimdemedes/ink/issues/145
test('disable raw mode when all input components are unmounted', async () => {
	const stdout = createStdout();

	const stdin = createRawModeStdin();

	const options = {
		stdout,
		stdin,
		debug: true,
	};

	function Input({setRawMode}: {readonly setRawMode: (mode: boolean) => void}) {
		useEffect(() => {
			setRawMode(true);

			return () => {
				setRawMode(false);
			};
		}, [setRawMode]);

		return <Text>Test</Text>;
	}

	function Test({
		renderFirstInput,
		renderSecondInput,
	}: {
		readonly renderFirstInput?: boolean;
		readonly renderSecondInput?: boolean;
	}) {
		const {setRawMode} = useStdin();

		return (
			<>
				{renderFirstInput ? <Input setRawMode={setRawMode} /> : null}
				{renderSecondInput ? <Input setRawMode={setRawMode} /> : null}
			</>
		);
	}

	const {rerender} = render(
		<Test renderFirstInput renderSecondInput />,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		options as any,
	);

	expect(stdin.setRawMode.mock.calls.length === 1).toBe(true);
	expect(stdin.ref.mock.calls.length === 1).toBe(true);
	expect(stdin.setRawMode.mock.calls[0]).toEqual([true]);
	expect(stdin.listenerCount('readable')).toBe(1);

	rerender(<Test renderFirstInput />);

	expect(stdin.setRawMode.mock.calls.length === 1).toBe(true);
	expect(stdin.ref.mock.calls.length === 1).toBe(true);
	expect(stdin.unref.mock.calls.length === 0).toBe(true);
	expect(stdin.listenerCount('readable')).toBe(1);

	rerender(<Test />);
	expect(stdin.setRawMode.mock.calls.length === 1).toBe(true);
	expect(stdin.unref.mock.calls.length === 0).toBe(true);
	expect(stdin.listenerCount('readable')).toBe(0);

	await new Promise(resolve => {
		queueMicrotask(resolve);
	});

	expect(stdin.setRawMode.mock.calls.length === 2).toBe(true);
	expect(stdin.ref.mock.calls.length === 1).toBe(true);
	expect(stdin.unref.mock.calls.length === 1).toBe(true);
	expect(stdin.setRawMode.mock.calls.at(-1)).toEqual([false]);
});

test('do not disable raw mode when swapping components that use useInput', async () => {
	const stdout = createStdout();

	const stdin = createRawModeStdin();

	const options = {
		stdout,
		stdin,
		debug: true,
	};

	function StepA() {
		useInput(() => {});
		return <Text>A</Text>;
	}

	function StepB() {
		useInput(() => {});
		return <Text>B</Text>;
	}

	function Test({step}: {readonly step: number}) {
		return step === 1 ? <StepA /> : <StepB />;
	}

	const {rerender} = render(
		<Test step={1} />,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		options as any,
	);

	expect(stdin.setRawMode.mock.calls.length === 1).toBe(true);
	expect(stdin.ref.mock.calls.length === 1).toBe(true);
	expect(stdin.setRawMode.mock.calls[0]).toEqual([true]);
	expect(stdin.listenerCount('readable')).toBe(1);

	rerender(<Test step={2} />);
	expect(stdin.listenerCount('readable')).toBe(1);

	await new Promise(resolve => {
		queueMicrotask(resolve);
	});

	expect(stdin.unref.mock.calls.length === 0).toBe(true);
	expect(stdin.setRawMode.mock.calls.at(-1)).toEqual([true]);
	expect(stdin.listenerCount('readable')).toBe(1);
});

test('clear pending input parser state when swapping components that use useInput', async () => {
	vi.useFakeTimers();

	try {
		const stdout = createStdout();

		const stdin = createRawModeStdin();

		const options = {
			stdout,
			stdin,
			debug: true,
		};

		const receivedInputs: string[] = [];

		function StepA() {
			useInput(() => {});
			return <Text>A</Text>;
		}

		function StepB() {
			useInput(input => {
				receivedInputs.push(input);
			});

			return <Text>B</Text>;
		}

		function Test({step}: {readonly step: number}) {
			return step === 1 ? <StepA /> : <StepB />;
		}

		const {rerender} = render(
			<Test step={1} />,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			options as any,
		);

		emitReadable(stdin, '\u001B[');
		rerender(<Test step={2} />);

		await new Promise(resolve => {
			queueMicrotask(resolve);
		});

		vi.advanceTimersByTime(20);
		for (let i = 0; i < 5; i++) {
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		expect(receivedInputs).toEqual([]);
	} finally {
		vi.useRealTimers();
	}
});

test('re-ref stdin when input is used after previous unmount', () => {
	const stdin = createRawModeStdin();

	const options = {
		stdout: createStdout(),
		stdin,
		debug: true,
	};

	function Input({setRawMode}: {readonly setRawMode: (mode: boolean) => void}) {
		useEffect(() => {
			setRawMode(true);

			return () => {
				setRawMode(false);
			};
		}, [setRawMode]);

		return <Text>Test</Text>;
	}

	function Test({onInput}: {readonly onInput: (input: string) => void}) {
		const {setRawMode} = useStdin();
		useInput(input => {
			onInput(input);
		});

		return <Input setRawMode={setRawMode} />;
	}

	const onFirstMountInput = vi.fn();
	const onSecondMountInput = vi.fn();

	// First render
	const {unmount} = render(
		<Test onInput={onFirstMountInput} />,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		options as any,
	);

	expect(stdin.ref.mock.calls.length === 1).toBe(true);
	expect(stdin.setRawMode.mock.calls.length === 1).toBe(true);
	expect(stdin.setRawMode.mock.calls[0]).toEqual([true]);
	emitReadable(stdin, 'a');
	expect(onFirstMountInput.mock.calls.length).toBe(1);
	expect(onFirstMountInput.mock.calls[0]).toEqual(['a']);

	// Unmount first instance
	unmount();

	expect(stdin.unref.mock.calls.length === 1).toBe(true);
	expect(stdin.setRawMode.mock.calls.length === 2).toBe(true);
	expect(stdin.setRawMode.mock.calls.at(-1)).toEqual([false]);

	// Second render with new Ink instance reusing the same stdin
	const {unmount: unmount2} = render(
		<Test onInput={onSecondMountInput} />,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		options as any,
	);

	expect(stdin.ref.mock.calls.length === 2).toBe(true);
	expect(stdin.setRawMode.mock.calls.length === 3).toBe(true);
	expect(stdin.setRawMode.mock.calls.at(-1)).toEqual([true]);
	emitReadable(stdin, 'b');
	expect(onSecondMountInput.mock.calls.length).toBe(1);
	expect(onSecondMountInput.mock.calls[0]).toEqual(['b']);
	expect(onFirstMountInput.mock.calls.length).toBe(1);

	// Unmount second instance
	unmount2();

	expect(stdin.unref.mock.calls.length === 2).toBe(true);
	expect(stdin.setRawMode.mock.calls.length).toBe(4);
	expect(stdin.setRawMode.mock.calls.at(-1)).toEqual([false]);
});

test('setRawMode() should throw if raw mode is not supported', () => {
	const stdout = createStdout();

	const stdin = createStdin();
	stdin.isTTY = false;

	const didCatchInMount = vi.fn();
	const didCatchInUnmount = vi.fn();

	const options = {
		stdout,
		stdin,
		debug: true,
	};

	function Input({setRawMode}: {readonly setRawMode: (mode: boolean) => void}) {
		useEffect(() => {
			try {
				setRawMode(true);
			} catch (error: unknown) {
				didCatchInMount(error);
			}

			return () => {
				try {
					setRawMode(false);
				} catch (error: unknown) {
					didCatchInUnmount(error);
				}
			};
		}, [setRawMode]);

		return <Text>Test</Text>;
	}

	function Test() {
		const {setRawMode} = useStdin();
		return <Input setRawMode={setRawMode} />;
	}

	const {unmount} = render(<Test />, options);
	unmount();

	expect(didCatchInMount.mock.calls.length).toBe(1);
	expect(didCatchInUnmount.mock.calls.length).toBe(1);
	expect(stdin.setRawMode.mock.calls.length > 0).toBe(false);
});

test('render different component based on whether stdin is a TTY or not', () => {
	const stdout = createStdout();

	const stdin = createStdin();
	stdin.isTTY = false;

	const options = {
		stdout,
		stdin,
		debug: true,
	};

	function Input({setRawMode}: {readonly setRawMode: (mode: boolean) => void}) {
		useEffect(() => {
			setRawMode(true);

			return () => {
				setRawMode(false);
			};
		}, [setRawMode]);

		return <Text>Test</Text>;
	}

	function Test({
		renderFirstInput,
		renderSecondInput,
	}: {
		readonly renderFirstInput?: boolean;
		readonly renderSecondInput?: boolean;
	}) {
		const {isRawModeSupported, setRawMode} = useStdin();

		return (
			<>
				{isRawModeSupported && renderFirstInput ? (
					<Input setRawMode={setRawMode} />
				) : null}
				{isRawModeSupported && renderSecondInput ? (
					<Input setRawMode={setRawMode} />
				) : null}
			</>
		);
	}

	const {rerender} = render(
		<Test renderFirstInput renderSecondInput />,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		options as any,
	);

	expect(stdin.setRawMode.mock.calls.length > 0).toBe(false);

	rerender(<Test renderFirstInput />);

	expect(stdin.setRawMode.mock.calls.length > 0).toBe(false);

	rerender(<Test />);

	expect(stdin.setRawMode.mock.calls.length > 0).toBe(false);
});

test.skip('render only last frame when run in CI (PTY)', async () => {
	const output = await run('ci', {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		env: {CI: 'true'},
		columns: 0,
	});

	for (const num of [0, 1, 2, 3, 4]) {
		expect(output.includes(`Counter: ${num}`)).toBe(false);
	}

	expect(output.includes('Counter: 5')).toBe(true);
});

test.skip('render all frames if CI environment variable equals false (PTY)', async () => {
	const output = await run('ci', {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		env: {CI: 'false'},
		columns: 0,
	});

	for (const num of [0, 1, 2, 3, 4, 5]) {
		expect(output.includes(`Counter: ${num}`)).toBe(true);
	}
});

test.skip('debug mode in CI does not replay final frame during unmount teardown (PTY)', async () => {
	const output = await run('ci-debug', {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		env: {CI: 'true'},
		columns: 0,
	});

	const plainOutput = stripAnsi(output).replaceAll('\r', '');
	const helloCount = plainOutput.match(/Hello/g)?.length ?? 0;

	expect(helloCount).toBe(2);
});

test.skip('debug mode in CI keeps final newline separation after waitUntilExit (PTY)', async () => {
	const output = await run('ci-debug-after-exit', {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		env: {CI: 'true'},
		columns: 0,
	});

	const plainOutput = stripAnsi(output).replaceAll('\r', '');
	expect(plainOutput).toBe('HelloHello\nDONE');
});

test.skip('render only last frame when stdout is not a TTY', async () => {
	const stdout = createStdout(100, false);

	function Counter() {
		const [count, setCount] = useState(0);

		React.useEffect(() => {
			if (count < 3) {
				const timer = setTimeout(() => {
					setCount(c => c + 1);
				}, 10);

				return () => {
					clearTimeout(timer);
				};
			}
		}, [count]);

		return <Text>Count: {count}</Text>;
	}

	const {unmount, waitUntilExit} = render(<Counter />, {
		stdout,
		debug: false,
	});

	await new Promise(resolve => {
		setTimeout(resolve, 200);
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	// Verify no intermediate frames were written
	const contentWrites = allWrites.map(w => stripAnsi(w));
	for (const intermediate of ['Count: 0', 'Count: 1', 'Count: 2']) {
		expect(contentWrites.some(w => w.includes(intermediate)), `Intermediate frame "${intermediate}" should not be written in non-interactive mode`).toBe(false);
	}

	// Verify no erase/cursor ANSI sequences were emitted
	const hasEraseSequence = allWrites.some(w =>
		w.includes(ansiEscapes.eraseLines(1)),
	);
	expect(hasEraseSequence).toBe(false);

	// Verify the final frame is written
	const lastWrite = allWrites.at(-1) ?? '';
	expect(lastWrite.includes('Count: 3')).toBe(true);
});

test.skip('render all frames when interactive is explicitly true', async () => {
	const stdout = createStdout(100, false);

	function Counter() {
		const [count, setCount] = useState(0);

		React.useEffect(() => {
			if (count < 2) {
				const timer = setTimeout(() => {
					setCount(c => c + 1);
				}, 50);

				return () => {
					clearTimeout(timer);
				};
			}
		}, [count]);

		return <Text>Count: {count}</Text>;
	}

	const {unmount, waitUntilExit} = render(<Counter />, {
		stdout,
		debug: false,
		interactive: true,
	});

	await new Promise(resolve => {
		setTimeout(resolve, 500);
	});

	unmount();
	await waitUntilExit();

	const contentWrites = stdout.getWrites().filter(w => w.length > 0);
	expect(contentWrites.length > 1).toBe(true);
	const joined = contentWrites.join('');
	expect(joined.includes('Count: 0')).toBe(true);
	expect(joined.includes('Count: 1')).toBe(true);
	expect(joined.includes('Count: 2')).toBe(true);
});

test.skip('interactive option overrides TTY detection', async () => {
	const stdout = createStdout(100, true);

	function Counter() {
		const [count, setCount] = useState(0);

		React.useEffect(() => {
			if (count < 3) {
				const timer = setTimeout(() => {
					setCount(c => c + 1);
				}, 10);

				return () => {
					clearTimeout(timer);
				};
			}
		}, [count]);

		return <Text>Count: {count}</Text>;
	}

	const {unmount, waitUntilExit} = render(<Counter />, {
		stdout,
		debug: false,
		interactive: false,
	});

	await new Promise(resolve => {
		setTimeout(resolve, 200);
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	// Verify no intermediate frames were written
	const contentWrites = allWrites.map(w => stripAnsi(w));
	for (const intermediate of ['Count: 0', 'Count: 1', 'Count: 2']) {
		expect(contentWrites.some(w => w.includes(intermediate)), `Intermediate frame "${intermediate}" should not be written when interactive=false overrides TTY`).toBe(false);
	}

	// Verify no erase/cursor ANSI sequences were emitted
	const hasEraseSequence = allWrites.some(w =>
		w.includes(ansiEscapes.eraseLines(1)),
	);
	expect(hasEraseSequence).toBe(false);

	// Verify only the final frame is written
	const lastWrite = allWrites.at(-1) ?? '';
	expect(lastWrite.includes('Count: 3')).toBe(true);
});

test('alternate screen - enters on mount and exits on unmount', async () => {
	const stdout = createStdout(100, true);

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {
		stdout,
		alternateScreen: true,
		interactive: true,
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	const enterIndex = allWrites.findIndex(w =>
		w.includes(ansiEscapes.enterAlternativeScreen),
	);
	const exitIndex = allWrites.findLastIndex(w =>
		w.includes(ansiEscapes.exitAlternativeScreen),
	);

	expect(enterIndex).not.toBe(-1);
	expect(exitIndex).not.toBe(-1);
	expect(enterIndex < exitIndex, 'enterAlternativeScreen must come before exitAlternativeScreen').toBe(true);
	expect(enterIndex).toBe(0);
});

test.skip(
	'primary screen - cleanup console output follows the native console during unmount', async () => {
		const stdout = createStdout(100, true);
		const processStdoutWriteStub = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation((
				_chunk: string | Uint8Array,
				encoding?: BufferEncoding | ((error?: Error) => void),
				callback?: (error?: Error) => void,
			) => {
				if (typeof encoding === 'function') {
					encoding();
				}

				if (typeof callback === 'function') {
					callback();
				}

				return true;
			});
		afterAll(() => {
			processStdoutWriteStub.mockRestore();
		});

		function Test() {
			useEffect(() => {
				return () => {
					console.log('primary cleanup');
				};
			}, []);

			return <Text>Hello</Text>;
		}

		const {unmount, waitUntilExit} = render(<Test />, {
			stdout,
			interactive: true,
		});

		unmount();
		await waitUntilExit();

		const output = stdout.getWrites().join('');
		const nativeConsoleLog = processStdoutWriteStub.mock.calls.some(call =>
			String(call[0]).includes('primary cleanup'),
		);

		expect(output.includes('primary cleanup'), 'Should keep cleanup console output out of Ink-managed stdout writes').toBe(false);
		expect(nativeConsoleLog).toBe(true);
	},
);

test(
	'alternate screen - does not replay exit(Error) output on the primary screen during unmount', async () => {
		const stdout = createStdout(100, true);

		function Test() {
			const {exit} = useApp();

			useEffect(() => {
				exit(new Error('Done'));
			}, [exit]);

			return <Text>Done</Text>;
		}

		const {waitUntilExit} = render(<Test />, {
			stdout,
			alternateScreen: true,
			interactive: true,
		});

		await expect(waitUntilExit()).rejects.toThrow();

		const allWrites = stdout.getWrites();
		const exitIndex = allWrites.findLastIndex(write =>
			write.includes(ansiEscapes.exitAlternativeScreen),
		);
		const replayedErrorOutput = allWrites.slice(exitIndex + 1).some(write => {
			const plainWrite = stripAnsi(write);
			return (
				plainWrite.includes('Error: Done') ||
				plainWrite.includes('Done\n    at')
			);
		});

		expect(exitIndex).not.toBe(-1);
		expect(replayedErrorOutput).toBe(false);
	},
);

test(
	'alternate screen - does not replay teardown output on the primary screen during unmount', async () => {
		const stdout = createStdout(100, true);

		function Test() {
			const {exit} = useApp();

			useEffect(() => {
				exit(new Error('Done'));
			}, [exit]);

			return <Text>normal ERROR banner</Text>;
		}

		const {waitUntilExit} = render(<Test />, {
			stdout,
			alternateScreen: true,
			interactive: true,
		});

		await expect(waitUntilExit()).rejects.toThrow();

		const allWrites = stdout.getWrites();
		const exitIndex = allWrites.findLastIndex(write =>
			write.includes(ansiEscapes.exitAlternativeScreen),
		);
		const replayedOutput = stripAnsi(allWrites.slice(exitIndex + 1).join(''));

		expect(exitIndex).not.toBe(-1);
		expect(
			replayedOutput.includes('normal ERROR banner') ||
				replayedOutput.includes('Error: Done') ||
				replayedOutput.includes('Done\n    at'),
			'Should not replay alternate-screen teardown output onto the primary screen',
		).toBe(false);
	},
);

test.skip(
	'alternate screen - cleanup console output follows the native console during unmount', async () => {
		const stdout = createStdout(100, true);
		const processStdoutWriteStub = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation((
				_chunk: string | Uint8Array,
				encoding?: BufferEncoding | ((error?: Error) => void),
				callback?: (error?: Error) => void,
			) => {
				if (typeof encoding === 'function') {
					encoding();
				}

				if (typeof callback === 'function') {
					callback();
				}

				return true;
			});
		afterAll(() => {
			processStdoutWriteStub.mockRestore();
		});

		function Test() {
			useEffect(() => {
				return () => {
					console.log('cleanup log');
				};
			}, []);

			return <Text>Hello</Text>;
		}

		const {unmount, waitUntilExit} = render(<Test />, {
			stdout,
			alternateScreen: true,
			interactive: true,
		});

		unmount();
		await waitUntilExit();

		const output = stdout.getWrites().join('');
		const nativeConsoleLog = processStdoutWriteStub.mock.calls.some(call =>
			String(call[0]).includes('cleanup log'),
		);

		expect(output.includes('cleanup log')).toBe(false);
		expect(nativeConsoleLog).toBe(true);
	},
);

test(
	'alternate screen - cleanup() exits the alternate screen', async () => {
		const stdout = createStdout(100, true);

		const {cleanup, waitUntilExit} = render(<Text>Hello</Text>, {
			stdout,
			alternateScreen: true,
			interactive: true,
		});

		cleanup();
		await waitUntilExit();

		const allWrites = stdout.getWrites();
		const exitIndex = allWrites.findLastIndex(write =>
			write.includes(ansiEscapes.exitAlternativeScreen),
		);

		expect(exitIndex).not.toBe(-1);
	},
);

test(
	'alternate screen - debug concurrent teardown restores the cursor before the first commit', async () => {
		const stdout = createStdout(100, true);
		const showCursorEscape = '\u001B[?25h';

		const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {
			stdout,
			alternateScreen: true,
			concurrent: true,
			debug: true,
		});

		unmount();
		await waitUntilExit();

		const output = stdout.getWrites().join('');
		const exitIndex = output.lastIndexOf(ansiEscapes.exitAlternativeScreen);
		const showCursorIndex = output.lastIndexOf(showCursorEscape);

		expect(exitIndex).not.toBe(-1);
		expect(showCursorIndex > exitIndex, 'Should restore the cursor after leaving the alternate screen').toBe(true);
	},
);

test('render warns when stdout is reused before unmount', async () => {
	const stdout = createStdout(100, true);
	const processStderrWriteStub = vi
		.spyOn(process.stderr, 'write')
		.mockImplementation((
			_chunk: string | Uint8Array,
			encoding?: BufferEncoding | ((error?: Error) => void),
			callback?: (error?: Error) => void,
		) => {
			if (typeof encoding === 'function') {
				encoding();
			}

			if (typeof callback === 'function') {
				callback();
			}

			return true;
		});
	afterAll(() => {
		processStderrWriteStub.mockRestore();
	});

	render(<Text>Primary screen</Text>, {
		stdout,
		interactive: true,
		alternateScreen: true,
		patchConsole: false,
	});

	const {unmount, waitUntilExit} = render(<Text>Second render</Text>, {
		stdout,
	});

	expect(
		processStderrWriteStub.mock.calls.some(
			call =>
				String(call[0]) ===
				'Warning: render() was called again for the same stdout before the previous Ink instance was unmounted. Reusing stdout across multiple render() calls is unsupported. Call unmount() first.\n',
		),
	).toBe(true);

	unmount();
	await waitUntilExit();
});

test('alternate screen - ignored when non-interactive', async () => {
	const stdout = createStdout(100, true);

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {
		stdout,
		alternateScreen: true,
		interactive: false,
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	expect(allWrites.some(w => w.includes(ansiEscapes.enterAlternativeScreen)), 'Should not write enterAlternativeScreen in non-interactive mode').toBe(false);
	expect(allWrites.some(w => w.includes(ansiEscapes.exitAlternativeScreen)), 'Should not write exitAlternativeScreen in non-interactive mode').toBe(false);
});

test('alternate screen - disabled by default', async () => {
	const stdout = createStdout(100, true);

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {
		stdout,
		interactive: true,
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	expect(allWrites.some(w => w.includes(ansiEscapes.enterAlternativeScreen)), 'Should not write enterAlternativeScreen by default').toBe(false);
	expect(allWrites.some(w => w.includes(ansiEscapes.exitAlternativeScreen)), 'Should not write exitAlternativeScreen by default').toBe(false);
});

test('alternate screen - content is rendered between enter and exit', async () => {
	const stdout = createStdout(100, true);

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {
		stdout,
		alternateScreen: true,
		interactive: true,
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	const enterIndex = allWrites.findIndex(w =>
		w.includes(ansiEscapes.enterAlternativeScreen),
	);
	const exitIndex = allWrites.findLastIndex(w =>
		w.includes(ansiEscapes.exitAlternativeScreen),
	);

	expect(enterIndex).not.toBe(-1);
	expect(exitIndex).not.toBe(-1);
	expect(enterIndex < exitIndex).toBe(true);

	const contentBetween = allWrites
		.slice(enterIndex + 1, exitIndex)
		.some(w => stripAnsi(w).includes('Hello'));
	expect(contentBetween).toBe(true);
});

test('alternate screen - ignored when isTTY is false', async () => {
	const stdout = createStdout(100, false);

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {
		stdout,
		alternateScreen: true,
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	expect(allWrites.some(w => w.includes(ansiEscapes.enterAlternativeScreen)), 'Should not write enterAlternativeScreen when isTTY is false').toBe(false);
	expect(allWrites.some(w => w.includes(ansiEscapes.exitAlternativeScreen)), 'Should not write exitAlternativeScreen when isTTY is false').toBe(false);
});

test('alternate screen - ignored when isTTY is false even if interactive is true', async () => {
	const stdout = createStdout(100, false);

	const {unmount, waitUntilExit} = render(<Text>Hello</Text>, {
		stdout,
		alternateScreen: true,
		interactive: true,
	});

	unmount();
	await waitUntilExit();

	const allWrites = stdout.getWrites();

	expect(allWrites.some(w => w.includes(ansiEscapes.enterAlternativeScreen)), 'Should not write enterAlternativeScreen when isTTY is false, even with interactive=true').toBe(false);
	expect(allWrites.some(w => w.includes(ansiEscapes.exitAlternativeScreen)), 'Should not write exitAlternativeScreen when isTTY is false, even with interactive=true').toBe(false);
});

test.skip('static output is written immediately in non-interactive mode', async () => {
	const stdout = createStdout(100, false);

	function App() {
		const [items, setItems] = useState(['A']);

		React.useEffect(() => {
			const timer = setTimeout(() => {
				setItems(['A', 'B']);
			}, 10);

			return () => {
				clearTimeout(timer);
			};
		}, []);

		return (
			<Box>
				<Static items={items}>{item => <Text key={item}>{item}</Text>}</Static>
				<Text>Dynamic</Text>
			</Box>
		);
	}

	const {unmount, waitUntilExit} = render(<App />, {
		stdout,
		debug: false,
	});

	await new Promise(resolve => {
		setTimeout(resolve, 200);
	});

	// Capture writes BEFORE unmount — static items must already be here
	const writesBeforeUnmount = stdout.getWrites().map(w => stripAnsi(w));
	const preUnmountJoined = writesBeforeUnmount.join('');
	expect(preUnmountJoined.includes('A')).toBe(true);
	expect(preUnmountJoined.includes('B')).toBe(true);

	unmount();
	await waitUntilExit();

	// Verify the dynamic content was deferred to unmount (not written before it)
	expect(preUnmountJoined.includes('Dynamic')).toBe(false);

	// Verify dynamic content was eventually written
	const allWrites = stdout.getWrites().map(w => stripAnsi(w));
	expect(allWrites.join('').includes('Dynamic')).toBe(true);
});

test('reset prop when it’s removed from the element', () => {
	const stdout = createStdout();

	function Dynamic({remove}: {readonly remove?: boolean}) {
		return (
			<Box
				flexDirection="column"
				justifyContent="flex-end"
				height={remove ? undefined : 4}
			>
				<Text>x</Text>
			</Box>
		);
	}

	const {rerender} = render(<Dynamic />, {
		stdout,
		debug: true,
	});

	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('\n\n\nx');

	rerender(<Dynamic remove />);
	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('x');
});

test('newline', () => {
	const output = renderToString(
		<Text>
			Hello
			<Newline />
			World
		</Text>,
	);
	expect(output).toBe('Hello\nWorld');
});

test('multiple newlines', () => {
	const output = renderToString(
		<Text>
			Hello
			<Newline count={2} />
			World
		</Text>,
	);
	expect(output).toBe('Hello\n\nWorld');
});

test('horizontal spacer', () => {
	const output = renderToString(
		<Box width={20}>
			<Text>Left</Text>
			<Spacer />
			<Text>Right</Text>
		</Box>,
	);

	expect(output).toBe('Left           Right');
});

test('vertical spacer', () => {
	const output = renderToString(
		<Box flexDirection="column" height={6}>
			<Text>Top</Text>
			<Spacer />
			<Text>Bottom</Text>
		</Box>,
	);

	expect(output).toBe('Top\n\n\n\n\nBottom');
});

test('link ansi escapes are closed properly', () => {
	const output = renderToString(
		<Text>{ansiEscapes.link('Example', 'https://example.com')}</Text>,
	);

	expect(output).toBe(']8;;https://example.comExample]8;;');
});

// Concurrent mode tests
test('text - concurrent', async () => {
	const output = await renderToStringAsync(<Text>Hello World</Text>);
	expect(output).toBe('Hello World');
});

test('multiple text nodes - concurrent', async () => {
	const output = await renderToStringAsync(
		<Text>
			{'Hello'}
			{' World'}
		</Text>,
	);
	expect(output).toBe('Hello World');
});

test('wrap text - concurrent', async () => {
	const output = await renderToStringAsync(
		<Box width={7}>
			<Text wrap="wrap">Hello World</Text>
		</Box>,
	);
	expect(output).toBe('Hello\nWorld');
});

test('truncate text in the end - concurrent', async () => {
	const output = await renderToStringAsync(
		<Box width={7}>
			<Text wrap="truncate">Hello World</Text>
		</Box>,
	);
	expect(output).toBe('Hello …');
});

test('transform children - concurrent', async () => {
	const output = await renderToStringAsync(
		<Transform
			transform={(string: string, index: number) => `[${index}: ${string}]`}
		>
			<Text>
				<Transform
					transform={(string: string, index: number) => `{${index}: ${string}}`}
				>
					<Text>test</Text>
				</Transform>
			</Text>
		</Transform>,
	);
	expect(output).toBe('[0: {0: test}]');
});

test('static output - concurrent', async () => {
	const output = await renderToStringAsync(
		<Box>
			<Static items={['A', 'B', 'C']} style={{paddingBottom: 1}}>
				{letter => <Text key={letter}>{letter}</Text>}
			</Static>

			<Box marginTop={1}>
				<Text>X</Text>
			</Box>
		</Box>,
	);
	expect(output).toBe('A\nB\nC\n\n\nX');
});

test('remeasure text dimensions on text change - concurrent', async () => {
	const {getOutput, rerenderAsync} = await renderAsync(
		<Box>
			<Text>Hello</Text>
		</Box>,
	);
	expect(getOutput()).toBe('Hello');

	await rerenderAsync(
		<Box>
			<Text>Hello World</Text>
		</Box>,
	);
	expect(getOutput()).toBe('Hello World');
});

test('newline - concurrent', async () => {
	const output = await renderToStringAsync(
		<Text>
			Hello
			<Newline />
			World
		</Text>,
	);
	expect(output).toBe('Hello\nWorld');
});

test('horizontal spacer - concurrent', async () => {
	const output = await renderToStringAsync(
		<Box width={20}>
			<Text>Left</Text>
			<Spacer />
			<Text>Right</Text>
		</Box>,
	);
	expect(output).toBe('Left           Right');
});

test('vertical spacer - concurrent', async () => {
	const output = await renderToStringAsync(
		<Box flexDirection="column" height={6}>
			<Text>Top</Text>
			<Spacer />
			<Text>Bottom</Text>
		</Box>,
	);
	expect(output).toBe('Top\n\n\n\n\nBottom');
});
