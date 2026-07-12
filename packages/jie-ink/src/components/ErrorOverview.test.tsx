import stripAnsi from 'strip-ansi';
import {renderToString} from '../index.js';
import ErrorOverview from '../components/ErrorOverview.js';

const createErrorWithStack = (stack: string) => {
	const error = new Error('Oh no');
	error.stack = stack;

	return error;
};

test('renders native stack frames as raw lines', () => {
	const output = stripAnsi(
		renderToString(
			<ErrorOverview
				error={createErrorWithStack('Error: Oh no\n    at native')}
			/>,
		),
	);

	expect(output.includes(' -     at native')).toBe(true);
	expect(output.includes('undefined')).toBe(false);
});

test('renders named native stack frames as raw lines', () => {
	const output = stripAnsi(
		renderToString(
			<ErrorOverview
				error={createErrorWithStack('Error: Oh no\n    at foo (native)')}
			/>,
		),
	);

	expect(output.includes(' -     at foo (native)')).toBe(true);
	expect(output.includes('foo (::)')).toBe(false);
	expect(output.includes('undefined')).toBe(false);
});

test('does not emit duplicate key warnings for repeated stack lines', () => {
	const consoleErrors: string[] = [];
	const errorSpy = vi
		.spyOn(console, 'error')
		.mockImplementation((...arguments_: unknown[]) => {
			consoleErrors.push(arguments_.join(' '));
		});

	try {
		renderToString(
			<ErrorOverview error={createErrorWithStack('Error: Oh no\n\n\n')} />,
		);
	} finally {
		errorSpy.mockRestore();
	}

	expect(consoleErrors.some(error =>
			error.includes('Encountered two children with the same key'),
		)).toBe(false);
});
