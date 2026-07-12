import ansiEscapes from 'ansi-escapes';
import logUpdate from './log-update.js';
import createStdout from '../test/helpers/create-stdout.js';

test('standard rendering - renders and updates output', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render('Hello\n');
	expect((stdout.write as any).mock.calls.length).toBe(1);
	expect((stdout.write as any).mock.calls[0]?.[0]).toBe('Hello\n');

	render('World\n');
	expect((stdout.write as any).mock.calls.length).toBe(2);
	expect(((stdout.write as any).mock.calls[1]?.[0] as string).includes('World')).toBe(true);
});

test('standard rendering - skips identical output', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render('Hello\n');
	render('Hello\n');

	expect((stdout.write as any).mock.calls.length).toBe(1);
});

test('incremental rendering - renders and updates output', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Hello\n');
	expect((stdout.write as any).mock.calls.length).toBe(1);
	expect((stdout.write as any).mock.calls[0]?.[0]).toBe('Hello\n');

	render('World\n');
	expect((stdout.write as any).mock.calls.length).toBe(2);
	expect(((stdout.write as any).mock.calls[1]?.[0] as string).includes('World')).toBe(true);
});

test('incremental rendering - skips identical output', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Hello\n');
	render('Hello\n');

	expect((stdout.write as any).mock.calls.length).toBe(1);
});

test('incremental rendering - surgical updates', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render('Line 1\nUpdated\nLine 3\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true); // Skips unchanged lines
	expect(secondCall.includes('Updated')).toBe(true); // Only updates changed line
	expect(secondCall.includes('Line 1')).toBe(false); // Doesn't rewrite unchanged
	expect(secondCall.includes('Line 3')).toBe(false); // Doesn't rewrite unchanged
});

test('incremental rendering - same-height update rewinds cursor to top with trailing newline', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render('Line 1\nUpdated\nLine 3\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Output ends with '\n', so split('\n') gives ["Line 1","Line 2","Line 3",""]
	// (length 4). After writing, cursor is on row 3 (the empty row past last
	// visible line). cursorUp must be 3 (= 4 - 1) to reach row 0.
	// Using visibleLineCount - 1 (= 2) would only reach row 1, leaving row 0
	// as a ghost line.
	expect(secondCall.startsWith(ansiEscapes.cursorUp(3))).toBe(true);
});

test('incremental rendering - clears extra lines when output shrinks', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render('Line 1\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	expect(secondCall.includes(ansiEscapes.eraseLines(2))).toBe(true); // Erases 2 extra lines
});

test('incremental rendering - when output grows', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\n');
	render('Line 1\nLine 2\nLine 3\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true); // Skips unchanged first line
	expect(secondCall.includes('Line 2')).toBe(true); // Adds new line
	expect(secondCall.includes('Line 3')).toBe(true); // Adds new line
	expect(secondCall.includes('Line 1')).toBe(false); // Doesn't rewrite unchanged
});

test('incremental rendering - single write call with multiple surgical updates', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render(
		'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\n',
	);
	render(
		'Line 1\nUpdated 2\nLine 3\nUpdated 4\nLine 5\nUpdated 6\nLine 7\nUpdated 8\nLine 9\nUpdated 10\n',
	);

	expect((stdout.write as any).mock.calls.length).toBe(2); // Only 2 writes total (initial + update)
});

test('incremental rendering - shrinking output keeps screen tight', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render('Line 1\nLine 2\n');
	render('Line 1\n');

	const thirdCall = stdout.get();

	expect(thirdCall).toBe(ansiEscapes.eraseLines(2) + // Erase Line 2 and ending cursorNextLine
			ansiEscapes.cursorUp(1) + // Move to beginning of Line 1
			ansiEscapes.cursorNextLine);
});

test('incremental rendering - clear() fully resets incremental state', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render.clear();
	render('Line 1\n');

	const afterClear = stdout.get();

	expect(afterClear).toBe(ansiEscapes.eraseLines(0) + 'Line 1\n'); // Should do a fresh write
});

test('incremental rendering - done() resets before next render', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render.done();
	render('Line 1\n');

	const afterDone = stdout.get();

	expect(afterDone).toBe(ansiEscapes.eraseLines(0) + 'Line 1\n'); // Should do a fresh write
});

test('incremental rendering - multiple consecutive clear() calls (should be harmless no-ops)', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render.clear();
	render.clear();
	render.clear();

	expect((stdout.write as any).mock.calls.length).toBe(4); // Initial render + 3 clears (each writes eraseLines)

	// Verify state is properly reset after multiple clears
	render('New content\n');
	const afterClears = stdout.get();
	expect(afterClears).toBe(ansiEscapes.eraseLines(0) + 'New content\n'); // Should do a fresh write
});

