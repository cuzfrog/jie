import { Events, type EventManager, type Sender } from "../event";

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
  let currentBlockType: BlockType | null = null;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let totalChunks = 0;

  function flush(): void {
    if (buffer.length === 0 || currentBlockType === null) {
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
      currentBlockType,
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
      currentBlockType = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },

    append(blockType: BlockType, delta: string): void {
      if (currentBlockType !== null && currentBlockType !== blockType) {
        flush();
      }
      currentBlockType = blockType;
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