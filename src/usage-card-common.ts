export type FillMeaning = "remaining" | "used";

export interface UsageCard {
	fullText: string;
	label: string;
	trackContainerElement: HTMLElement;
	resetAt: Date | null;
	durationMs: number | null;
	fillMeaning: FillMeaning;
}

export const validateTrackGeometry = (
	trackRect: DOMRect,
	fillRect: DOMRect,
): boolean => {
	if (trackRect.width < 120 || trackRect.height < 6 || trackRect.height > 18) {
		return false;
	}
	if (fillRect.height < 4 || fillRect.height > 18) {
		return false;
	}
	if (Math.abs(fillRect.top - trackRect.top) > 2) {
		return false;
	}
	if (fillRect.width < 0 || fillRect.width > trackRect.width + 1) {
		return false;
	}
	return true;
};
