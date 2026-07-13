import {type Writable} from 'node:stream';
import ansiEscapes from 'ansi-escapes';
import cliCursor from 'cli-cursor';
import {
	type CursorPosition,
	cursorPositionChanged,
	buildCursorSuffix,
	buildCursorOnlySequence,
	buildReturnToBottomPrefix,
	hideCursorEscape,
} from './cursor-helpers.js';

export type {CursorPosition} from './cursor-helpers.js';

export type LogUpdate = {
	clear: () => void;
	done: () => void;
	reset: () => void;
	sync: (str: string) => void;
	setCursorPosition: (position: CursorPosition | undefined) => void;
	isCursorDirty: () => boolean;
	willRender: (str: string) => boolean;
	(str: string): boolean;
};

// Count visible lines in a string, ignoring the trailing empty element
// that `split('\n')` produces when the string ends with '\n'.
const visibleLineCount = (lines: string[], str: string): number =>
	str.endsWith('\n') ? lines.length - 1 : lines.length;

const createStandard = (
	stream: Writable,
	{showCursor = false} = {},
): LogUpdate => {
	let previousLineCount = 0;
	let previousOutput = '';
	let hasHiddenCursor = false;
	let cursorPosition: CursorPosition | undefined;
	let cursorDirty = false;
	let previousCursorPosition: CursorPosition | undefined;
	let cursorWasShown = false;

	const getActiveCursor = () => (cursorDirty ? cursorPosition : undefined);
	const hasChanges = (
		str: string,
		activeCursor: CursorPosition | undefined,
	): boolean => {
		const cursorChanged = cursorPositionChanged(
			activeCursor,
			previousCursorPosition,
		);
		return str !== previousOutput || cursorChanged;
	};

	const render = (str: string) => {
		if (!showCursor && !hasHiddenCursor) {
			cliCursor.hide(stream);
			hasHiddenCursor = true;
		}

		// Only use cursor if setCursorPosition was called since last render.
		// This ensures stale positions don't persist after component unmount.
		const activeCursor = getActiveCursor();
		cursorDirty = false;
		const cursorChanged = cursorPositionChanged(
			activeCursor,
			previousCursorPosition,
		);

		if (!hasChanges(str, activeCursor)) {
			return false;
		}

		const lines = str.split('\n');
		const visibleCount = visibleLineCount(lines, str);
		const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);

		if (str === previousOutput && cursorChanged) {
			stream.write(
				buildCursorOnlySequence({
					cursorWasShown,
					previousLineCount,
					previousCursorPosition,
					visibleLineCount: visibleCount,
					cursorPosition: activeCursor,
				}),
			);
		} else {
			previousOutput = str;
			const returnPrefix = buildReturnToBottomPrefix(
				cursorWasShown,
				previousLineCount,
				previousCursorPosition,
			);
			stream.write(
				returnPrefix +
					ansiEscapes.eraseLines(previousLineCount) +
					str +
					cursorSuffix,
			);
			previousLineCount = lines.length;
		}

		previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
		cursorWasShown = activeCursor !== undefined;
		return true;
	};

	render.clear = () => {
		const prefix = buildReturnToBottomPrefix(
			cursorWasShown,
			previousLineCount,
			previousCursorPosition,
		);
		stream.write(prefix + ansiEscapes.eraseLines(previousLineCount));
		previousOutput = '';
		previousLineCount = 0;
		previousCursorPosition = undefined;
		cursorWasShown = false;
	};

	render.done = () => {
		previousOutput = '';
		previousLineCount = 0;
		previousCursorPosition = undefined;
		cursorWasShown = false;

		if (!showCursor) {
			cliCursor.show(stream);
			hasHiddenCursor = false;
		}
	};

	render.reset = () => {
		previousOutput = '';
		previousLineCount = 0;
		previousCursorPosition = undefined;
		cursorWasShown = false;
	};

	render.sync = (str: string) => {
		const activeCursor = cursorDirty ? cursorPosition : undefined;
		cursorDirty = false;

		const lines = str.split('\n');
		previousOutput = str;
		previousLineCount = lines.length;

		if (!activeCursor && cursorWasShown) {
			stream.write(hideCursorEscape);
		}

		if (activeCursor) {
			stream.write(
				buildCursorSuffix(visibleLineCount(lines, str), activeCursor),
			);
		}

		previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
		cursorWasShown = activeCursor !== undefined;
	};

	render.setCursorPosition = (position: CursorPosition | undefined) => {
		cursorPosition = position;
		cursorDirty = true;
	};

	render.isCursorDirty = () => cursorDirty;
	render.willRender = (str: string) => hasChanges(str, getActiveCursor());

	return render;
};

