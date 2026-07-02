import {
	deriveCardLabel,
	deriveCodexCardLabel,
	ONE_WEEK_MS,
	parseResetInfo,
} from "./card-info.ts";
import {
	type CodexRateLimitWindow,
	findCodexRateLimitWindow,
} from "./codex-api.ts";
import { normalizeWhitespace } from "./utils.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODEX_TRACK_SELECTOR: string = 'div[class*="bg-[#ebebf0]"]';
const CODEX_FILL_SELECTOR: string =
	'div[class*="bg-[#"]:not([class*="bg-[#ebebf0]"])';

const CLAUDE_TRACK_SELECTOR: string =
	'div[class~="bg-alpha-2"][class~="h-2"][class~="rounded-full"]';
// Fill color shifts with usage level (accent, warning, ...), so match the
// bg-fill- prefix instead of one concrete color.
const CLAUDE_FILL_SELECTOR: string = 'div[class*="bg-fill-"]';

const KIMI_CARD_SELECTOR: string = ".stats-card";
const KIMI_BAR_SELECTOR: string = ".stats-card-progress-bar";
const KIMI_FILL_SELECTOR: string = ".stats-card-progress-filled";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FillMeaning = "remaining" | "used";

export interface UsageCard {
	fullText: string;
	label: string;
	trackContainerElement: HTMLElement;
	resetAt: Date | null;
	durationMs: number | null;
	fillMeaning: FillMeaning;
}

// ---------------------------------------------------------------------------
// Geometry validation
// ---------------------------------------------------------------------------

const validateTrackGeometry = (
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

// ---------------------------------------------------------------------------
// Codex card collection
// ---------------------------------------------------------------------------

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

const collectCodexCards = (now: Date): UsageCard[] => {
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

// ---------------------------------------------------------------------------
// Claude card collection
// ---------------------------------------------------------------------------

interface ClaudeProgressElements {
	trackContainerElement: HTMLElement;
	rowElement: HTMLElement;
}

const resolveClaudeProgressElements = (
	candidateNode: HTMLElement,
): ClaudeProgressElements | null => {
	const fillNode: Element | null =
		candidateNode.querySelector(CLAUDE_FILL_SELECTOR);
	if (fillNode instanceof HTMLElement === false) {
		return null;
	}

	const trackRect: DOMRect = candidateNode.getBoundingClientRect();
	const fillRect: DOMRect = fillNode.getBoundingClientRect();
	if (validateTrackGeometry(trackRect, fillRect) === false) {
		return null;
	}

	const trackContainerNode: HTMLElement | null = candidateNode.parentElement;
	if (trackContainerNode instanceof HTMLElement === false) {
		return null;
	}

	const rowNode: HTMLElement | null =
		trackContainerNode.parentElement?.parentElement ?? null;
	if (rowNode instanceof HTMLElement === false) {
		return null;
	}

	return {
		trackContainerElement: trackContainerNode,
		rowElement: rowNode,
	};
};

const CLAUDE_SKIP_PATTERNS: readonly RegExp[] = [
	/\$[\d,.]+\s+spent/iu,
	/\bdaily\s+included\b/iu,
];

const collectClaudeCards = (now: Date): UsageCard[] => {
	const cards: UsageCard[] = [];
	const trackCandidates: NodeListOf<Element> = document.querySelectorAll(
		CLAUDE_TRACK_SELECTOR,
	);

	for (const candidateNode of trackCandidates) {
		if (candidateNode instanceof HTMLElement === false) {
			continue;
		}

		const resolved: ReturnType<typeof resolveClaudeProgressElements> =
			resolveClaudeProgressElements(candidateNode);
		if (resolved === null) {
			continue;
		}

		const rowText: string = normalizeWhitespace(
			resolved.rowElement.textContent ?? "",
		);
		const shouldSkip: boolean = CLAUDE_SKIP_PATTERNS.some(
			(pattern: RegExp): boolean => pattern.test(rowText),
		);
		if (shouldSkip === true) {
			continue;
		}

		// Row text lacks the window kind ("All models Resets in 23 hr"), but the
		// enclosing section heading carries it ("Weekly limits").
		const sectionHeadingText: string = normalizeWhitespace(
			candidateNode.closest("section")?.querySelector("h1, h2, h3, h4")
				?.textContent ?? "",
		);
		const { resetAt, durationMs } = parseResetInfo(
			resolved.rowElement,
			rowText,
			`${sectionHeadingText} ${rowText}`,
			now,
		);

		cards.push({
			fullText: rowText,
			label: deriveCardLabel(rowText),
			trackContainerElement: resolved.trackContainerElement,
			resetAt: resetAt,
			durationMs: durationMs,
			fillMeaning: "used",
		});
	}

	return cards;
};

// ---------------------------------------------------------------------------
// Kimi card collection
// ---------------------------------------------------------------------------

const collectKimiCards = (now: Date): UsageCard[] => {
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
		const { resetAt, durationMs } = parseResetInfo(
			cardNode,
			fullText,
			fullText,
			now,
		);

		cards.push({
			fullText: fullText,
			label: deriveCardLabel(fullText),
			trackContainerElement: barNode,
			resetAt: resetAt,
			durationMs: durationMs,
			fillMeaning: "used",
		});
	}

	return cards;
};

// ---------------------------------------------------------------------------
// Missing reset backfill
// ---------------------------------------------------------------------------

const buildResetByDurationLookup = (cards: UsageCard[]): Map<number, Date> => {
	const lookup: Map<number, Date> = new Map<number, Date>();
	for (const card of cards) {
		if (card.durationMs === null || card.resetAt === null) {
			continue;
		}
		if (lookup.has(card.durationMs) === false) {
			lookup.set(card.durationMs, card.resetAt);
		}
	}
	return lookup;
};

const findWeeklyReset = (cards: UsageCard[]): Date | null => {
	for (const card of cards) {
		if (/weekly/iu.test(card.fullText) === true && card.resetAt !== null) {
			return card.resetAt;
		}
	}
	return null;
};

export const resolveMissingResetInformation = (cards: UsageCard[]): void => {
	const resetByDurationLookup: Map<number, Date> =
		buildResetByDurationLookup(cards);
	const weeklyReset: Date | null = findWeeklyReset(cards);

	for (const card of cards) {
		if (card.resetAt !== null) {
			continue;
		}

		if (card.durationMs !== null) {
			const fallbackReset: Date | undefined = resetByDurationLookup.get(
				card.durationMs,
			);
			if (fallbackReset !== undefined) {
				card.resetAt = fallbackReset;
				continue;
			}
		}

		if (
			/code\s*review/iu.test(card.fullText) === true &&
			weeklyReset !== null
		) {
			card.durationMs = ONE_WEEK_MS;
			card.resetAt = weeklyReset;
		}
	}
};

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

export const collectUsageCards = (now: Date): UsageCard[] => {
	const hostname: string = globalThis.location.hostname;
	if (hostname === "claude.ai") {
		return collectClaudeCards(now);
	}
	if (hostname === "www.kimi.com") {
		return collectKimiCards(now);
	}
	return collectCodexCards(now);
};
