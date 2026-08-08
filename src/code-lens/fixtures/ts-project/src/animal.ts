export interface Animal { readonly name: string; sound(): string }
export class Dog implements Animal {
  constructor(readonly name: string) {}
  sound(): string { return "woof" }
}
function privateHelper(): number { return 1 }
export function describe(a: Animal): string {
  const label = "animal"
  return label + ":" + a.name
}
export const answer = privateHelper() + 41
