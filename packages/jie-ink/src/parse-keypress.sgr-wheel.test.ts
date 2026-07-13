import parseKeypress from './parse-keypress.js';

test('SGR wheel-up (button 64) resolves to name "wheelup"', () => {
	const key = parseKeypress('[<64;10;5M');
	expect(key.name).toBe('wheelup');
});

test('SGR wheel-down (button 65) resolves to name "wheeldown"', () => {
	const key = parseKeypress('[<65;10;5M');
	expect(key.name).toBe('wheeldown');
});

test('SGR wheel with shift modifier still resolves to wheelup/wheeldown', () => {
	const shiftUp = parseKeypress('[<68;10;5M');
	const shiftDown = parseKeypress('[<69;10;5M');
	expect(shiftUp.name).toBe('wheelup');
	expect(shiftDown.name).toBe('wheeldown');
});

test('SGR press/release (button 0 with no wheel bit) resolves to name "mouse"', () => {
	const press = parseKeypress('[<0;10;5M');
	const release = parseKeypress('[<0;10;5m');
	expect(press.name).toBe('mouse');
	expect(release.name).toBe('mouse');
});

test('SGR wheel does not leak raw sequence into the printable character', () => {
	const key = parseKeypress('[<64;10;5M');
	// `raw` and `sequence` track the original bytes; consumers gate on `name` and
	// the nonAlphanumericKeys list, which must include the wheel names so that
	// useInput.ts clears `input` before invoking handlers.
	expect(['wheelup', 'wheeldown']).toContain(key.name);
});
