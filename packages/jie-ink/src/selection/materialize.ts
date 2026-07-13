/**
 * Materialize the current Ink DOM tree as a 2D grid of cells indexed by
 * 1-based (row, column) — the same coordinate system the terminal emits in
 * SGR mouse events. The grid covers EVERY on-screen glyph: text content
 * from `<Text>` nodes, AND box border glyphs (corners, edges), so that
 * dragging across borders copies them like native terminal selection.
 *
 * Each `ink-text` cell carries the active SGR prefix Ink emitted for it
 * (e.g. `\e[90m` for grey text). The overlay uses that prefix to restore
 * the cell on release — without it, a cell whose Ink paint was
 * `\e[90m...char...\e[39m` would be restored as default-fg (white) and
 * the user would see "grey text became white."
 *
 * Implementation: walk the rendered tree recursively. For each `ink-text`
 * node, run it through Ink's own `squashTextNodes` (which applies the
 * chalk-wrapped transforms), then walk the SGR-bearing string and emit
 * one `CellPosition` per character at the absolute Yoga-computed top-left.
 * For each `ink-box` with `borderStyle`, emit the box's own glyph cells at
 * the box's own Yoga position (the same ones `renderBorder` paints);
 * border glyphs have no SGR styling.
 */

import Yoga from 'yoga-layout';
import cliBoxes from 'cli-boxes';
import chalk from 'chalk';
import widestLine from 'widest-line';
import colorize from '../colorize.js';
import type {DOMElement, DOMNode} from '../dom.js';
import type {CellPosition} from './selection-engine.js';
import wrapTextFn from '../wrap-text.js';
import squashTextNodes from '../squash-text-nodes.js';

type Grid = CellPosition[][];

interface BoxChars {
	readonly topLeft: string;
	readonly topRight: string;
	readonly bottomLeft: string;
	readonly bottomRight: string;
	readonly horizontal: string;
	readonly vertical: string;
}

interface SgrState {
	readonly fg: readonly number[];
	readonly bg: readonly number[];
	readonly bold: boolean;
	readonly dim: boolean;
	readonly italic: boolean;
	readonly underline: boolean;
	readonly strikethrough: boolean;
}

const EMPTY_STATE: SgrState = {
	fg: [],
	bg: [],
	bold: false,
	dim: false,
	italic: false,
	underline: false,
	strikethrough: false,
};

const updateState = (state: SgrState, params: readonly number[]): SgrState => {
	let fg = state.fg;
	let bg = state.bg;
	let bold = state.bold;
	let dim = state.dim;
	let italic = state.italic;
	let underline = state.underline;
	let strikethrough = state.strikethrough;
	let i = 0;
	while (i < params.length) {
		const p = params[i] ?? 0;
		if (p === 0) {
			fg = [];
			bg = [];
			bold = false;
			dim = false;
			italic = false;
			underline = false;
			strikethrough = false;
		} else if (p === 1) {
			bold = true;
		} else if (p === 2) {
			dim = true;
		} else if (p === 3) {
			italic = true;
		} else if (p === 4) {
			underline = true;
		} else if (p === 9) {
			strikethrough = true;
		} else if (p === 22) {
			bold = false;
			dim = false;
		} else if (p === 23) {
			italic = false;
		} else if (p === 24) {
			underline = false;
		} else if (p === 29) {
			strikethrough = false;
		} else if (p === 39) {
			fg = [];
		} else if (p === 49) {
			bg = [];
		} else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) {
			fg = [p];
		} else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) {
			bg = [p];
		} else if (p === 38) {
			const mode = params[i + 1];
			if (mode === 5) {
				fg = [38, 5, params[i + 2] ?? 0];
				i += 2;
			} else if (mode === 2) {
				fg = [38, 2, params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0];
				i += 4;
			}
		} else if (p === 48) {
			const mode = params[i + 1];
			if (mode === 5) {
				bg = [48, 5, params[i + 2] ?? 0];
				i += 2;
			} else if (mode === 2) {
				bg = [48, 2, params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0];
				i += 4;
			}
		}
		i += 1;
	}
	return {fg, bg, bold, dim, italic, underline, strikethrough};
};

const renderSgr = (state: SgrState): string => {
	const parts: string[] = [];
	if (state.fg.length > 0) parts.push(state.fg.join(';'));
	if (state.bg.length > 0) parts.push(state.bg.join(';'));
	if (state.bold) parts.push('1');
	if (state.dim) parts.push('2');
	if (state.italic) parts.push('3');
	if (state.underline) parts.push('4');
	if (state.strikethrough) parts.push('9');
	return parts.length === 0 ? '' : `\x1b[${parts.join(';')}m`;
};