test('incremental rendering - sync() followed by update (assert incremental path is used)', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render.sync('Line 1\nLine 2\nLine 3\n');
	expect((stdout.write as any).mock.calls.length).toBe(0); // The sync() call shouldn't write to stdout

	render('Line 1\nUpdated\nLine 3\n');
	expect((stdout.write as any).mock.calls.length).toBe(1);

	const firstCall = (stdout.write as any).mock.calls[0]?.[0] as string;
	expect(firstCall.includes(ansiEscapes.cursorNextLine)).toBe(true); // Skips unchanged lines
	expect(firstCall.includes('Updated')).toBe(true); // Only updates changed line
	expect(firstCall.includes('Line 1')).toBe(false); // Doesn't rewrite unchanged
	expect(firstCall.includes('Line 3')).toBe(false); // Doesn't rewrite unchanged
});

// Cursor positioning tests

const showCursorEscape = '\u001B[?25h';
const hideCursorEscape = '\u001B[?25l';

const renderingModes = [
	{name: 'standard rendering', incremental: false},
	{name: 'incremental rendering', incremental: true},
] as const;

const createRenderForMode = (incremental: boolean) => {
	const stdout = createStdout();
	const render = incremental
		? logUpdate.create(stdout, {showCursor: true, incremental: true})
		: logUpdate.create(stdout, {showCursor: true});
	return {stdout, render};
};

test('standard rendering - positions cursor after output when cursorPosition is set', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render.setCursorPosition({x: 5, y: 1});
	render('Line 1\nLine 2\nLine 3\n');

	const written = (stdout.write as any).mock.calls[0]?.[0] as string;
	// Output is "Line 1\nLine 2\nLine 3\n" (3 visible lines)
	// Cursor after write is at line 3 (0-indexed), col 0
	// To reach y=1: cursorUp(3 - 1) = cursorUp(2)
	// Then cursorTo(5) and show cursor
	expect(written.includes('Line 3')).toBe(true);
	expect(written.endsWith(
			ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape,
		)).toBe(true);
});

test('standard rendering - hides cursor before erase when cursor was previously shown', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render.setCursorPosition({x: 0, y: 0});
	render('Hello\n');
	render.setCursorPosition({x: 0, y: 0});
	render('World\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Should start with hide cursor before erasing
	expect(secondCall.startsWith(hideCursorEscape)).toBe(true);
	// Should end with show cursor at position
	expect(secondCall.endsWith(
			ansiEscapes.cursorUp(1) + ansiEscapes.cursorTo(0) + showCursorEscape,
		)).toBe(true);
});

test('standard rendering - no cursor positioning when cursorPosition is undefined', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render('Hello\n');

	const written = (stdout.write as any).mock.calls[0]?.[0] as string;
	expect(written.includes(showCursorEscape)).toBe(false);
});

test('standard rendering - cursor position at second-to-last line emits cursorUp(1)', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render.setCursorPosition({x: 3, y: 2});
	render('Line 1\nLine 2\nLine 3\n');

	const written = (stdout.write as any).mock.calls[0]?.[0] as string;
	// Output has 3 visible lines. After write, cursor is at line 3 (past last visible).
	// To reach y=2: cursorUp(3 - 2) = cursorUp(1)
	expect(written.endsWith(
			ansiEscapes.cursorUp(1) + ansiEscapes.cursorTo(3) + showCursorEscape,
		)).toBe(true);
});

for (const {name, incremental} of renderingModes) {
	test(`${name} - clear() returns cursor to bottom before erasing`, () => {
		const {stdout, render} = createRenderForMode(incremental);

		render.setCursorPosition({x: 5, y: 0});
		render('Line 1\nLine 2\nLine 3\n');

		render.clear();

		const clearCall = (stdout.write as any).mock.calls[1]?.[0] as string;
		// Cursor was at y=0, output had 4 lines (3 visible + trailing newline).
		// clear() should: hide cursor, move down to bottom (from y=0 to line 3), then erase
		expect(clearCall.includes(hideCursorEscape)).toBe(true);
		expect(clearCall.includes(ansiEscapes.cursorDown(3))).toBe(true);
		expect(clearCall.includes(ansiEscapes.eraseLines(4))).toBe(true);
	});
}

test('standard rendering - clearing cursor position stops cursor positioning', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render.setCursorPosition({x: 0, y: 0});
	render('Hello\n');

	render.setCursorPosition(undefined);
	render('World\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	expect(secondCall.includes(showCursorEscape)).toBe(false);
});

