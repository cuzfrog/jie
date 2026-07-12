/**
 * Reverse-video overlay for the in-app selection. After every layout commit,
 * if there is an active selection, paints cursor-positioned cells with the
 * underlying character wrapped in SGR 7 (reverse video). Because the
 * character is preserved — not overwritten with a blank — the highlighted
 * text stays legible, matching the native terminal's selection look.
 *
 * The overlay knows nothing about what is below it; Ink's own frame is
 * already flushed by the time the overlay runs. Writes are bracketed with
 * `\x1b[s` / `\x1b[u` (save / restore cursor) so the next Ink frame does
 * not inherit the cursor position.
 *
 * On selection clear (release, reset, dispose) the overlay writes a final
 * "restore" frame: the same cells, with the underlying character but
 * WITHOUT SGR 7. That overwrites the highlighted blocks with the original
 * glyph in normal video, which is what makes the highlight disappear. A
 * bare save/restore cursor write would leave the blocks in place — that
 * was the previous bug.
 */

import type {CellPosition, Selection, SelectionPoint} from './selection-engine.js';

export type SelectionGetter = () => Selection | null;
export type Materializer = () => ReadonlyArray<ReadonlyArray<CellPosition>>;

export interface OverlayHandle {
	/** Detach the overlay listener. */
	dispose: () => void;
	/** Clear the highlight once (e.g. after release). Does not detach. */
	clearOnce: () => void;
	/** Paint the current selection (if any) by writing the overlay frame. */
	paint: () => void;
}

const CSI = '\x1b[';

const SAVE_CURSOR = `${CSI}s`;
const RESTORE_CURSOR = `${CSI}u`;
const REVERSE_VIDEO_ON = `${CSI}7m`;
const REVERSE_VIDEO_OFF = `${CSI}27m`;
const RESET_SGR = `${CSI}0m`;

const moveCursor = (row: number, column: number): string =>
	`${CSI}${row};${column}H`;

/**
 * For each row in [first.row, last.row] return a sorted list of cells
 * whose column falls inside that row's selection range. Returns a map
 * keyed by 1-based row number, value being cells in column order. The
 * caller uses the cells to emit the underlying character — never a
 * blank — so the highlight does not occlude the text.
 */
const collectSelectedCells = (
	grid: ReadonlyArray<ReadonlyArray<CellPosition>>,
	first: SelectionPoint,
	last: SelectionPoint,
): Map<number, CellPosition[]> => {
	const out = new Map<number, CellPosition[]>();
	for (let r = first.row; r <= last.row; r += 1) {
		const row = grid[r - 1];
		if (row === undefined) continue;
		const startCol = r === first.row ? first.column : 1;
		const endCol = r === last.row ? last.column : Number.POSITIVE_INFINITY;
		const keep: CellPosition[] = [];
		for (const cell of row) {
			if (cell.column > endCol) break;
			if (cell.column + cell.text.length - 1 < startCol) continue;
			keep.push(cell);
		}
		if (keep.length > 0) out.set(r, keep);
	}
	return out;
};

const normalize = (selection: Selection): {first: SelectionPoint; last: SelectionPoint} => {
	const first =
		selection.anchor.row < selection.head.row ||
		(selection.anchor.row === selection.head.row && selection.anchor.column <= selection.head.column)
			? selection.anchor
			: selection.head;
	const last = first === selection.anchor ? selection.head : selection.anchor;
	return {first, last};
};

/**
 * Active selection frame: cursor-positioned chars wrapped in SGR 7m.
 * The underlying character is preserved (not a blank space) so the
 * highlighted text stays legible.
 */
export const buildOverlayFrame = (
	selection: Selection,
	materializer: Materializer,
): string => {
	const grid = materializer();
	const {first, last} = normalize(selection);
	const rows = collectSelectedCells(grid, first, last);
	if (rows.size === 0) return '';
	let out = SAVE_CURSOR;
	for (const [rowNum, cells] of rows) {
		for (const cell of cells) {
			out += moveCursor(rowNum, cell.column);
			out += cell.sgr;
			out += REVERSE_VIDEO_ON;
			out += cell.text;
			out += REVERSE_VIDEO_OFF;
			out += RESET_SGR;
		}
	}
	out += RESTORE_CURSOR;
	return out;
};

/**
 * Restore frame: same cells, same chars, but WITHOUT the SGR 7 brackets.
 * Used after release so the highlighted cells collapse back to the
 * underlying characters in normal video. This is what makes the highlight
 * disappear — a save/restore cursor write alone leaves the painted cells
 * on screen.
 */
export const buildClearFrame = (
	lastSelection: Selection,
	materializer: Materializer,
): string => {
	const grid = materializer();
	const {first, last} = normalize(lastSelection);
	const rows = collectSelectedCells(grid, first, last);
	if (rows.size === 0) return '';
	let out = SAVE_CURSOR;
	for (const [rowNum, cells] of rows) {
		for (const cell of cells) {
			out += moveCursor(rowNum, cell.column);
			out += cell.sgr;
			out += cell.text;
			out += RESET_SGR;
		}
	}
	out += RESTORE_CURSOR;
	return out;
};

export const installOverlay = (
	write: (chunk: string) => void,
	getSelection: SelectionGetter,
	materializer: Materializer,
): OverlayHandle => {
	let painted = false;
	let lastPainted: Selection | null = null;
	const paint = (): void => {
		const selection = getSelection();
		if (selection === null) {
			if (painted && lastPainted !== null) {
				const clear = buildClearFrame(lastPainted, materializer);
				if (clear.length > 0) write(clear);
				painted = false;
				lastPainted = null;
			}
			return;
		}
		const frame = buildOverlayFrame(selection, materializer);
		if (frame.length === 0) return;
		write(frame);
		painted = true;
		lastPainted = selection;
	};
	return {
		dispose: (): void => {
			painted = false;
			lastPainted = null;
		},
		clearOnce: (): void => {
			painted = false;
			lastPainted = null;
		},
		paint,
	};
};