const splitStyledChars = (styled: string): {readonly char: string; readonly sgr: string}[] => {
	const out: {char: string; sgr: string}[] = [];
	let state: SgrState = EMPTY_STATE;
	let i = 0;
	while (i < styled.length) {
		const ch = styled[i];
		if (ch === '\x1b' && styled[i + 1] === '[') {
			const endIdx = styled.indexOf('m', i + 2);
			if (endIdx === -1) {
				out.push({char: ch ?? '', sgr: renderSgr(state)});
				i += 1;
				continue;
			}
			const paramStr = styled.substring(i + 2, endIdx);
			const params = paramStr.length === 0 ? [0] : paramStr.split(';').map(s => parseInt(s, 10));
			state = updateState(state, params);
			i = endIdx + 1;
		} else {
			out.push({char: ch ?? '', sgr: renderSgr(state)});
			i += 1;
		}
	}
	return out;
};

const resolveBorderChars = (style: string | BoxChars): BoxChars | null => {
	const raw = typeof style === 'string' ? cliBoxes[style as keyof typeof cliBoxes] : style;
	if (raw === undefined) return null;
	const r = raw as Record<string, string>;
	const top = r['top'] ?? r['topBottom'] ?? '-';
	const left = r['left'] ?? r['leftRight'] ?? '|';
	return {
		topLeft: r['topLeft'] ?? '+',
		topRight: r['topRight'] ?? '+',
		bottomLeft: r['bottomLeft'] ?? '+',
		bottomRight: r['bottomRight'] ?? '+',
		horizontal: top,
		vertical: left,
	};
};

const cell = (
	row: number,
	column: number,
	text: string,
	sgr: string,
): CellPosition | null =>
	row > 0 && column > 0 && text.length > 0 ? {row, column, text, sgr} : null;

const collectTextCells = (
	node: DOMElement,
	x: number,
	y: number,
	transformers: readonly ((s: string, index: number) => string)[],
	grid: Grid,
): void => {
	if (node.nodeName !== 'ink-text') return;
	const yogaNode = node.yogaNode;
	if (yogaNode === undefined) return;
	if (yogaNode.getDisplay() === Yoga.DISPLAY_NONE) return;
	let styled = squashTextNodes(node);
	if (styled.length === 0) return;
	// Match render-node-to-output.ts: apply the chain of internal_transform
	// functions (outermost first) so chalk wraps register on the squashed
	// text. Without this the SGR state for fg/bg/bold/etc. is missing.
	for (let i = transformers.length - 1; i >= 0; i -= 1) {
		const transformer = transformers[i];
		if (transformer !== undefined) styled = transformer(styled, 0);
	}
	const maxWidth = Math.max(1, Math.floor(yogaNode.getComputedWidth()));
	const wrapped =
		widestLine(styled) <= maxWidth
			? styled
			: wrapTextFn(styled, maxWidth, node.style?.textWrap ?? 'wrap');
	const chars = splitStyledChars(wrapped);
	const rowBase = y + 1;
	const colBase = x + 1;
	let rowNum = rowBase;
	let colNum = colBase;
	for (const {char, sgr} of chars) {
		if (char === '\n') {
			rowNum += 1;
			colNum = colBase;
			continue;
		}
		const c = cell(rowNum, colNum, char, sgr);
		if (c !== null) {
			const rowArr = (grid[rowNum - 1] ??= []);
			rowArr.push(c);
		}
		colNum += 1;
	}
};

const SENTINEL = '\0';

const borderSgrPrefix = (fg: string | undefined, bg: string | undefined, dim: boolean | undefined): string => {
	if (fg === undefined && bg === undefined && !dim) return '';
	let styled = colorize(SENTINEL, fg, 'foreground');
	styled = colorize(styled, bg, 'background');
	if (dim) styled = chalk.dim(styled);
	return styled.split(SENTINEL)[0] ?? '';
};