const createIncremental = (
	stream: Writable,
	{showCursor = false} = {},
): LogUpdate => {
	let previousLines: string[] = [];
	let previousOutput = '';
	let hasHiddenCursor = false;
	let cursorPosition: CursorPosition | undefined;
	let cursorDirty = false;
	let previousCursorPosition: CursorPosition | undefined;
	let cursorWasShown = false;

	const getActiveCursor = () => (cursorDirty ? cursorPosition : undefined);
	const hasChanges = (
		str: string,
		activeCursor: CursorPosition | undefined,
	): boolean => {
		const cursorChanged = cursorPositionChanged(
			activeCursor,
			previousCursorPosition,
		);
		return str !== previousOutput || cursorChanged;
	};

	const render = (str: string) => {
		if (!showCursor && !hasHiddenCursor) {
			cliCursor.hide(stream);
			hasHiddenCursor = true;
		}

		// Only use cursor if setCursorPosition was called since last render.
		// This ensures stale positions don't persist after component unmount.
		const activeCursor = getActiveCursor();
		cursorDirty = false;
		const cursorChanged = cursorPositionChanged(
			activeCursor,
			previousCursorPosition,
		);

		if (!hasChanges(str, activeCursor)) {
			return false;
		}

		const nextLines = str.split('\n');
		const visibleCount = visibleLineCount(nextLines, str);
		const previousVisible = visibleLineCount(previousLines, previousOutput);

		if (str === previousOutput && cursorChanged) {
			stream.write(
				buildCursorOnlySequence({
					cursorWasShown,
					previousLineCount: previousLines.length,
					previousCursorPosition,
					visibleLineCount: visibleCount,
					cursorPosition: activeCursor,
				}),
			);
			previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
			cursorWasShown = activeCursor !== undefined;
			return true;
		}

		const returnPrefix = buildReturnToBottomPrefix(
			cursorWasShown,
			previousLines.length,
			previousCursorPosition,
		);

		if (str === '\n' || previousOutput.length === 0) {
			const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);
			stream.write(
				returnPrefix +
					ansiEscapes.eraseLines(previousLines.length) +
					str +
					cursorSuffix,
			);
			cursorWasShown = activeCursor !== undefined;
			previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
			previousOutput = str;
			previousLines = nextLines;
			return true;
		}

		const hasTrailingNewline = str.endsWith('\n');

		// We aggregate all chunks for incremental rendering into a buffer, and then write them to stdout at the end.
		const buffer: string[] = [];

		buffer.push(returnPrefix);

		// Clear extra lines if the current content's line count is lower than the previous.
		if (visibleCount < previousVisible) {
			const previousHadTrailingNewline = previousOutput.endsWith('\n');
			const extraSlot = previousHadTrailingNewline ? 1 : 0;
			buffer.push(
				ansiEscapes.eraseLines(previousVisible - visibleCount + extraSlot),
				ansiEscapes.cursorUp(visibleCount),
			);
		} else {
			buffer.push(ansiEscapes.cursorUp(previousLines.length - 1));
		}

		for (let i = 0; i < visibleCount; i++) {
			const isLastLine = i === visibleCount - 1;

			// We do not write lines if the contents are the same. This prevents flickering during renders.
			if (nextLines[i] === previousLines[i]) {
				// Don't move past the last line when there's no trailing newline,
				// otherwise the cursor overshoots the rendered block.
				if (!isLastLine || hasTrailingNewline) {
					buffer.push(ansiEscapes.cursorNextLine);
				}

				continue;
			}

			buffer.push(
				ansiEscapes.cursorTo(0) +
					nextLines[i] +
					ansiEscapes.eraseEndLine +
					// Don't append newline after the last line when the input
					// has no trailing newline (fullscreen mode).
					(isLastLine && !hasTrailingNewline ? '' : '\n'),
			);
		}

		const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);
		buffer.push(cursorSuffix);

		stream.write(buffer.join(''));

		cursorWasShown = activeCursor !== undefined;
		previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
		previousOutput = str;
		previousLines = nextLines;
		return true;
	};

	render.clear = () => {
		const prefix = buildReturnToBottomPrefix(
			cursorWasShown,
			previousLines.length,
			previousCursorPosition,
		);
		stream.write(prefix + ansiEscapes.eraseLines(previousLines.length));
		previousOutput = '';
		previousLines = [];
		previousCursorPosition = undefined;
		cursorWasShown = false;
	};

	render.done = () => {
		previousOutput = '';
		previousLines = [];
		previousCursorPosition = undefined;
		cursorWasShown = false;

		if (!showCursor) {
			cliCursor.show(stream);
			hasHiddenCursor = false;
		}
	};

	render.reset = () => {
		previousOutput = '';
		previousLines = [];
		previousCursorPosition = undefined;
		cursorWasShown = false;
	};

	render.sync = (str: string) => {
		const activeCursor = cursorDirty ? cursorPosition : undefined;
		cursorDirty = false;

		const lines = str.split('\n');
		previousOutput = str;
		previousLines = lines;

		if (!activeCursor && cursorWasShown) {
			stream.write(hideCursorEscape);
		}

		if (activeCursor) {
			stream.write(
				buildCursorSuffix(visibleLineCount(lines, str), activeCursor),
			);
		}

		previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
		cursorWasShown = activeCursor !== undefined;
	};

	render.setCursorPosition = (position: CursorPosition | undefined) => {
		cursorPosition = position;
		cursorDirty = true;
	};

	render.isCursorDirty = () => cursorDirty;
	render.willRender = (str: string) => hasChanges(str, getActiveCursor());

	return render;
};

