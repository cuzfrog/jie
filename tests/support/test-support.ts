export const withTTY = (value: boolean, action: () => void): void => {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  try {
    action();
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
  }
};
