/**
 * Cached wrapper around the DOM-walk materializer. The expensive grid is
 * re-computed only when the underlying tree has changed, signalled by an
 * explicit `invalidate()` call. For drag selection, the DOM is stable
 * across mouse motion events between renders, so this turns O(motions)
 * walks into O(layoutCommits) walks.
 *
 * On source error the cache falls back to an empty grid and self-marks
 * dirty so the next call retries — matching the previous best-effort
 * behavior in Ink.
 */

import type {CellPosition} from './selection-engine.js';

export type GridSource = () => ReadonlyArray<ReadonlyArray<CellPosition>>;

export interface CachedMaterializer {
	(): ReadonlyArray<ReadonlyArray<CellPosition>>;
	/** Mark the cached grid as stale; the next call will re-run the source. */
	invalidate: () => void;
}

export const createCachedMaterializer = (
	source: GridSource,
): CachedMaterializer => {
	let cache: ReadonlyArray<ReadonlyArray<CellPosition>> | undefined;
	let dirty = true;
	const get = (): ReadonlyArray<ReadonlyArray<CellPosition>> => {
		if (!dirty && cache !== undefined) return cache;
		try {
			cache = source();
			dirty = false;
		} catch {
			cache = [];
			dirty = true;
		}
		return cache;
	};
	return Object.assign(get, {
		invalidate: (): void => {
			dirty = true;
		},
	}) as CachedMaterializer;
};