const collectBoxBorderCells = (node: DOMElement, x: number, y: number, grid: Grid): void => {
	if (node.nodeName !== 'ink-box') return;
	const yogaNode = node.yogaNode;
	if (yogaNode === undefined) return;
	if (yogaNode.getDisplay() === Yoga.DISPLAY_NONE) return;
	const style = node.style;
	if (style?.borderStyle === undefined) return;
	const chars = resolveBorderChars(style.borderStyle as string | BoxChars);
	if (chars === null) return;
	const width = Math.floor(yogaNode.getComputedWidth());
	const height = Math.floor(yogaNode.getComputedHeight());
	if (width < 2 || height < 2) return;
	const showTop = style.borderTop !== false;
	const showBottom = style.borderBottom !== false;
	const showLeft = style.borderLeft !== false;
	const showRight = style.borderRight !== false;
	const topFg = style.borderTopColor ?? style.borderColor;
	const bottomFg = style.borderBottomColor ?? style.borderColor;
	const leftFg = style.borderLeftColor ?? style.borderColor;
	const rightFg = style.borderRightColor ?? style.borderColor;
	const topBg = style.borderTopBackgroundColor ?? style.borderBackgroundColor;
	const bottomBg = style.borderBottomBackgroundColor ?? style.borderBackgroundColor;
	const leftBg = style.borderLeftBackgroundColor ?? style.borderBackgroundColor;
	const rightBg = style.borderRightBackgroundColor ?? style.borderBackgroundColor;
	const topSgr = borderSgrPrefix(topFg, topBg, style.borderTopDimColor ?? style.borderDimColor);
	const bottomSgr = borderSgrPrefix(bottomFg, bottomBg, style.borderBottomDimColor ?? style.borderDimColor);
	const leftSgr = borderSgrPrefix(leftFg, leftBg, style.borderLeftDimColor ?? style.borderDimColor);
	const rightSgr = borderSgrPrefix(rightFg, rightBg, style.borderRightDimColor ?? style.borderDimColor);
	const rowBase = y + 1;
	const colBase = x + 1;
	const push = (r: number, c: number, t: string, sgr: string): void => {
		const v = cell(r, c, t, sgr);
		if (v === null) return;
		const arr = (grid[r - 1] ??= []);
		arr.push(v);
	};
	const verticalBorderHeight = height - (showTop ? 1 : 0) - (showBottom ? 1 : 0);
	const verticalOffsetY = showTop ? 1 : 0;
	if (showTop) {
		if (showLeft) push(rowBase, colBase, chars.topLeft, topSgr);
		if (showRight) push(rowBase, colBase + width - 1, chars.topRight, topSgr);
		const startC = showLeft ? 1 : 0;
		const endC = showRight ? width - 2 : width - 1;
		for (let c = startC; c <= endC; c += 1) push(rowBase, colBase + c, chars.horizontal, topSgr);
	}
	if (showBottom) {
		const r = rowBase + height - 1;
		if (showLeft) push(r, colBase, chars.bottomLeft, bottomSgr);
		if (showRight) push(r, colBase + width - 1, chars.bottomRight, bottomSgr);
		const startC = showLeft ? 1 : 0;
		const endC = showRight ? width - 2 : width - 1;
		for (let c = startC; c <= endC; c += 1) push(r, colBase + c, chars.horizontal, bottomSgr);
	}
	if (showLeft && verticalBorderHeight > 0) {
		for (let i = 0; i < verticalBorderHeight; i += 1) {
			push(rowBase + verticalOffsetY + i, colBase, chars.vertical, leftSgr);
		}
	}
	if (showRight && verticalBorderHeight > 0) {
		for (let i = 0; i < verticalBorderHeight; i += 1) {
			push(rowBase + verticalOffsetY + i, colBase + width - 1, chars.vertical, rightSgr);
		}
	}
};

type Transformer = (s: string, index: number) => string;

const walk = (
	node: DOMNode,
	offsetX: number,
	offsetY: number,
	transformers: readonly Transformer[],
	grid: Grid,
): void => {
	if (typeof node !== 'object' || node === null) return;
	if (!('nodeName' in node)) return;
	const elem = node as DOMElement;
	if (elem.nodeName === 'ink-root' || elem.nodeName === 'ink-box') {
		const yogaNode = elem.yogaNode;
		if (yogaNode === undefined) return;
		const x = offsetX + yogaNode.getComputedLeft();
		const y = offsetY + yogaNode.getComputedTop();
		collectBoxBorderCells(elem, x, y, grid);
		// Match render-node-to-output.ts: prepend this node's transform to the
		// chain so descendants inherit it (and produce styled SGR output).
		const childTransformers: Transformer[] =
			typeof elem.internal_transform === 'function'
				? [elem.internal_transform as Transformer, ...transformers]
				: [...transformers];
		for (const child of elem.childNodes) {
			walk(child, x, y, childTransformers, grid);
		}
		return;
	}
	if (elem.nodeName === 'ink-text') {
		const yogaNode = elem.yogaNode;
		if (yogaNode === undefined) return;
		const x = offsetX + yogaNode.getComputedLeft();
		const y = offsetY + yogaNode.getComputedTop();
		const childTransformers: Transformer[] =
			typeof elem.internal_transform === 'function'
				? [elem.internal_transform as Transformer, ...transformers]
				: [...transformers];
		collectTextCells(elem, x, y, childTransformers, grid);
	}
};

/**
 * Walk an Ink DOM tree and return a 2D grid of cells indexed by
 * (row, column) in terminal coordinates (1-based). Each text cell carries
 * the active SGR prefix Ink emitted for it so the selection overlay can
 * restore the original styling when clearing.
 */
export const materializeRoot = (rootNode: DOMElement): Grid => {
	const grid: Grid = [];
	walk(rootNode, 0, 0, [], grid);
	// Grid is sparse: rows may not be visited in order, leaving `undefined`
	// holes. Sort only the rows that actually carry cells.
	for (let i = 0; i < grid.length; i += 1) {
		const row = grid[i];
		if (row !== undefined) row.sort((a, b) => a.column - b.column);
	}
	return grid;
};

export const _splitStyledCharsForTest = splitStyledChars;
export const _renderSgrForTest = renderSgr;