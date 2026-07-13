import EventEmitter from 'node:events';

type WriteMock = ReturnType<typeof vi.fn>;

interface MockedStdin {
	setRawMode: WriteMock;
	read: WriteMock;
	ref: WriteMock;
	unref: WriteMock;
	setEncoding: (encoding?: BufferEncoding) => MockedStdin;
}

export type StdinMock = NodeJS.ReadStream &
	NodeJS.WriteStream &
	MockedStdin;

export const createStdin = (): StdinMock => {
	const stdin = new EventEmitter() as unknown as StdinMock;
	stdin.isTTY = true;
	stdin.setRawMode = vi.fn();
	stdin.setEncoding = (_encoding?: BufferEncoding): StdinMock => stdin;
	stdin.read = vi.fn();
	stdin.unref = vi.fn();
	stdin.ref = vi.fn();

	return stdin;
};

export const emitReadable = (
	stdin: StdinMock,
	chunk: string,
): void => {
	const read = stdin.read;
	read.mockReturnValueOnce(chunk);
	read.mockReturnValueOnce(null);
	stdin.emit('readable');
	read.mockReset();
};