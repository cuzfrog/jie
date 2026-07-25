import { Dog } from "./animal"
export function greet(a: { name: string }): string { return "hi " + a.name }
export const d = new Dog("rex")
