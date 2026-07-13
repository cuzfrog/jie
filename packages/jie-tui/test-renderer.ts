import {EventEmitter} from 'node:events';
import type {ReactElement} from 'react';
import {render as jieInkRender} from '@cuzfrog/jie-ink';

class Stdout extends EventEmitter {
	isTTY: boolean = false;
	columns: number = 100;
	rows: number = 24;
	frames: string[] = [];
	_lastFrame: string | undefined;
	write = (frame: string): void => {
		this.frames.push(frame);
		this._lastFrame = frame;
	};
	lastFrame = (): string | undefined => this._lastFrame;
	resize = (columns: number, rows: number): void => {
		this.columns = columns;
		this.rows = rows;
		this.emit('resize');
	};
}

class Stderr extends EventEmitter {
	isTTY: boolean = false;
	columns: number = 100;
	rows: number = 24;
	frames: string[] = [];
	_lastFrame: string | undefined;
	write = (frame: string): void => {
		this.frames.push(frame);
		this._lastFrame = frame;
	};
	lastFrame = (): string | undefined => this._lastFrame;
	resize = (columns: number, rows: number): void => {
		this.columns = columns;
		this.rows = rows;
		this.emit('resize');
	};
}

class Stdin extends EventEmitter {
	isTTY: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
	data: string | null = null;
	constructor(options: {isTTY?: boolean} = {}) {
		super();
		this.isTTY = options.isTTY ?? true;
	}
	write = (data: string): void => {
		this.data = data;
		this.emit('readable');
		this.emit('data', data);
	};
	setEncoding(): void {}
	setRawMode(): void {}
	resume(): void {}
	pause(): void {}
	ref(): void {}
	unref(): void {}
	read = (): string | null => {
		const {data} = this;
		this.data = null;
		return data;
	};
}

export type Instance = {
	rerender: (tree: ReactElement) => void;
	unmount: () => void;
	cleanup: () => void;
	stdout: Stdout;
	stderr: Stderr;
	stdin: Stdin;
	frames: string[];
	lastFrame: () => string | undefined;
};

const instances: Array<{unmount: () => void; cleanup: () => void}> = [];

export interface RenderOptions {
	readonly appendToScrollback?: boolean;
	readonly stdoutIsTTY?: boolean;
}

export const render = (
	tree: ReactElement,
	options: RenderOptions = {},
): Instance => {
	const stdout = new Stdout();
	stdout.isTTY = options.stdoutIsTTY ?? false;
	const stderr = new Stderr();
	const stdin = new Stdin();
	const instance = jieInkRender(tree, {
		stdout: stdout as unknown as NodeJS.WriteStream,
		stderr: stderr as unknown as NodeJS.WriteStream,
		stdin: stdin as unknown as NodeJS.ReadStream,
		debug: true,
		exitOnCtrlC: false,
		patchConsole: false,
		appendToScrollback: options.appendToScrollback,
	});
	instances.push(instance);
	return {
		rerender: instance.rerender,
		unmount: instance.unmount,
		cleanup: instance.cleanup,
		stdout,
		stderr,
		stdin,
		frames: stdout.frames,
		lastFrame: stdout.lastFrame,
	};
};

export const cleanup = (): void => {
	for (const instance of instances) {
		instance.unmount();
		instance.cleanup();
	}
};
