export interface Subprocess {
  write(chunk: string): void;
  endStdin(): void;
  onData(handler: (chunk: string) => void): void;
  onExit(handler: (code: number | null) => void): void;
  kill(): void;
}

export interface SubprocessFactory {
  spawn(command: string, args: ReadonlyArray<string>): Subprocess;
}

export function createBunSubprocessFactory(): SubprocessFactory {
  return {
    spawn(command: string, args: ReadonlyArray<string>): Subprocess {
      return spawnBunSubprocess(command, args);
    },
  };
}

interface SubprocessHandlers {
  data: ((chunk: string) => void) | null;
  exit: ((code: number | null) => void) | null;
}

function spawnBunSubprocess(command: string, args: ReadonlyArray<string>): Subprocess {
  const proc = Bun.spawn([command, ...args], { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
  const handlers: SubprocessHandlers = { data: null, exit: null };
  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  void (async (): Promise<void> => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      handlers.data?.(decoder.decode(chunk.value, { stream: true }));
    }
  })();
  void proc.exited.then((code) => {
    handlers.exit?.(code);
  });
  return {
    write(chunk: string): void {
      proc.stdin.write(chunk);
    },
    endStdin(): void {
      proc.stdin.end();
    },
    onData(handler: (chunk: string) => void): void {
      handlers.data = handler;
    },
    onExit(handler: (code: number | null) => void): void {
      handlers.exit = handler;
    },
    kill(): void {
      try {
        proc.kill();
      } catch {}
    },
  };
}
