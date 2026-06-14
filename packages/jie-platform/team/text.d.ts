// Bun import-attribute support: `.md` files imported with `with { type: "text" }`
// are bound as strings. The platform uses this to ship the built-in minimal
// team as `.md` files (per ADR 14).
declare module "*.md" {
  const value: string;
  export default value;
}