const createAppend = (
	stream: Writable,
	{showCursor = false} = {},
): LogUpdate => {
	let previousLines: string[] = [];
	let previousOutput = '';
	let hasHiddenCursor = false;
	let cursorPosition: CursorPosition | undefined;
	let cursorDirty = false;
	let previousCursorPosition: CursorPosition | undefined;
	let cursorWasShown = false;

	const getActiveCursor = () => (cursorDirty ? cursorPosition : undefined);
	const hasChanges = (
		str: string,
		activeCursor: CursorPosition | undefined,
	): boolean => {
		const cursorChanged = cursorPositionChanged(
			activeCursor,
			previousCursorPosition,
		);
		return str !== previousOutput || cursorChanged;
	};

	const render = (str: string) => {
		if (!showCursor && !hasHiddenCursor) {
			cliCursor.hide(stream);
			hasHiddenCursor = true;
		}

		const activeCursor = getActiveCursor();
		cursorDirty = false;
		const cursorChanged = cursorPositionChanged(
			activeCursor,
			previousCursorPosition,
		);

		if (!hasChanges(str, activeCursor)) {
			return false;
		}

		const nextLines = str.split('\n');
		const visibleCount = visibleLineCount(nextLines, str);
		const previousVisible = visibleLineCount(previousLines, previousOutput);

		// Cursor-only path: nothing changed in the output, only cursor moved.
		if (str === previousOutput && cursorChanged) {
			stream.write(
				buildCursorOnlySequence({
					cursorWasShown,
					previousLineCount: previousLines.length,
					previousCursorPosition,
					visibleLineCount: visibleCount,
					cursorPosition: activeCursor,
				}),
			);
			previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
			cursorWasShown = activeCursor !== undefined;
			return true;
		}

		// First render: nothing to compare against, write the frame as-is.
		if (previousOutput.length === 0) {
			const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);
			stream.write(str + cursorSuffix);
			previousOutput = str;
			previousLines = nextLines;
			cursorWasShown = activeCursor !== undefined;
			previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
			return true;
		}

		// Path selection: pure-append, pure-shrink, last-line edit, or full rewrite.
		const isPureAppend =
			visibleCount >= previousVisible &&
			linesMatchUpTo(nextLines, previousLines, previousVisible);
		const isPureShrink =
			visibleCount < previousVisible &&
			linesMatchUpTo(nextLines, previousLines, visibleCount);
		const isOnlyLastLineChanged =
			visibleCount === previousVisible &&
			lastLineOnlyDiffers(nextLines, previousLines, visibleCount);

		if (!isPureAppend && !isPureShrink && !isOnlyLastLineChanged) {
			// Fall back to the standard erase-and-rewrite. Scrollback is lost
			// in this rare case; chat streaming never lands here.
			const returnPrefix = buildReturnToBottomPrefix(
				cursorWasShown,
				previousLines.length,
				previousCursorPosition,
			);
			const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);
			stream.write(
				returnPrefix +
					ansiEscapes.eraseLines(previousLines.length) +
					str +
					cursorSuffix,
			);
			previousOutput = str;
			previousLines = nextLines;
			cursorWasShown = activeCursor !== undefined;
			previousCursorPosition = activeCursor
				? {...activeCursor}
				: undefined;
			return true;
		}

		// All non-fallback paths share the same prefix and suffix.
		// Prefix only if the cursor was previously positioned; otherwise the
		// cursor is already at the slot below the previous frame's bottom.
		const returnPrefix = buildReturnToBottomPrefix(
			cursorWasShown,
			previousLines.length,
			previousCursorPosition,
		);
		const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);

		if (isPureAppend) {
			// Cursor is at row previousVisible (slot). Append visibleCount - previousVisible
			// new lines directly below. Unchanged lines are NEVER touched.
			const appendedLines = nextLines
				.slice(previousVisible, visibleCount)
				.join('\n');
			const trailingNewline = str.endsWith('\n') ? '\n' : '';
			stream.write(returnPrefix + appendedLines + trailingNewline + cursorSuffix);
		} else if (isPureShrink) {
			// Cursor at row previousVisible. Clear the dropped trailing rows.
			// eraseLines(previousVisible - visibleCount + 1) reaches up through the
			// slot row, ending at the new slot row visibleCount.
			stream.write(
				returnPrefix +
					ansiEscapes.eraseLines(previousVisible - visibleCount + 1) +
					cursorSuffix,
			);
		} else {
			// Last-line-only change: cursorUp(1) to the last visible row, clear
			// it, write the new content, return to the slot.
			stream.write(
				returnPrefix +
					ansiEscapes.cursorUp(1) +
					ansiEscapes.eraseEndLine +
					nextLines[visibleCount - 1]! +
					ansiEscapes.cursorDown(1) +
					ansiEscapes.cursorTo(0) +
					cursorSuffix,
			);
		}

		previousOutput = str;
		previousLines = nextLines;
		cursorWasShown = activeCursor !== undefined;
		previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
		return true;
	};

	render.clear = () => {
		// Append-mode clear must NOT erase the visible frame: history stays in
		// scrollback for the user to scroll up to. Just reset internal state so
		// the next render is treated as a first render.
		previousOutput = '';
		previousLines = [];
		previousCursorPosition = undefined;
		cursorWasShown = false;
	};

	render.done = () => {
		previousOutput = '';
		previousLines = [];
		previousCursorPosition = undefined;
		cursorWasShown = false;

		if (!showCursor) {
			cliCursor.show(stream);
			hasHiddenCursor = false;
		}
	};

	render.reset = () => {
		previousOutput = '';
		previousLines = [];
		previousCursorPosition = undefined;
		cursorWasShown = false;
	};

	render.sync = (str: string) => {
		const activeCursor = cursorDirty ? cursorPosition : undefined;
		cursorDirty = false;

		const lines = str.split('\n');
		previousOutput = str;
		previousLines = lines;

		if (!activeCursor && cursorWasShown) {
			stream.write(hideCursorEscape);
		}

		if (activeCursor) {
			stream.write(
				buildCursorSuffix(visibleLineCount(lines, str), activeCursor),
			);
		}

		previousCursorPosition = activeCursor ? {...activeCursor} : undefined;
		cursorWasShown = activeCursor !== undefined;
	};

	render.setCursorPosition = (position: CursorPosition | undefined) => {
		cursorPosition = position;
		cursorDirty = true;
	};

	render.isCursorDirty = () => cursorDirty;
	render.willRender = (str: string) => hasChanges(str, getActiveCursor());

	return render;
};

const linesMatchUpTo = (
	nextLines: string[],
	previousLines: string[],
	count: number,
): boolean => {
	for (let i = 0; i < count; i++) {
		if (nextLines[i] !== previousLines[i]) {
			return false;
		}
	}

	return true;
};

const lastLineOnlyDiffers = (
	nextLines: string[],
	previousLines: string[],
	visibleCount: number,
): boolean => {
	for (let i = 0; i < visibleCount - 1; i++) {
		if (nextLines[i] !== previousLines[i]) {
			return false;
		}
	}

	return nextLines[visibleCount - 1] !== previousLines[visibleCount - 1];
};

const create = (
	stream: Writable,
	{showCursor = false, incremental = false, appendToScrollback = false} = {},
): LogUpdate => {
	if (incremental && appendToScrollback) {
		throw new Error(
			"logUpdate: 'incremental' and 'appendToScrollback' are mutually exclusive",
		);
	}

	if (appendToScrollback) {
		return createAppend(stream, {showCursor});
	}

	if (incremental) {
		return createIncremental(stream, {showCursor});
	}

	return createStandard(stream, {showCursor});
};

const logUpdate = {create};
export default logUpdate;
