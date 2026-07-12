/**
 * Mouse-driven text-selection engine. Installs exactly one `input` listener
 * on the Ink root event emitter so the engine sees every SGR mouse event
 * regardless of which component handled it.
 *
 * The emitter fires raw byte chunks; the engine parses them itself with the
 * shared `parseKeypress` so it doesn't depend on any consumer's parser setup.
 *
 * State transitions:
 *   press (button=0, terminator=press)     -> set anchor + head, mark dragStart
 *   drag (button=32, terminator=press)     -> update head, hasDragged=true
 *   release (button=0, terminator=release) -> if hasDragged, finalize + copy
 *
 * `hasDragged` enforces the "click without motion does nothing" rule. A bare
 * press-release (no drag in between) is treated as a click and produces no
 * clipboard write; this matches how native terminals behave when you click
 * outside any selection context.
 */

import type {EventEmitter} from 'node:events';
import parseKeypress, {type ParsedMouseEvent} from '../parse-keypress.js';

export interface SelectionPoint {
	readonly row: number;
	readonly column: number;
}

export interface Selection {
	readonly anchor: SelectionPoint;
	readonly head: SelectionPoint;
}

export interface CellPosition {
	readonly row: number;
	readonly column: number;
	readonly text: string;
	/**
	 * SGR prefix that was active when the cell was painted. The overlay
	 * writes `<sgr><char>` on restore so the cell keeps its original
	 * styling — without this, fg/bg set by Ink's chalk wrap would be lost
	 * (e.g. grey text becoming white). Empty for cells without styling
	 * (box border glyphs, default-styled text).
	 */
	readonly sgr: string;
}

export type Materializer = () => ReadonlyArray<ReadonlyArray<CellPosition>>;

export interface CopyResult {
	readonly written: boolean;
	readonly text: string;
	readonly reason?: string;
}

export type WriteClipboardFn = (text: string) => CopyResult;

export interface EngineDeps {
	readonly materializer: Materializer;
	readonly writeClipboard: WriteClipboardFn;
	readonly onSelectionChange?: (selection: Selection | null) => void;
}

export interface SelectionEngine {
	/** Returns the active selection or null. */
	getSelection(): Selection | null;
	/** Resets the engine state (clears any in-progress drag, no copy fires). */
	reset(): void;
	/** Detach the event listener. */
	dispose(): void;
}

const LEFT_BUTTON = 0;
const MOTION_BUTTON_BIT = 32;

function classify(
	button: number,
	terminator: 'press' | 'release',
): 'press' | 'drag' | 'release' {
	if (terminator === 'release') return 'release';
	if ((button & MOTION_BUTTON_BIT) !== 0) return 'drag';
	return 'press';
}

/**
 * Extract the text between anchor and head inclusive from the materializer grid.
 * Rows are joined with '\n'; each row's column range is clipped to the cells
 * that actually exist there. Anchor/head order is normalized.
 */
export function extractText(
	anchor: SelectionPoint,
	head: SelectionPoint,
	grid: ReadonlyArray<ReadonlyArray<CellPosition>>,
): string {
	const first =
		anchor.row < head.row || (anchor.row === head.row && anchor.column <= head.column)
			? anchor
			: head;
	const last = first === anchor ? head : anchor;
	const parts: string[] = [];
	for (let r = first.row; r <= last.row; r += 1) {
		const row = grid[r - 1];
		if (row === undefined) continue;
		const startCol = r === first.row ? first.column : 1;
		const endCol = r === last.row ? last.column : Number.POSITIVE_INFINITY;
		let line = '';
		for (const cell of row) {
			if (cell.column > endCol) break;
			if (cell.column + cell.text.length - 1 < startCol) continue;
			const trimStart = Math.max(0, startCol - cell.column);
			const trimEnd = Math.min(cell.text.length, endCol - cell.column + 1);
			if (trimStart >= trimEnd) continue;
			line += cell.text.slice(trimStart, trimEnd);
		}
		parts.push(line);
	}
	return parts.join('\n');
}

export function installSelectionEngine(
	emitter: EventEmitter,
	deps: EngineDeps,
): SelectionEngine {
	let selection: Selection | null = null;
	let dragStart: SelectionPoint | null = null;
	let hasDragged = false;

	const notify = (): void => {
		deps.onSelectionChange?.(selection);
	};

	const onInput = (chunk: string): void => {
		const parsed = parseKeypress(chunk);
		const m: ParsedMouseEvent | undefined = parsed.mouse;
		if (m === undefined) return;
		const kind = classify(m.button, m.terminator);
		if (kind === 'press' && m.button === LEFT_BUTTON) {
			dragStart = {row: m.y, column: m.x};
			hasDragged = false;
			selection = {anchor: dragStart, head: {row: m.y, column: m.x}};
			notify();
			return;
		}
		if (kind === 'drag' && dragStart !== null) {
			hasDragged = true;
			selection = {anchor: dragStart, head: {row: m.y, column: m.x}};
			notify();
			return;
		}
		if (kind === 'release' && dragStart !== null) {
			const start = dragStart;
			dragStart = null;
			const finalSelection: Selection = selection ?? {
				anchor: start,
				head: {row: m.y, column: m.x},
			};
			selection = null;
			notify();
			if (!hasDragged) return;
			hasDragged = false;
			const grid = deps.materializer();
			const text = extractText(finalSelection.anchor, finalSelection.head, grid);
			if (text.length === 0) return;
			deps.writeClipboard(text);
		}
	};

	emitter.on('input', onInput);

	return {
		getSelection: (): Selection | null => selection,
		reset: (): void => {
			if (selection !== null || dragStart !== null || hasDragged) {
				selection = null;
				dragStart = null;
				hasDragged = false;
				notify();
			}
		},
		dispose: (): void => {
			emitter.off('input', onInput);
			selection = null;
			dragStart = null;
			hasDragged = false;
		},
	};
}