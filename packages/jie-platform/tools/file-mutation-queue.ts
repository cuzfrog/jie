import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

export interface FileMutationQueue {
  run<T>(path: string, operation: () => Promise<T>): Promise<T>;
}

export function createFileMutationQueue(): FileMutationQueue {
  const queues = new Map<string, Promise<void>>();
  let registrations = Promise.resolve();
  return {
    async run<T>(path: string, operation: () => Promise<T>): Promise<T> {
      const registration = registrations.then(async () => {
        const key = await mutationQueueKey(path);
        const currentQueue = queues.get(key) ?? Promise.resolve();
        let releaseNext!: () => void;
        const nextQueue = new Promise<void>((resolveQueue) => {
          releaseNext = resolveQueue;
        });
        const chainedQueue = currentQueue.then(() => nextQueue);
        queues.set(key, chainedQueue);
        return { key, currentQueue, chainedQueue, releaseNext };
      });
      registrations = registration.then(
        () => undefined,
        () => undefined,
      );
      const { key, currentQueue, chainedQueue, releaseNext } = await registration;
      await currentQueue;
      try {
        return await operation();
      } finally {
        releaseNext();
        if (queues.get(key) === chainedQueue) queues.delete(key);
      }
    },
  };
}

async function mutationQueueKey(path: string): Promise<string> {
  const resolvedPath = resolve(path);
  try {
    return await realpath(resolvedPath);
  } catch (error) {
    if (isMissingPathError(error)) return resolvedPath;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}
