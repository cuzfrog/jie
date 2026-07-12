import term from '../../test/helpers/term.js';

test.skip('useInput - handle up arrow', async () => {
	const ps = term('use-input', ['upArrow']);
	ps.write('[A');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle down arrow', async () => {
	const ps = term('use-input', ['downArrow']);
	ps.write('[B');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle left arrow', async () => {
	const ps = term('use-input', ['leftArrow']);
	ps.write('[D');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle right arrow', async () => {
	const ps = term('use-input', ['rightArrow']);
	ps.write('[C');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handles rapid arrows and enter in one chunk', async () => {
	const ps = term('use-input', ['rapidArrowsEnter']);
	ps.write('[B[B[B\r');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle meta + up arrow', async () => {
	const ps = term('use-input', ['upArrowMeta']);
	ps.write('[A');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle meta + down arrow', async () => {
	const ps = term('use-input', ['downArrowMeta']);
	ps.write('[B');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle meta + left arrow', async () => {
	const ps = term('use-input', ['leftArrowMeta']);
	ps.write('[D');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle meta + right arrow', async () => {
	const ps = term('use-input', ['rightArrowMeta']);
	ps.write('[C');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle ctrl + up arrow', async () => {
	const ps = term('use-input', ['upArrowCtrl']);
	ps.write('[1;5A');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle ctrl + down arrow', async () => {
	const ps = term('use-input', ['downArrowCtrl']);
	ps.write('[1;5B');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle ctrl + left arrow', async () => {
	const ps = term('use-input', ['leftArrowCtrl']);
	ps.write('[1;5D');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle ctrl + right arrow', async () => {
	const ps = term('use-input', ['rightArrowCtrl']);
	ps.write('[1;5C');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle page down', async () => {
	const ps = term('use-input', ['pageDown']);
	ps.write('[6~');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle page up', async () => {
	const ps = term('use-input', ['pageUp']);
	ps.write('[5~');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle home', async () => {
	const ps = term('use-input', ['home']);
	ps.write('[H');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});

test.skip('useInput - handle end', async () => {
	const ps = term('use-input', ['end']);
	ps.write('[F');
	await ps.waitForExit();
	expect(ps.output.includes('exited')).toBe(true);
});