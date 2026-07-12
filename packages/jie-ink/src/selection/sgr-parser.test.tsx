import {
	_renderSgrForTest,
	_splitStyledCharsForTest,
} from './materialize.js';

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import('bun:test').expect;

const CSI = '\x1b[';

describe('splitStyledChars', () => {
	test('plain text has empty sgr', () => {
		const out = _splitStyledCharsForTest('hello');
		expect(out).toEqual([
			{char: 'h', sgr: ''},
			{char: 'e', sgr: ''},
			{char: 'l', sgr: ''},
			{char: 'l', sgr: ''},
			{char: 'o', sgr: ''},
		]);
	});

	test('basic fg (90 = bright black = grey) applies to chars in range', () => {
		const out = _splitStyledCharsForTest(`${CSI}90mhi${CSI}39m`);
		expect(out).toEqual([
			{char: 'h', sgr: `${CSI}90m`},
			{char: 'i', sgr: `${CSI}90m`},
		]);
	});

	test('reset SGR (\\e[0m) clears state mid-string', () => {
		const out = _splitStyledCharsForTest(`${CSI}31mA${CSI}0mB`);
		expect(out).toEqual([
			{char: 'A', sgr: `${CSI}31m`},
			{char: 'B', sgr: ''},
		]);
	});

	test('empty param list (\\e[m) acts as reset', () => {
		const out = _splitStyledCharsForTest(`${CSI}31mX${CSI}mY`);
		expect(out[0]).toEqual({char: 'X', sgr: `${CSI}31m`});
		expect(out[1]).toEqual({char: 'Y', sgr: ''});
	});

	test('256-color fg (38;5;n) renders back to its params', () => {
		const out = _splitStyledCharsForTest(`${CSI}38;5;245mhi${CSI}39m`);
		expect(out[0]).toEqual({char: 'h', sgr: `${CSI}38;5;245m`});
		expect(out[1]).toEqual({char: 'i', sgr: `${CSI}38;5;245m`});
	});

	test('RGB fg (38;2;r;g;b) renders back to its params', () => {
		const out = _splitStyledCharsForTest(`${CSI}38;2;10;20;30mA${CSI}39m`);
		expect(out[0]).toEqual({char: 'A', sgr: `${CSI}38;2;10;20;30m`});
	});

	test('bold and italic accumulate into sgr', () => {
		const out = _splitStyledCharsForTest(`${CSI}1;3mA${CSI}22;23mB`);
		expect(out[0]).toEqual({char: 'A', sgr: `${CSI}1;3m`});
		expect(out[1]).toEqual({char: 'B', sgr: ''});
	});

	test('bg color is preserved', () => {
		const out = _splitStyledCharsForTest(`${CSI}48;5;240mX${CSI}49mY`);
		expect(out[0]).toEqual({char: 'X', sgr: `${CSI}48;5;240m`});
		expect(out[1]).toEqual({char: 'Y', sgr: ''});
	});

	test('nested chalk wraps: outer grey sets fg, inner red overrides', () => {
		const styled = `${CSI}38;5;245m${CSI}31mA${CSI}39mB${CSI}39m`;
		const out = _splitStyledCharsForTest(styled);
		expect(out[0]).toEqual({char: 'A', sgr: `${CSI}31m`});
		// After inner reset, fg returns to whatever state was set before — empty here
		expect(out[1]).toEqual({char: 'B', sgr: ''});
	});

	test('newlines are returned with the active sgr', () => {
		const out = _splitStyledCharsForTest(`${CSI}31mA\nB`);
		expect(out).toEqual([
			{char: 'A', sgr: `${CSI}31m`},
			{char: '\n', sgr: `${CSI}31m`},
			{char: 'B', sgr: `${CSI}31m`},
		]);
	});
});

describe('renderSgr', () => {
	test('empty state returns empty string', () => {
		expect(_renderSgrForTest({
			fg: [], bg: [], bold: false, dim: false, italic: false, underline: false, strikethrough: false,
		})).toBe('');
	});

	test('fg and bg combined', () => {
		expect(_renderSgrForTest({
			fg: [90], bg: [100], bold: false, dim: false, italic: false, underline: false, strikethrough: false,
		})).toBe(`${CSI}90;100m`);
	});

	test('all attrs combined', () => {
		expect(_renderSgrForTest({
			fg: [38, 5, 245], bg: [], bold: true, dim: false, italic: true, underline: true, strikethrough: true,
		})).toBe(`${CSI}38;5;245;1;3;4;9m`);
	});
});