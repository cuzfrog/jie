import parseKeypress, { nonAlphanumericKeys } from './parse-keypress.js';

test('SGR left-button press (button 0) is absorbed as "mouse"', () => {
	const key = parseKeypress('[<0;10;5M');
	expect(key.name).toBe('mouse');
});

test('SGR left-button release (terminator m) is absorbed as "mouse"', () => {
	const key = parseKeypress('[<0;10;5m');
	expect(key.name).toBe('mouse');
});

test('SGR middle-button drag (button 32, motion with button held) is absorbed as "mouse"', () => {
	const key = parseKeypress('[<32;10;5M');
	expect(key.name).toBe('mouse');
});

test('SGR non-wheel mouse keeps raw bytes in sequence for useInput to ignore', () => {
	const key = parseKeypress('[<0;10;5M');
	expect(key.sequence).toBe('[<0;10;5M');
});

test('"mouse" is in nonAlphanumericKeys so useInput clears input for it', () => {
	expect(nonAlphanumericKeys).toContain('mouse');
});

test('X10 legacy mouse (DECSET 1000 without 1006) is absorbed as "mouse"', () => {
	const key = parseKeypress('[M   ');
	expect(key.name).toBe('mouse');
});

test('X10 mouse with a higher button byte is still absorbed', () => {
	const key = parseKeypress('[M" !');
	expect(key.name).toBe('mouse');
});