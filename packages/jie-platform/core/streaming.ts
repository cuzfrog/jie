import type { EventManager } from "./event-manager.ts";
import type { Sender } from "./types.ts";

const STREAM_CHUNK_SIZE = 64;
const STREAM_FLUSH_MS = 200;

export type BlockType = "text" | "thinking";

export interface StreamPublisher {
  beginStream(): void;
  append(blockType: BlockType, delta: string): void;
  endStream(): { stream_id: number; total_chunks: number };
}

export function makeStreamPublisher(events: EventManager, sender: Sender): StreamPublisher {
  let streamId = 0;
  let buffer = "";
  let blockType: BlockType | null = null;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let totalChunks = 0;

  function flush(): void {
    if (buffer.length === 0 || blockType === null) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      return;
    }
    events.publish("agent.stream.chunk", {
      stream_id: streamId,
      seq: seq,
      block_type: blockType,
      text: buffer,
    }, sender);
    seq += 1;
    totalChunks += 1;
    buffer = "";
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {

    beginStream(): void {
      streamId += 1;
      seq = 0;
      totalChunks = 0;
      buffer = "";
      blockType = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },

    append(blockTypeValue: BlockType, delta: string): void {
      if (blockType !== null && blockType !== blockTypeValue) {
        flush();
      }
      blockType = blockTypeValue;
      buffer += delta;
      if (buffer.length >= STREAM_CHUNK_SIZE) {
        flush();
        return;
      }
      if (timer === null) {
        timer = setTimeout(() => flush(), STREAM_FLUSH_MS);
      }
    },

    endStream(): { stream_id: number; total_chunks: number } {
      flush();
      const out = { stream_id: streamId, total_chunks: totalChunks };
      events.publish("agent.stream.end", out, sender);
      return out;
    },
  };
}