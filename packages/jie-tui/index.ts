import type { EventManager } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";

export interface StartTUIOptions {
  bus: EventManager;
  artifacts: ArtifactStore;
  roles: string[];
}

export function startTUI(_options: StartTUIOptions): never {
  throw new Error("TUI not implemented in v1 MVP");
}
