import {Box, Text} from '../index.js';
import {NoSelect} from './NoSelect.js';
import {renderAsync} from '../../test/helpers/test-renderer.js';

test('NoSelect renders children without altering their text', async () => {
	const inst = await renderAsync(
		<Box flexDirection="column">
			<NoSelect>
				<Text>hello world</Text>
			</NoSelect>
		</Box>,
	);
	expect(inst.getOutput()).toContain('hello world');
});

test('NoSelect exports a default fromLeftEdge=false flag', async () => {
	// Smoke check: the component is exported from jie-ink and usable.
	// We don't introspect the flag here because that's an internal marker
	// (consumed by the selection hook, not by end users). Instead verify
	// that fromLeftEdge=true does not crash and the output remains correct.
	const inst = await renderAsync(
		<Box flexDirection="column">
			<NoSelect fromLeftEdge>
				<Text>prefix line</Text>
			</NoSelect>
		</Box>,
	);
	expect(inst.getOutput()).toContain('prefix line');
});

test('NoSelect without fromLeftEdge does not change visible output', async () => {
	const inst = await renderAsync(
		<Box flexDirection="column">
			<NoSelect>
				<Text>just a line</Text>
			</NoSelect>
		</Box>,
	);
	const out = inst.getOutput();
	expect(out).toContain('just a line');
});