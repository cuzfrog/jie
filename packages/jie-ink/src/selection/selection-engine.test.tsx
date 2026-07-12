import {EventEmitter} from 'node:events';
import {
	installSelectionEngine,
	extractText,
	type CellPosition,
	type Materializer,
	type SelectionEngine,
	type WriteClipboardFn,
} from './selection-engine.js';

const ESC = String.fromCharCode(0x1b);

const press = (button: number, x: number, y: number): string => `${ESC}[<${button};${x};${y}M`;
const release = (button: number, x: number, y: number): string => `${ESC}[<${button};${x};${y}m`;

const makeGrid = (rows: ReadonlyArray<ReadonlyArray<CellPosition>>): Materializer => () => rows;

const blankGrid: ReadonlyArray<ReadonlyArray<CellPosition>> = [
	[
		{row: 1, column: 1, text: 'h'},
		{row: 1, column: 2, text: 'i'},
		{row: 1, column: 3, text: '!'},
		{row: 1, column: 4, text: '!'},
	],
	[
		{row: 2, column: 1, text: 'b'},
		{row: 2, column: 2, text: 'y'},
		{row: 2, column: 3, text: 'e'},
		{row: 2, column: 4, text: '!'},
	],
];

const leftClick = (x: number, y: number): {press: string; release: string} => ({
	press: press(0, x, y),
	release: release(0, x, y),
});

const motion = (x: number, y: number): string => press(32, x, y);

describe('installSelectionEngine', () => {
	let emitter: EventEmitter;
	let engine: SelectionEngine;
	let copies: string[];
	let writeClipboard: WriteClipboardFn;
	let materializer: Materializer;

	beforeEach(() => {
		emitter = new EventEmitter();
		copies = [];
		materializer = makeGrid(blankGrid);
		writeClipboard = (text) => {
			copies.push(text);
			return {written: true, text};
		};
	});

	const install = (onChange?: (s: {readonly anchor: {readonly row: number; readonly column: number}; readonly head: {readonly row: number; readonly column: number}} | null) => void): SelectionEngine => {
		engine = installSelectionEngine(emitter, {materializer, writeClipboard, onSelectionChange: onChange});
		return engine;
	};

	test('press -> drag -> release selects text and writes clipboard once', () => {
		const onChange = vi.fn();
		install(onChange);
		emitter.emit('input', press(0, 1, 1));
		expect(engine.getSelection()).not.toBeNull();
		emitter.emit('input', motion(3, 1));
		expect(engine.getSelection()).toEqual({anchor: {row: 1, column: 1}, head: {row: 1, column: 3}});
		emitter.emit('input', release(0, 3, 1));
		expect(engine.getSelection()).toBeNull();
		expect(copies).toEqual(['hi!']);
		expect(onChange).toHaveBeenCalledTimes(3);
	});

	test('press -> release with no drag does NOT write to clipboard', () => {
		install();
		const {press: p, release: r} = leftClick(2, 1);
		emitter.emit('input', p);
		emitter.emit('input', r);
		expect(engine.getSelection()).toBeNull();
		expect(copies).toEqual([]);
	});

	test('press -> drag -> release across two rows joins lines with newline', () => {
		install();
		emitter.emit('input', press(0, 2, 1));
		emitter.emit('input', motion(3, 2));
		emitter.emit('input', release(0, 3, 2));
		expect(copies).toEqual(['i!!\nbye']);
	});

	test('right-button press is ignored', () => {
		install();
		emitter.emit('input', press(2, 1, 1));
		emitter.emit('input', motion(3, 1));
		emitter.emit('input', release(2, 3, 1));
		expect(copies).toEqual([]);
		expect(engine.getSelection()).toBeNull();
	});

	test('non-mouse input is ignored', () => {
		install();
		emitter.emit('input', 'a');
		emitter.emit('input', 'x');
		expect(engine.getSelection()).toBeNull();
		expect(copies).toEqual([]);
	});

	test('dispose detaches listener and clears state', () => {
		install();
		emitter.emit('input', press(0, 1, 1));
		expect(engine.getSelection()).not.toBeNull();
		engine.dispose();
		expect(engine.getSelection()).toBeNull();
		emitter.emit('input', motion(3, 1));
		emitter.emit('input', release(0, 3, 1));
		expect(copies).toEqual([]);
	});

	test('reset() clears an in-progress drag without writing clipboard', () => {
		install();
		emitter.emit('input', press(0, 1, 1));
		emitter.emit('input', motion(3, 1));
		engine.reset();
		expect(engine.getSelection()).toBeNull();
		emitter.emit('input', release(0, 3, 1));
		expect(copies).toEqual([]);
	});

	test('release with no prior press is a no-op', () => {
		install();
		emitter.emit('input', release(0, 1, 1));
		expect(copies).toEqual([]);
	});
});

describe('extractText', () => {
	const grid = blankGrid;

	test('same-row forward: columns 1..3 -> hi!', () => {
		expect(extractText({row: 1, column: 1}, {row: 1, column: 3}, grid)).toBe('hi!');
	});

	test('same-row reverse: head < anchor still works', () => {
		expect(extractText({row: 1, column: 3}, {row: 1, column: 1}, grid)).toBe('hi!');
	});

	test('multi-row reverse: anchor below head, both rows clipped to materializer extent', () => {
		expect(extractText({row: 2, column: 3}, {row: 1, column: 2}, grid)).toBe('i!!\nbye');
	});

	test('selection that begins/ends mid-cell trims correctly', () => {
		expect(extractText({row: 1, column: 2}, {row: 1, column: 2}, grid)).toBe('i');
	});
});