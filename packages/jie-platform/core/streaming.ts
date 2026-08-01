import { Events, type AgentSender, type EventManager } from "../event";

const STREAM_CHUNK_SIZE = 64;
const STREAM_FLUSH_MS = 200;

export type BlockType = "text" | "thinking";

export interface StreamPublisher {
  beginStream(): void;
  append(blockType: BlockType, delta: string): void;
  endStream(): { readonly streamId: number; readonly totalChunks: number };
}

export class StreamPublisherImpl implements StreamPublisher {
  private streamId = 0;
  private buffer = "";
  private currentBlockType: BlockType | null = null;
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private totalChunks = 0;
  private thinkingStartedAt: number | null = null;
  private thinkingMs: number | null = null;

  constructor(
    private readonly events: EventManager,
    private readonly sender: AgentSender,
  ) {}

  beginStream(): void {
    this.streamId += 1;
    this.seq = 0;
    this.totalChunks = 0;
    this.buffer = "";
    this.currentBlockType = null;
    this.thinkingStartedAt = null;
    this.thinkingMs = null;
    this.clearTimer();
  }

  append(blockType: BlockType, delta: string): void {
    if (this.currentBlockType !== null && this.currentBlockType !== blockType) {
      this.finalizeThinking();
      this.flush();
    }
    if (blockType === "thinking" && this.thinkingStartedAt === null) {
      this.thinkingStartedAt = Date.now();
    }
    this.currentBlockType = blockType;
    this.buffer += delta;
    if (this.buffer.length >= STREAM_CHUNK_SIZE) {
      this.flush();
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), STREAM_FLUSH_MS);
    }
  }

  endStream(): { streamId: number; totalChunks: number } {
    this.finalizeThinking();
    this.flush();
    this.events.publish(Events.agentStreamEnd(this.sender, this.streamId, this.totalChunks, this.thinkingMs));
    return { streamId: this.streamId, totalChunks: this.totalChunks };
  }

  private finalizeThinking(): void {
    if (this.thinkingStartedAt !== null) {
      this.thinkingMs = (this.thinkingMs ?? 0) + (Date.now() - this.thinkingStartedAt);
      this.thinkingStartedAt = null;
    }
  }

  private flush(): void {
    if (this.buffer.length === 0 || this.currentBlockType === null) {
      this.clearTimer();
      return;
    }
    this.events.publish(Events.agentStreamChunk(this.sender, this.streamId, this.seq, this.currentBlockType, this.buffer));
    this.seq += 1;
    this.totalChunks += 1;
    this.buffer = "";
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