test('incremental rendering - positions cursor after surgical updates', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render.setCursorPosition({x: 5, y: 1});
	render('Line 1\nLine 2\nLine 3\n');

	const written = (stdout.write as any).mock.calls[0]?.[0] as string;
	// After incremental write, cursor is at line 3 (past last visible)
	// To reach y=1: cursorUp(3 - 1) = cursorUp(2)
	expect(written.endsWith(
			ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape,
		)).toBe(true);
});

test('incremental rendering - positions cursor after update', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render.setCursorPosition({x: 2, y: 0});
	render('Line 1\nLine 2\nLine 3\n');
	render.setCursorPosition({x: 2, y: 0});
	render('Line 1\nUpdated\nLine 3\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// After incremental update, cursor is at line 3
	// To reach y=0: cursorUp(3)
	expect(secondCall.endsWith(
			ansiEscapes.cursorUp(3) + ansiEscapes.cursorTo(2) + showCursorEscape,
		)).toBe(true);
});

for (const {name, incremental} of renderingModes) {
	test(`${name} - repositions cursor when only cursor position changes (same output)`, () => {
		const {stdout, render} = createRenderForMode(incremental);

		render.setCursorPosition({x: 2, y: 0});
		render('Hello\n');
		expect((stdout.write as any).mock.calls.length).toBe(1);

		// Same output, but cursor moved (simulates space input where output is padded identically)
		render.setCursorPosition({x: 3, y: 0});
		render('Hello\n');

		expect((stdout.write as any).mock.calls.length).toBe(2);
		const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
		// Should reposition cursor: hide + return to bottom + move to new position + show
		expect(secondCall.includes(showCursorEscape)).toBe(true);
		expect(secondCall.endsWith(ansiEscapes.cursorTo(3) + showCursorEscape)).toBe(true);
	});
}

test('standard rendering - returns to bottom before erase when cursor was positioned', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render.setCursorPosition({x: 0, y: 0});
	render('Line 1\nLine 2\nLine 3\n');

	render.setCursorPosition({x: 5, y: 0});
	render('Line A\nLine B\nLine C\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Should: hide cursor, move down to bottom (from y=0 to line 3), then erase + rewrite
	expect(secondCall.startsWith(hideCursorEscape)).toBe(true);
	expect(secondCall.includes(ansiEscapes.cursorDown(3))).toBe(true);
	expect(secondCall.includes('Line A')).toBe(true);
});

for (const {name, incremental} of renderingModes) {
	test(`${name} - sync() resets cursor state`, () => {
		const {stdout, render} = createRenderForMode(incremental);

		render.setCursorPosition({x: 5, y: 0});
		render('Line 1\nLine 2\nLine 3\n');

		// Sync() simulates clearTerminal path: screen is fully reset
		render.sync('Fresh output\n');

		// Next render should NOT include hideCursor + cursorDown (return-to-bottom prefix)
		// because sync() should have reset previousCursorPosition and cursorWasShown
		render('Updated output\n');

		const afterSync = stdout.get();
		expect(afterSync.includes(hideCursorEscape)).toBe(false);
		expect(afterSync.includes(ansiEscapes.cursorDown(3))).toBe(false);
	});
}

for (const {name, incremental} of renderingModes) {
	test(`${name} - sync() writes cursor suffix when cursor is dirty`, () => {
		const {stdout, render} = createRenderForMode(incremental);

		render.setCursorPosition({x: 5, y: 1});
		render.sync('Line 1\nLine 2\nLine 3\n');

		// Sync() should write cursor suffix to position cursor
		// 3 visible lines, cursor at y=1 → cursorUp(3-1) = cursorUp(2)
		expect((stdout.write as any).mock.calls.length).toBe(1);
		const written = (stdout.write as any).mock.calls[0]?.[0] as string;
		expect(written).toBe(ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(5) + showCursorEscape);
	});
}

for (const {name, incremental} of renderingModes) {
	test(`${name} - sync() with cursor sets cursorWasShown for next render`, () => {
		const {stdout, render} = createRenderForMode(incremental);

		render.setCursorPosition({x: 5, y: 1});
		render.sync('Line 1\nLine 2\nLine 3\n');

		// Next render should hide cursor before erasing (cursorWasShown = true from sync)
		render('Updated\n');

		const renderCall = stdout.get();
		expect(renderCall.startsWith(hideCursorEscape)).toBe(true);
	});
}

