import { deriveCardLabel, parseResetInfo } from "./card-info.ts";
import { type UsageCard, validateTrackGeometry } from "./usage-card-common.ts";
import { normalizeWhitespace } from "./utils.ts";

const KIMI_CARD_SELECTOR: string = ".stats-card";
const KIMI_BAR_SELECTOR: string = ".stats-card-progress-bar";
const KIMI_FILL_SELECTOR: string = ".stats-card-progress-filled";

export const collectKimiCards = (now: Date): UsageCard[] => {
	const cards: UsageCard[] = [];
	const cardNodes: NodeListOf<Element> =
		document.querySelectorAll(KIMI_CARD_SELECTOR);

	for (const cardNode of cardNodes) {
		if (cardNode instanceof HTMLElement === false) {
			continue;
		}

		const barNode: Element | null = cardNode.querySelector(KIMI_BAR_SELECTOR);
		const fillNode: Element | null = cardNode.querySelector(KIMI_FILL_SELECTOR);
		if (
			barNode instanceof HTMLElement === false ||
			fillNode instanceof HTMLElement === false
		) {
			continue;
		}

		const trackRect: DOMRect = barNode.getBoundingClientRect();
		const fillRect: DOMRect = fillNode.getBoundingClientRect();
		if (validateTrackGeometry(trackRect, fillRect) === false) {
			continue;
		}

		const fullText: string = normalizeWhitespace(cardNode.textContent ?? "");
		const label: string = deriveCardLabel(fullText);
		const parsedResetInfo: ReturnType<typeof parseResetInfo> = parseResetInfo(
			cardNode,
			fullText,
			fullText,
			now,
		);

		cards.push({
			fullText: fullText,
			label: label,
			trackContainerElement: barNode,
			resetAt: parsedResetInfo.resetAt,
			durationMs: parsedResetInfo.durationMs,
			fillMeaning: "used",
		});
	}

	return cards;
};
