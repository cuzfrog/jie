import {
	buildClearFrame,
	buildOverlayFrame,
	installOverlay,
	type Materializer,
	type SelectionGetter,
} from './overlay.js';
import type {CellPosition, Selection} from './selection-engine.js';

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import('bun:test').expect;

const CSI = '\x1b[';
const SAVE = `${CSI}s`;
const RESTORE = `${CSI}u`;
const REVERSE_ON = `${CSI}7m`;
const REVERSE_OFF = `${CSI}27m`;
const RESET = `${CSI}0m`;
const MOVE = (r: number, c: number): string => `${CSI}${r};${c}H`;

// Each cell carries the SGR prefix that was active when Ink painted it.
// Real cells come from the materializer (which threads `internal_transform`
// from `<Text>` and parses the styled output). For these unit tests we
// hard-code the prefix to match the overlay's expected behavior.
const FG = `${CSI}90m`;
const grid: ReadonlyArray<ReadonlyArray<CellPosition>> = [
	[
		{row: 1, column: 1, text: 'h', sgr: FG},
		{row: 1, column: 2, text: 'i', sgr: FG},
		{row: 1, column: 3, text: '!', sgr: FG},
	],
	[
		{row: 2, column: 1, text: 'b', sgr: FG},
		{row: 2, column: 2, text: 'y', sgr: FG},
	],
];

const mat: Materializer = () => grid;

describe('buildOverlayFrame', () => {
	test('single-row selection paints each cell with its underlying char in reverse-video', () => {
		const sel: Selection = {anchor: {row: 1, column: 1}, head: {row: 1, column: 3}};
		const frame = buildOverlayFrame(sel, mat);
		expect(frame.startsWith(SAVE)).toBe(true);
		expect(frame.endsWith(RESTORE)).toBe(true);
		expect(frame).toContain(`${MOVE(1, 1)}${FG}${REVERSE_ON}h${REVERSE_OFF}${RESET}`);
		expect(frame).toContain(`${MOVE(1, 2)}${FG}${REVERSE_ON}i${REVERSE_OFF}${RESET}`);
		expect(frame).toContain(`${MOVE(1, 3)}${FG}${REVERSE_ON}!${REVERSE_OFF}${RESET}`);
		// No blank spaces occluding the text.
		expect(frame).not.toContain(`${REVERSE_ON} ${REVERSE_OFF}`);
	});

	test('multi-row selection paints each cell across rows', () => {
		const sel: Selection = {anchor: {row: 1, column: 2}, head: {row: 2, column: 2}};
		const frame = buildOverlayFrame(sel, mat);
		expect(frame).toContain(`${MOVE(1, 2)}${FG}${REVERSE_ON}i${REVERSE_OFF}${RESET}`);
		expect(frame).toContain(`${MOVE(1, 3)}${FG}${REVERSE_ON}!${REVERSE_OFF}${RESET}`);
		expect(frame).toContain(`${MOVE(2, 1)}${FG}${REVERSE_ON}b${REVERSE_OFF}${RESET}`);
		expect(frame).toContain(`${MOVE(2, 2)}${FG}${REVERSE_ON}y${REVERSE_OFF}${RESET}`);
	});

	test('reverse-order selection still normalizes', () => {
		const sel: Selection = {anchor: {row: 1, column: 3}, head: {row: 1, column: 1}};
		const frame = buildOverlayFrame(sel, mat);
		expect(frame).toContain(`${MOVE(1, 1)}${FG}${REVERSE_ON}h${REVERSE_OFF}${RESET}`);
		expect(frame).toContain(`${MOVE(1, 2)}${FG}${REVERSE_ON}i${REVERSE_OFF}${RESET}`);
		expect(frame).toContain(`${MOVE(1, 3)}${FG}${REVERSE_ON}!${REVERSE_OFF}${RESET}`);
	});

	test('selection outside grid returns empty string', () => {
		const sel: Selection = {anchor: {row: 5, column: 1}, head: {row: 5, column: 3}};
		const frame = buildOverlayFrame(sel, mat);
		expect(frame).toBe('');
	});
});

describe('buildClearFrame', () => {
	test('emits underlying chars WITHOUT reverse-video at lastSelection cells', () => {
		const sel: Selection = {anchor: {row: 1, column: 1}, head: {row: 1, column: 2}};
		const frame = buildClearFrame(sel, mat);
		expect(frame.startsWith(SAVE)).toBe(true);
		expect(frame.endsWith(RESTORE)).toBe(true);
		expect(frame).toContain(`${MOVE(1, 1)}${FG}h${RESET}`);
		expect(frame).toContain(`${MOVE(1, 2)}${FG}i${RESET}`);
		expect(frame).not.toContain(REVERSE_ON);
	});

	test('returns empty string for selection outside grid', () => {
		const sel: Selection = {anchor: {row: 99, column: 1}, head: {row: 99, column: 1}};
		const frame = buildClearFrame(sel, mat);
		expect(frame).toBe('');
	});
});

describe('installOverlay', () => {
	test('writes frame when selection is set; restores cells when selection clears', () => {
		let sel: Selection | null = null;
		const writes: string[] = [];
		const handle = installOverlay((chunk) => writes.push(chunk), () => sel, mat);
		sel = {anchor: {row: 1, column: 1}, head: {row: 1, column: 2}};
		handle.paint();
		expect(writes.length).toBe(1);
		expect(writes[0]).toContain(SAVE);
		expect(writes[0]).toContain(REVERSE_ON);
		sel = null;
		handle.paint();
		// Clear frame: same cells, chars, no SGR 7 — restores the original glyph
		// WITH its fg SGR prefix so grey text stays grey after release.
		expect(writes.length).toBe(2);
		expect(writes[1]).toContain(MOVE(1, 1) + FG + 'h');
		expect(writes[1]).not.toContain(REVERSE_ON);
		// After clear, the next paint with null is a no-op (already cleared).
		handle.paint();
		expect(writes.length).toBe(2);
	});

	test('paint with null and never painted is a no-op', () => {
		const writes: string[] = [];
		const handle = installOverlay((chunk) => writes.push(chunk), () => null, mat);
		handle.paint();
		expect(writes).toEqual([]);
	});

	test('getSelection called every paint', () => {
		let calls = 0;
		const get: SelectionGetter = () => {
			calls += 1;
			return null;
		};
		const handle = installOverlay(() => {}, get, mat);
		handle.paint();
		handle.paint();
		expect(calls).toBe(2);
	});
});