for (const {name, incremental} of renderingModes) {
	test(`${name} - sync() hides cursor when previous render showed cursor`, () => {
		const {stdout, render} = createRenderForMode(incremental);

		render.setCursorPosition({x: 5, y: 1});
		render('Line 1\nLine 2\nLine 3\n');
		expect((stdout.write as any).mock.calls.length).toBe(1);

		render.sync('Fresh output\n');

		expect((stdout.write as any).mock.calls.length).toBe(2);
		expect((stdout.write as any).mock.calls[1]?.[0] as string).toBe(hideCursorEscape);
	});
}

test('standard rendering - sync() without cursor does not write to stream', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {showCursor: true});

	render.sync('Line 1\nLine 2\nLine 3\n');

	expect((stdout.write as any).mock.calls.length).toBe(0);
});

// No-trailing-newline tests (fullscreen mode)

test('incremental rendering - no trailing newline: trailing to no-trailing transition', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('A\nB\n');
	render('A\nB');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Both lines are unchanged, so only cursor movement should occur.
	// The key is that the cursor does NOT overshoot past line B.
	expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true); // Skip unchanged A
	expect(secondCall.endsWith('\n')).toBe(false); // No trailing newline in output
});

test('incremental rendering - no trailing newline: no-trailing to no-trailing update', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('A\nB');
	render('A\nC');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	expect(secondCall.includes(ansiEscapes.cursorNextLine)).toBe(true); // Skip unchanged A
	expect(secondCall.includes('C')).toBe(true); // Updates B to C
	expect(secondCall.endsWith('\n')).toBe(false); // No trailing newline
});

test('incremental rendering - no trailing newline: shrink', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('A\nB');
	render('A');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Should erase 1 extra line (B), not over-erase A
	// previousVisible=2, visibleCount=1, no trailing newline -> eraseLines(2-1+0) = eraseLines(1)
	expect(secondCall.includes(ansiEscapes.eraseLines(1))).toBe(true);
	expect(secondCall.endsWith('\n')).toBe(false); // No trailing newline
});

test('incremental rendering - no trailing newline: grow', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('A');
	render('A\nB\nC');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	expect(secondCall.includes('B')).toBe(true); // New line B
	expect(secondCall.includes('C')).toBe(true); // New line C
	expect(secondCall.endsWith('\n')).toBe(false); // No trailing newline
});

test('incremental rendering - no trailing newline: unchanged lines do not overshoot cursor', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('A\nB');
	render('A\nB'); // Identical - should be skipped entirely

	expect((stdout.write as any).mock.calls.length).toBe(1); // No second write (identical)

	// Now change only the first line
	render('X\nB');

	const thirdCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Should write X with newline to advance to B's line, then skip B.
	// The buffer ends with the \n that moves to B's line, but no extra
	// cursorNextLine past B -- the cursor stays on the last visible line.
	expect(thirdCall.includes('X')).toBe(true);
	// Verify no cursorNextLine appears after B's position (B is unchanged
	// and last, so no cursor movement is emitted for it)
	const lastCursorNextLine = thirdCall.lastIndexOf(ansiEscapes.cursorNextLine);
	expect(lastCursorNextLine).toBe(-1); // No cursorNextLine at all since A is changed (written) not skipped
});

test('incremental rendering - render to empty string (full clear vs early exit)', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		incremental: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render('\n');

	expect((stdout.write as any).mock.calls.length).toBe(2);
	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	expect(secondCall).toBe(ansiEscapes.eraseLines(4) + '\n'); // Erases all 4 lines + writes single newline

	// Rendering empty string again should be skipped (identical output)
	render('\n');
	expect((stdout.write as any).mock.calls.length).toBe(2); // No additional write
});

// Append-to-scrollback rendering tests.
// Goal: never erase the previous frame wholesale. Unchanged lines stay in terminal
// scrollback so the user can scroll up to see history.

test('append rendering - first render writes content with no erase', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\nLine 3\n');

	expect((stdout.write as any).mock.calls.length).toBe(1);
	const written = (stdout.write as any).mock.calls[0]?.[0] as string;
	expect(written).not.toContain(ansiEscapes.eraseLines(1).slice(0, 3));
	expect(written).toBe('Line 1\nLine 2\nLine 3\n');
});

test('append rendering - identical output is skipped', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\n');
	render('Line 1\nLine 2\n');

	expect((stdout.write as any).mock.calls.length).toBe(1);
});

