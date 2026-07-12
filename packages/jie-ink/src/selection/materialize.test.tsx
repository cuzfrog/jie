import React from 'react';
import {Box, Text, render} from '../index.js';
import createStdout from '../../test/helpers/create-stdout.js';
import {createStdin} from '../../test/helpers/create-stdin.js';

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import('bun:test').expect;

async function mountAndMaterialize(
	element: React.ReactElement,
	options: {readonly width?: number; readonly height?: number} = {},
): Promise<{
	readonly cells: ReadonlyArray<ReadonlyArray<{readonly row: number; readonly column: number; readonly text: string}>>;
	readonly unmount: () => void;
}> {
	const stdout = createStdout(options.width ?? 80, true);
	const stdin = createStdin();
	const instance = render(element, {stdout, stdin, alternateScreen: false});
	await new Promise(r => setTimeout(r, 30));
	const materializer = instance.getSelectionMaterializer();
	const cells = materializer();
	return {cells, unmount: () => instance.unmount()};
}

describe('getSelectionMaterializer', () => {
	test('materializes a single Text node as cells at row 1', async () => {
		const {cells, unmount} = await mountAndMaterialize(<Text>hi</Text>);
		const row1 = cells[0] ?? [];
		const flat = row1.map(c => c.text).join('');
		expect(flat).toBe('hi');
		expect(row1[0]).toMatchObject({row: 1, column: 1, text: 'h'});
		expect(row1[1]).toMatchObject({row: 1, column: 2, text: 'i'});
		unmount();
	});

	test('materializes multi-line content across rows', async () => {
		const {cells, unmount} = await mountAndMaterialize(
			<Box flexDirection="column">
				<Text>ab</Text>
				<Text>cd</Text>
			</Box>,
		);
		const allText = cells.map(row => row.map(c => c.text).join('')).filter(Boolean);
		expect(allText).toContain('ab');
		expect(allText).toContain('cd');
		unmount();
	});

	test('box border glyphs are materialized', async () => {
		const {cells, unmount} = await mountAndMaterialize(
			<Box borderStyle="round">
				<Text>x</Text>
			</Box>,
		);
		const flat = cells.flat().map(c => c.text);
		expect(flat).toContain('╭');
		expect(flat).toContain('╮');
		expect(flat).toContain('╰');
		expect(flat).toContain('╯');
		unmount();
	});

	// Regression: rows visited out of order leave `undefined` holes in the
	// grid array. The sort pass must skip those holes; otherwise the
	// materializer throws TypeError on the live jie App where many rows are
	// empty (chat panes, prompts, borders on different rows).
	test('handles sparse rows without throwing', async () => {
		const {cells, unmount} = await mountAndMaterialize(
			<Box flexDirection="column" width={80} height={24}>
				<Text>row a</Text>
				<Box flexGrow={1} />
				<Text>row b</Text>
				<Box flexGrow={1} />
				<Text>row c</Text>
			</Box>,
			{width: 80, height: 24},
		);
		// All three texts must be present somewhere in the grid. Before the
		// sparse-row fix, the materializer threw TypeError("row.sort") and
		// returned [] from the catch, so all three texts would be missing.
		const allText = cells.flat().map(c => c.text).join('');
		expect(allText).toContain('row a');
		expect(allText).toContain('row b');
		expect(allText).toContain('row c');
		unmount();
	});
});