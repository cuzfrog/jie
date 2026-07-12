import React, {type JSX} from 'react';
import {Box, Text} from './index.js';
import {renderToString} from '../test/helpers/render-to-string.js';
import {enableTestColors, disableTestColors} from '../test/helpers/force-colors.js';

beforeAll(() => {
	enableTestColors();
});

afterAll(() => {
	disableTestColors();
});

const Row = ({label}: {label: string}): JSX.Element => (
	<Box flexDirection="column">
		<Text>{label}</Text>
		<Text>{'  reply-' + label}</Text>
	</Box>
);

test('overflow="scrollBottom" anchors tall content to the bottom', () => {
	const out = renderToString(
		<Box width={30} height={2} overflow="scrollBottom" flexDirection="column">
			{Array.from({length: 6}, (_, i) => <Row key={i} label={'turn-' + i} />)}
		</Box>,
	);

	expect(out).not.toContain('turn-0');
	expect(out).not.toContain('turn-3');
	expect(out).toContain('turn-5');
	expect(out).toContain('reply-turn-5');
});

test('overflow="scrollBottom" with content smaller than height renders all rows', () => {
	const out = renderToString(
		<Box width={30} height={20} overflow="scrollBottom" flexDirection="column">
			{Array.from({length: 6}, (_, i) => <Row key={i} label={'turn-' + i} />)}
		</Box>,
	);

	expect(out).toContain('turn-0');
	expect(out).toContain('reply-turn-5');
});
