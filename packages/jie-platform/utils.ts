/** Not undefined, not null, not empty string. */
export function checkNonEmpty<T>(v: T | undefined): T {
    if (v === null) {
        throw new TypeError("Value is null");
    } else if (v === undefined) {
        throw new TypeError("Value is undefined");
    } else if (typeof v === "string" && v.length === 0) {
        throw new Error("Value is empty string.");
    }
    return v;
}
