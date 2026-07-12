import parseKeypress, { nonAlphanumericKeys } from './parse-keypress.js';

test('SGR left-button press (button 0) is absorbed as "mouse"', () => {
	const key = parseKeypress('[<0;10;5M');
	expect(key.name).toBe('mouse');
	expect(key.mouse).toEqual({
		button: 0,
		x: 10,
		y: 5,
		terminator: 'press',
		modifiers: { shift: false, meta: false, ctrl: false },
	});
});

test('SGR left-button release (terminator m) is absorbed as "mouse"', () => {
	const key = parseKeypress('[<0;10;5m');
	expect(key.name).toBe('mouse');
	expect(key.mouse).toEqual({
		button: 0,
		x: 10,
		y: 5,
		terminator: 'release',
		modifiers: { shift: false, meta: false, ctrl: false },
	});
});

test('SGR middle-button drag (button 32, motion with button held) is absorbed as "mouse"', () => {
	const key = parseKeypress('[<32;11;6M');
	expect(key.name).toBe('mouse');
	expect(key.mouse?.button).toBe(32);
	expect(key.mouse?.x).toBe(11);
	expect(key.mouse?.y).toBe(6);
	expect(key.mouse?.terminator).toBe('press');
});

test('SGR modified motion decodes Shift/Meta/Ctrl but preserves raw button', () => {
	// button = 32 (motion-with-left-held) | 4 (Shift) | 8 (Meta) | 16 (Ctrl) = 60
	const key = parseKeypress('[<60;7;8M');
	expect(key.name).toBe('mouse');
	expect(key.mouse?.button).toBe(60);
	expect(key.mouse?.modifiers).toEqual({ shift: true, meta: true, ctrl: true });
});

test('SGR non-wheel mouse keeps raw bytes in sequence for useInput to ignore', () => {
	const key = parseKeypress('[<0;10;5M');
	expect(key.sequence).toBe('[<0;10;5M');
});

test('"mouse" is in nonAlphanumericKeys so useInput clears input for it', () => {
	expect(nonAlphanumericKeys).toContain('mouse');
});

test('X10 legacy mouse (DECSET 1000 without 1006) is absorbed as "mouse" without structured payload', () => {
	const key = parseKeypress('[M   ');
	expect(key.name).toBe('mouse');
	expect(key.mouse).toBeUndefined();
});

test('X10 mouse with a higher button byte is still absorbed without structured payload', () => {
	const key = parseKeypress('[M" !');
	expect(key.name).toBe('mouse');
	expect(key.mouse).toBeUndefined();
});