test('append rendering - appended content writes only the new lines', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\n');
	render('Line 1\nLine 2\nLine 3\nLine 4\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// After first render, cursor sits at row 2 (slot below Line 2). Pure append:
	// emit only the new lines Line 3 and Line 4. Unchanged lines are NEVER touched,
	// so they remain in terminal scrollback.
	expect(secondCall).toBe('Line 3\nLine 4\n');
	expect(secondCall.includes('Line 1')).toBe(false);
	expect(secondCall.includes('Line 2')).toBe(false);
	expect(secondCall.includes(ansiEscapes.eraseLines(1).slice(0, 3))).toBe(false);
});

test('append rendering - only-last-line change rewrites the bottom row', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render('Line 1\nLine 2\nUpdated\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Streaming-in-place update of the last line. previousVisible == visibleCount == 3,
	// only nextLines[2] changed. cursorUp(1) to row 2 (where Line 3 was),
	// eraseLine + write 'Updated', then cursorDown(1) back to slot.
	expect(secondCall).toBe(
		ansiEscapes.cursorUp(1) +
			ansiEscapes.eraseEndLine +
			'Updated' +
			ansiEscapes.cursorDown(1) +
			ansiEscapes.cursorTo(0),
	);
	// Lines 1 and 2 must never appear in the buffer (scrollback preserved).
	expect(secondCall.includes('Line 1')).toBe(false);
	expect(secondCall.includes('Line 2')).toBe(false);
});

test('append rendering - middle change falls back to full rewrite', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('A\nB\nC\n');
	render('A\nUpdated\nC\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// Line B changed but the bottom didn't grow. The line-by-line append path
	// doesn't cover middle edits, so we fall back to the standard "return to
	// bottom, erase, rewrite" sequence. (Streaming a chat never lands here.)
	expect(secondCall).toBe(
		ansiEscapes.eraseLines(4) + 'A\nUpdated\nC\n',
	);
});

test('append rendering - shrinking content clears trailing extra lines', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\nLine 3\n');
	render('Line 1\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// previousVisible=3, visibleCount=1. From cursor at row 3, eraseLines(3)
	// clears rows 3, 2, 1 (Line 2, Line 3, slot). Line 1 at row 0 is preserved.
	expect(secondCall).toBe(ansiEscapes.eraseLines(3));
});

test('append rendering - clear() does NOT erase the visible frame (history preserved)', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\n');
	render.clear();

	// clear() must NOT touch the terminal at all -- the visible rows stay in
	// scrollback. Only the first render emits a write.
	expect((stdout.write as any).mock.calls.length).toBe(1);
});

test('append rendering - done() resets state without emitting erase', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\n');
	render.done();

	expect((stdout.write as any).mock.calls.length).toBe(1);
});

test('append rendering - sync() resets state without writing to stream', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render.sync('Line 1\nLine 2\nLine 3\n');
	expect((stdout.write as any).mock.calls.length).toBe(0);

	render('Line 1\nLine 2\nLine 3\nLine 4\n');
	expect((stdout.write as any).mock.calls.length).toBe(1);
	const written = (stdout.write as any).mock.calls[0]?.[0] as string;
	// previousLines was reset by sync, so this looks like first render + an append.
	// Cursor sits at row 3 (slot below Line 3). Pure append of Line 4.
	expect(written).toBe('Line 4\n');
});

test('append rendering - cursor position is honoured on first render', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render.setCursorPosition({x: 5, y: 1});
	render('Line 1\nLine 2\nLine 3\n');

	const written = (stdout.write as any).mock.calls[0]?.[0] as string;
	expect(written).toBe(
		'Line 1\nLine 2\nLine 3\n' +
			ansiEscapes.cursorUp(2) +
			ansiEscapes.cursorTo(5) +
			showCursorEscape,
	);
});

test('append rendering - cursor position is honoured after append', () => {
	const stdout = createStdout();
	const render = logUpdate.create(stdout, {
		showCursor: true,
		appendToScrollback: true,
	});

	render('Line 1\nLine 2\n');
	render.setCursorPosition({x: 2, y: 1});
	render('Line 1\nLine 2\nLine 3\n');

	const secondCall = (stdout.write as any).mock.calls[1]?.[0] as string;
	// After append, cursor lands at row 3 (slot below Line 3, visibleCount=3).
	// To reach y=1: cursorUp(3 - 1) = cursorUp(2).
	expect(secondCall.endsWith(
		ansiEscapes.cursorUp(2) + ansiEscapes.cursorTo(2) + showCursorEscape,
	)).toBe(true);
	expect(secondCall.includes('Line 3')).toBe(true);
});

test('appendToScrollback is mutually exclusive with incremental', () => {
	const stdout = createStdout();
	expect(() =>
		logUpdate.create(stdout, {
			showCursor: true,
			incremental: true,
			appendToScrollback: true,
		}),
	).toThrow();
});
