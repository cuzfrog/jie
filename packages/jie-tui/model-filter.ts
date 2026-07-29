export interface ModelRef {
  readonly provider: string;
  readonly id: string;
}

export function matchesModelFilter(model: ModelRef, filters: ReadonlyArray<string>): boolean {
  const target = `${model.provider}/${model.id}`.toLowerCase();
  return filters.some((filter) => target.includes(filter.toLowerCase()));
}
