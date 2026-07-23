export interface Console {
  print(...args: ReadonlyArray<string>): void;
  error(...args: ReadonlyArray<string>): void;
  write(text: string): void;
}

export const defaultConsole: Console = {
  print: (...args: ReadonlyArray<string>) => console.log(...args),
  error: (...args: ReadonlyArray<string>) => console.error(...args),
  write: (text: string) => {
    process.stdout.write(text);
  },
};
