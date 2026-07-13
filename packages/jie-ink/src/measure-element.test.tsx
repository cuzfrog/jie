import {useState, useRef, useEffect, useLayoutEffect} from 'react';
import delay from 'delay';
import stripAnsi from 'strip-ansi';
import {
	Box,
	Text,
	render,
	measureElement,
	type DOMElement,
} from './index.js';
import createStdout from '../test/helpers/create-stdout.js';

test('measure element', async () => {
	const stdout = createStdout();

	function Test() {
		const [width, setWidth] = useState(0);
		const ref = useRef<DOMElement>(null);

		useEffect(() => {
			if (!ref.current) {
				return;
			}

			setWidth(measureElement(ref.current).width);
		}, []);

		return (
			<Box ref={ref}>
				<Text>Width: {width}</Text>
			</Box>
		);
	}

	render(<Test />, {stdout, debug: true});
	expect((stdout.write as any).mock.calls[0]?.[0]).toBe('Width: 0');
	await delay(100);
	expect((stdout.write as any).mock.calls.at(-1)?.[0]).toBe('Width: 100');
});

test('measure element after state update', async () => {
	const stdout = createStdout();
	let setTestItems!: (items: string[]) => void;

	function Test() {
		const [items, setItems] = useState<string[]>([]);
		const [height, setHeight] = useState(0);
		const ref = useRef<DOMElement>(null);

		setTestItems = setItems;

		useEffect(() => {
			if (!ref.current) {
				return;
			}

			setHeight(measureElement(ref.current).height);
		}, [items.length]);

		return (
			<Box flexDirection="column">
				<Box ref={ref} flexDirection="column">
					{items.map(item => (
						<Text key={item}>{item}</Text>
					))}
				</Box>
				<Text>Height: {height}</Text>
			</Box>
		);
	}

	render(<Test />, {stdout, debug: true});
	await delay(50);

	setTestItems(['line 1', 'line 2', 'line 3']);
	await delay(50);

	expect(stripAnsi((stdout.write as any).mock.calls.at(-1)?.[0] as string).trim()).toBe('line 1\nline 2\nline 3\nHeight: 3');
});

test('measure element after multiple state updates', async () => {
	const stdout = createStdout();
	let setTestItems!: (items: string[]) => void;

	function Test() {
		const [items, setItems] = useState<string[]>([]);
		const [height, setHeight] = useState(0);
		const ref = useRef<DOMElement>(null);

		setTestItems = setItems;

		useEffect(() => {
			if (!ref.current) {
				return;
			}

			setHeight(measureElement(ref.current).height);
		}, [items.length]);

		return (
			<Box flexDirection="column">
				<Box ref={ref} flexDirection="column">
					{items.map(item => (
						<Text key={item}>{item}</Text>
					))}
				</Box>
				<Text>Height: {height}</Text>
			</Box>
		);
	}

	render(<Test />, {stdout, debug: true});
	await delay(50);

	setTestItems(['line 1', 'line 2', 'line 3']);
	await delay(50);

	setTestItems(['line 1']);
	await delay(50);

	expect(stripAnsi((stdout.write as any).mock.calls.at(-1)?.[0] as string).trim()).toBe('line 1\nHeight: 1');
});

test('measure element in useLayoutEffect after state update', async () => {
	const stdout = createStdout();
	let setTestItems!: (items: string[]) => void;

	function Test() {
		const [items, setItems] = useState<string[]>([]);
		const [height, setHeight] = useState(0);
		const ref = useRef<DOMElement>(null);

		setTestItems = setItems;

		useLayoutEffect(() => {
			if (!ref.current) {
				return;
			}

			setHeight(measureElement(ref.current).height);
		}, [items.length]);

		return (
			<Box flexDirection="column">
				<Box ref={ref} flexDirection="column">
					{items.map(item => (
						<Text key={item}>{item}</Text>
					))}
				</Box>
				<Text>Height: {height}</Text>
			</Box>
		);
	}

	render(<Test />, {stdout, debug: true});
	await delay(50);

	setTestItems(['line 1', 'line 2', 'line 3']);
	await delay(50);

	expect(stripAnsi((stdout.write as any).mock.calls.at(-1)?.[0] as string).trim()).toBe('line 1\nline 2\nline 3\nHeight: 3');
});

test('calculate layout while rendering is throttled', async () => {
	const stdout = createStdout();

	function Test() {
		const [width, setWidth] = useState(0);
		const ref = useRef<DOMElement>(null);

		useEffect(() => {
			if (!ref.current) {
				return;
			}

			setWidth(measureElement(ref.current).width);
		}, []);

		return (
			<Box ref={ref}>
				<Text>Width: {width}</Text>
			</Box>
		);
	}

	const {rerender} = render(null, {stdout, patchConsole: false, interactive: true});
	rerender(<Test />);
	await delay(50);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
	const writes: string[] = (stdout.write as any).mock.calls
		.map((args: unknown[]) => args[0] as string)
		.filter(
			(w: string) =>
				!w.startsWith('\u001B[?25') && !w.startsWith('\u001B[?2026'),
		);
	const lastContentWrite = writes.at(-1)!;

	expect(stripAnsi(lastContentWrite).trim()).toBe('Width: 100');
});
