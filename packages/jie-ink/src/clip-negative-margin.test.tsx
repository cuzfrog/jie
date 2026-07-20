import {expect, test} from 'bun:test';
import Box from './components/Box.js';
import Text from './components/Text.js';
import renderToString from './render-to-string.js';

test('negative marginTop inside an overflow-hidden box clips rows from the top', async () => {
	const output = await renderToString(
		<Box flexDirection="column" width={10} height={5}>
			<Box overflow="hidden" flexDirection="column">
				<Box marginTop={-2} flexDirection="column">
					<Text>{'a\nb\nc\nd\ne\nf\ng'}</Text>
				</Box>
			</Box>
		</Box>,
	);
	expect(output).toContain('c');
	expect(output).toContain('g');
	expect(output).not.toContain('a');
	expect(output).not.toContain('b');
});
