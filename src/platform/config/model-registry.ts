import type { Api, AuthResult, Model } from "@earendil-works/pi-ai";

export interface ProviderInfo {
  readonly id: string;
  readonly configured: boolean;
  readonly envKeys: ReadonlyArray<string>;
}

export interface ModelRegistry {
  providers(): ReadonlyArray<string>;
  listProviders(): ReadonlyArray<ProviderInfo>;
  resolve(provider: string, modelId: string): Model<Api> | undefined;
  listModels(provider: string): ReadonlyArray<Model<Api>>;
  getAuth(provider: string): Promise<AuthResult | undefined>;
  reload(): Promise<void>;
  refresh(force: boolean): Promise<{ readonly errors: ReadonlyArray<string> }>;
}
