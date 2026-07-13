import {
  type Mock,
  vi as _bunVi,
  test as _test,
  expect as _expect,
  describe as _describe,
  afterAll as _afterAll,
  afterEach as _afterEach,
  beforeAll as _beforeAll,
  beforeEach as _beforeEach,
} from 'bun:test';

process.env.FORCE_COLOR = '1';

// this is hacking for test setup, exempted from context rules.
const _vi = Object.assign(_bunVi, {
  mocked: <T>(item: T): T extends (...args: any[]) => any
    ? Mock<T>
    : T extends Record<string, any>
      ? { [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : T[K] }
      : T => item as never,
});

Object.assign(globalThis, {
  test: _test,
  expect: _expect,
  describe: _describe,
  beforeAll: _beforeAll,
  beforeEach: _beforeEach,
  afterEach: _afterEach,
  afterAll: _afterAll,
  vi: _vi,
});

beforeEach(() => {
  _vi.resetAllMocks();
});

declare global {
  const test: typeof _test;
  const expect: typeof _expect;
  const describe: typeof _describe;
  const beforeAll: typeof _beforeAll;
  const beforeEach: typeof _beforeEach;
  const afterEach: typeof _afterEach;
  const afterAll: typeof _afterAll;

  const vi: typeof _vi;
}
