/**
 * OSC 52 clipboard writer. Best-effort: the terminal may ignore the request,
 * which is fine — there is no native fallback in v0.2.
 *
 * The 100 KB size guard mirrors the previous chat-scoped writer in jie-tui
 * to avoid stalling the terminal on absurd payloads.
 */

import type {WriteStream} from 'node:tty';

export interface ClipboardResult {
	readonly written: boolean;
	readonly reason?: string;
}

const MAX_BYTES = 100_000;

export const writeClipboard = (stdout: WriteStream, text: string): ClipboardResult => {
	const bytes = Buffer.byteLength(text, 'utf8');
	if (bytes > MAX_BYTES) {
		return {written: false, reason: 'too_large'};
	}
	const encoded = Buffer.from(text, 'utf8').toString('base64');
	stdout.write(`\x1b]52;c;${encoded}\x07`);
	return {written: true};
};