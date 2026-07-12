import {format} from 'node:util';

const consoleMethods = [
	'assert',
	'count',
	'countReset',
	'debug',
	'dir',
	'dirxml',
	'error',
	'group',
	'groupCollapsed',
	'groupEnd',
	'info',
	'log',
	'table',
	'time',
	'timeEnd',
	'timeLog',
	'trace',
	'warn',
] as const;

type Stream = 'stdout' | 'stderr';

const patchConsole = (callback: (stream: Stream, data: string) => void): (() => void) => {
	const originalMethods = new Map<string, (...args: unknown[]) => void>();
	for (const method of consoleMethods) {
		originalMethods.set(method, console[method].bind(console));
		const stream: Stream =
			method === 'error' || method === 'warn' || method === 'trace' || method === 'dir'
				? 'stderr'
				: 'stdout';
		console[method] = (...args: unknown[]) => {
			callback(stream, format(...args) + '\n');
		};
	}

	return () => {
		for (const method of consoleMethods) {
			const original = originalMethods.get(method);
			if (original) {
				console[method] = original;
			}
		}
	};
};

export default patchConsole;
