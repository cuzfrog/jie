export interface ContextFile {
  readonly path: string;
  readonly content: string;
}

export interface LoadContextFilesOptions {
  readonly cwd: string;
  readonly homeJieDir: string;
}
