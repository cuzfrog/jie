import type { EventManager } from "../event/event-manager.ts";
import { Events, type Sender } from "../event/events.ts";

const STREAM_CHUNK_SIZE = 64;
const STREAM_FLUSH_MS = 200;

export type BlockType = "text" | "thinking";

export interface StreamPublisher {
  beginStream(): void;
  append(blockType: BlockType, delta: string): void;
  endStream(): { streamId: number; totalChunks: number };
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
    events.publish(Events.agentStreamChunk(
      sender,
      streamId,
      seq,
      blockType,
      buffer,
    ));
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

    endStream(): { streamId: number; totalChunks: number } {
      flush();
      events.publish(Events.agentStreamEnd(sender, streamId, totalChunks));
      return { streamId, totalChunks };
    },
  };
}