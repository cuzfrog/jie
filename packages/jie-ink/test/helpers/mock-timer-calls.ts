export default function mockTimerCalls() {
	const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
	const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

	return {
		get setTimeoutCallCount() {
			return setTimeoutSpy.mock.calls.length;
		},
		get clearTimeoutCallCount() {
			return clearTimeoutSpy.mock.calls.length;
		},
		get timeoutDelays(): number[] {
			return setTimeoutSpy.mock.calls.map(args => (args[1] as number | undefined) ?? 0);
		},
		restore() {
			setTimeoutSpy.mockRestore();
			clearTimeoutSpy.mockRestore();
		},
	};
}