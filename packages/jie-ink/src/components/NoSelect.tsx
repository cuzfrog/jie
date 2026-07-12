import React, {forwardRef, type PropsWithChildren, type ReactNode} from 'react';
import {type DOMElement} from '../dom.js';
import Box from './Box.js';

export interface NoSelectFlag {
	readonly fromLeftEdge: boolean;
}

export interface NoSelectProps {
	readonly children?: ReactNode;
	/**
	If true, the excluded rectangle extends from the chat-pane's left edge
	to the wrapper's right edge. Used for whole-row chrome such as line
	numbers and tool-card sigils. Default is false: only the wrapper's
	intrinsic rectangle is excluded (suitable for short prefix columns).
	*/
	readonly fromLeftEdge?: boolean;
}

const NO_SELECT_ATTR = "data-no-select";

/**
Marks its subtree as non-selectable. The selection engine (jie-tui's
`useChatSelection`) walks the DOM tree under the chat root and rejects
cells inside any `NoSelect` region.

`NoSelect` is a policy wrapper, not a layout primitive. It renders a
single `<Box>` so the layout engine still measures the region, and tags
the underlying DOMElement with a `data-no-select` attribute that the
selection hook reads. It does not own text, color, or padding — wrap
it around the actual content you want to exclude.
*/
export const NoSelect = forwardRef<DOMElement, PropsWithChildren<NoSelectProps>>(
	function NoSelect({children, fromLeftEdge = false}, ref) {
		const marker: NoSelectFlag = {fromLeftEdge};
		return (
			<Box ref={ref} flexDirection="column" {...{[NO_SELECT_ATTR]: marker}}>
				{children}
			</Box>
		);
	},
);