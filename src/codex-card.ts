import { deriveCodexCardLabel, parseResetInfo } from "./card-info.ts";
import {
	type CodexRateLimitWindow,
	findCodexRateLimitWindow,
} from "./codex-api.ts";
import { type UsageCard, validateTrackGeometry } from "./usage-card-common.ts";
import { normalizeWhitespace } from "./utils.ts";

const CODEX_TRACK_SELECTOR: string = 'div[class*="bg-[#ebebf0]"]';
const CODEX_FILL_SELECTOR: string =
	'div[class*="bg-[#"]:not([class*="bg-[#ebebf0]"])';

const resolveCodexTrackContainer = (
	articleElement: HTMLElement,
): HTMLElement | null => {
	const trackNode: Element | null =
		articleElement.querySelector(CODEX_TRACK_SELECTOR);
	if (trackNode instanceof HTMLElement === false) {
		return null;
	}

	const trackContainerNode: HTMLElement | null = trackNode.parentElement;
	if (trackContainerNode instanceof HTMLElement === false) {
		return null;
	}

	const trackRect: DOMRect = trackNode.getBoundingClientRect();
	const fillCandidates: NodeListOf<Element> =
		trackContainerNode.querySelectorAll(CODEX_FILL_SELECTOR);
	for (const candidate of fillCandidates) {
		if (candidate instanceof HTMLElement === false) {
			continue;
		}
		if (validateTrackGeometry(trackRect, candidate.getBoundingClientRect())) {
			return trackContainerNode;
		}
	}

	return null;
};

export const collectCodexCards = (now: Date): UsageCard[] => {
	const cards: UsageCard[] = [];
	const articleNodes: NodeListOf<HTMLElement> =
		document.querySelectorAll("article");

	for (const articleNode of articleNodes) {
		const fullText: string = normalizeWhitespace(articleNode.textContent ?? "");
		if (/remaining/iu.test(fullText) === false) {
			continue;
		}

		const trackContainerElement: HTMLElement | null =
			resolveCodexTrackContainer(articleNode);
		if (trackContainerElement === null) {
			continue;
		}

		const headerElement: HTMLElement | null =
			articleNode.querySelector("header");
		const headerText: string = normalizeWhitespace(
			headerElement?.textContent ?? "",
		);
		const label: string = deriveCodexCardLabel(headerText, fullText);

		const apiWindow: CodexRateLimitWindow | null =
			findCodexRateLimitWindow(headerText);
		if (apiWindow !== null) {
			cards.push({
				fullText: fullText,
				label: label,
				trackContainerElement: trackContainerElement,
				resetAt: apiWindow.resetAt,
				durationMs: apiWindow.durationMs,
				fillMeaning: "remaining",
			});
			continue;
		}

		const durationSourceText: string =
			headerText.length > 0 ? headerText : fullText;
		const { resetAt, durationMs } = parseResetInfo(
			articleNode,
			fullText,
			durationSourceText,
			now,
		);
		cards.push({
			fullText: fullText,
			label: label,
			trackContainerElement: trackContainerElement,
			resetAt: resetAt,
			durationMs: durationMs,
			fillMeaning: "remaining",
		});
	}

	return cards;
};
