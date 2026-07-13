import {Box, Text, render} from './index.js';
import createStdout from '../test/helpers/create-stdout.js';
import {createStdin} from '../test/helpers/create-stdin.js';

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import('bun:test').expect;

const ESC = String.fromCharCode(0x1b);

const captureWrites = (stdout: NodeJS.WriteStream): string[] => {
	const writes: string[] = [];
	const originalWrite = stdout.write;
	(stdout as {write: unknown}).write = (...args: unknown[]): boolean => {
		writes.push(args[0] as string);
		return (originalWrite as (...a: unknown[]) => boolean)(...args);
	};
	return writes;
};

describe('mouse tracking (DECSET 1002 + 1006)', () => {
	test('alt-screen TTY mount enables DECSET 1002 + 1006; unmount disables them', async () => {
		const stdout = createStdout(100, true);
		const stdin = createStdin();
		const writes = captureWrites(stdout);
		const instance = render(
			<Box>
				<Text>hello</Text>
			</Box>,
			{stdout, stdin, alternateScreen: true, interactive: true},
		);
		await new Promise(r => setTimeout(r, 30));
		expect(writes.some(w => w.includes(`${ESC}[?1002h`))).toBe(true);
		expect(writes.some(w => w.includes(`${ESC}[?1006h`))).toBe(true);
		instance.unmount();
		await new Promise(r => setTimeout(r, 30));
		expect(writes.some(w => w.includes(`${ESC}[?1002l`))).toBe(true);
		expect(writes.some(w => w.includes(`${ESC}[?1006l`))).toBe(true);
	});

	test('non-TTY stdout: no DECSET bytes written', async () => {
		const stdout = createStdout(100, false);
		const stdin = createStdin();
		const writes = captureWrites(stdout);
		const instance = render(
			<Box>
				<Text>hello</Text>
			</Box>,
			{stdout, stdin, alternateScreen: true},
		);
		await new Promise(r => setTimeout(r, 30));
		expect(writes.some(w => w.includes('?1002h'))).toBe(false);
		expect(writes.some(w => w.includes('?1006h'))).toBe(false);
		instance.unmount();
	});

	test('non-interactive stdout: no DECSET bytes written', async () => {
		const stdout = createStdout(100, true);
		const stdin = createStdin();
		const writes = captureWrites(stdout);
		const instance = render(
			<Box>
				<Text>hello</Text>
			</Box>,
			{stdout, stdin, alternateScreen: true, interactive: false},
		);
		await new Promise(r => setTimeout(r, 30));
		expect(writes.some(w => w.includes('?1002h'))).toBe(false);
		expect(writes.some(w => w.includes('?1006h'))).toBe(false);
		instance.unmount();
	});

	test('alt-screen off: no DECSET bytes written (only enabled in alt-screen)', async () => {
		const stdout = createStdout(100, true);
		const stdin = createStdin();
		const writes = captureWrites(stdout);
		const instance = render(
			<Box>
				<Text>hello</Text>
			</Box>,
			{stdout, stdin, alternateScreen: false},
		);
		await new Promise(r => setTimeout(r, 30));
		expect(writes.some(w => w.includes('?1002h'))).toBe(false);
		expect(writes.some(w => w.includes('?1006h'))).toBe(false);
		instance.unmount();
	});
});