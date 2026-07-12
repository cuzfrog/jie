import {EventEmitter} from 'node:events';
import {writeClipboard} from './clipboard.js';

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import('bun:test').expect;

class FakeStdout extends EventEmitter {
	readonly writes: string[] = [];
	write(chunk: string): boolean {
		this.writes.push(chunk);
		return true;
	}
}

describe('writeClipboard', () => {
	test('writes OSC 52 sequence with base64 payload', () => {
		const stdout = new FakeStdout();
		const result = writeClipboard(stdout as never, 'hello');
		expect(result.written).toBe(true);
		expect(stdout.writes).toEqual(['\x1b]52;c;aGVsbG8=\x07']);
	});

	test('returns not-written for payloads over 100 KB', () => {
		const stdout = new FakeStdout();
		const big = 'x'.repeat(100_001);
		const result = writeClipboard(stdout as never, big);
		expect(result.written).toBe(false);
		expect(result.reason).toBe('too_large');
		expect(stdout.writes).toEqual([]);
	});

	test('handles multi-byte UTF-8', () => {
		const stdout = new FakeStdout();
		const result = writeClipboard(stdout as never, '你');
		expect(result.written).toBe(true);
		expect(stdout.writes.length).toBe(1);
		// Base64 of UTF-8 你 is "5L2g"
		expect(stdout.writes[0]).toBe('\x1b]52;c;5L2g\x07');
	});

	test('empty string writes OSC 52 with empty payload', () => {
		const stdout = new FakeStdout();
		const result = writeClipboard(stdout as never, '');
		expect(result.written).toBe(true);
		expect(stdout.writes).toEqual(['\x1b]52;c;\x07']);
	});
});