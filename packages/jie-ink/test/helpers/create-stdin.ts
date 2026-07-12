import EventEmitter from 'node:events';

export const createStdin = (): NodeJS.WriteStream => {
	const stdin = new EventEmitter() as unknown as NodeJS.WriteStream;
	stdin.isTTY = true;
	stdin.setRawMode = vi.fn();
	stdin.setEncoding = (): void => {};
	stdin.read = vi.fn();
	stdin.unref = (): void => {};
	stdin.ref = (): void => {};

	return stdin;
};

export const emitReadable = (
	stdin: NodeJS.WriteStream,
	chunk: string,
): void => {
	const read = stdin.read as ReturnType<typeof vi.fn>;
	read.mockReturnValueOnce(chunk);
	read.mockReturnValueOnce(null);
	stdin.emit('readable');
	read.mockReset();
};
