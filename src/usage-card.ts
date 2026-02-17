import {
	type CodexRateLimitWindow,
	findCodexRateLimitWindow,
} from "./codex-api.ts";
import { parseResetDate } from "./reset-date.ts";
import { normalizeWhitespace } from "./utils.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ONE_WEEK_MS: number = 7 * 24 * 60 * 60 * 1_000;

const CODEX_TRACK_SELECTOR: string = 'div[class*="bg-[#ebebf0]"]';
const CODEX_FILL_SELECTOR: string = 'div[class*="bg-[#22c55e]"]';

const CLAUDE_TRACK_SELECTOR: string =
	'div[class*="bg-bg-000"][class*="h-4"][class*="rounded"]';
const CLAUDE_FILL_SELECTOR: string = 'div[class*="h-full"]';

const KIMI_CARD_SELECTOR: string = ".stats-card";
const KIMI_BAR_SELECTOR: string = ".stats-card-progress-bar";
const KIMI_FILL_SELECTOR: string = ".stats-card-progress-filled";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FillMeaning = "remaining" | "used";

export interface UsageCard {
	fullText: string;
	trackElement: HTMLElement;
	fillElement: HTMLElement;
	trackContainerElement: HTMLElement;
	resetAt: Date | null;
	durationMs: number | null;
	fillMeaning: FillMeaning;
}

interface ProgressElements {
	trackElement: HTMLElement;
	fillElement: HTMLElement;
	trackContainerElement: HTMLElement;
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
// Reset / duration inference
// ---------------------------------------------------------------------------

const inferDurationMs = (
	text: string,
	resetLabel: string | null,
): number | null => {
	if (/weekly/i.test(text) === true || /code\s*review/i.test(text) === true) {
		return ONE_WEEK_MS;
	}
	if (/\brate\s+limit\b/i.test(text) === true) {
		return null;
	}
	if (resetLabel !== null) {
		const hoursMatch: RegExpMatchArray | null = resetLabel.match(
			/\bin\s+(\d+)\s+hours?\b/i,
		);
		if (hoursMatch !== null) {
			const hours: number = Number.parseInt(hoursMatch[1] ?? "0", 10);
			if (Number.isNaN(hours) === false && hours >= 24) {
				return ONE_WEEK_MS;
			}
		}
	}
	if (
		resetLabel !== null &&
		/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*/i.test(resetLabel) === true
	) {
		return ONE_WEEK_MS;
	}
	return null;
};

const extractResetLabel = (text: string): string | null => {
	const label: string | undefined = text.match(/Resets\s+(.+)$/i)?.[1]?.trim();
	if (label === undefined || label.length === 0) {
		return null;
	}
	return label;
};

const findResetLabel = (
	containerElement: HTMLElement,
	fullText: string,
): string | null => {
	const candidateNodes: NodeListOf<Element> =
		containerElement.querySelectorAll("p, span, div");
	for (const candidateNode of candidateNodes) {
		if (candidateNode instanceof HTMLElement === false) {
			continue;
		}

		const label: string | null = extractResetLabel(
			normalizeWhitespace(candidateNode.textContent ?? ""),
		);
		if (label !== null) {
			return label;
		}
	}

	return extractResetLabel(fullText);
};

const parseResetInfo = (
	containerElement: HTMLElement,
	fullText: string,
	durationSourceText: string,
	now: Date,
): { resetAt: Date | null; durationMs: number | null } => {
	const resetLabel: string | null = findResetLabel(containerElement, fullText);
	const resetAt: Date | null =
		resetLabel === null ? null : parseResetDate(resetLabel, now);
	const durationMs: number | null = inferDurationMs(
		durationSourceText,
		resetLabel,
	);
	return {
		resetAt: resetAt,
		durationMs: durationMs,
	};
};

// ---------------------------------------------------------------------------
// Codex card collection
// ---------------------------------------------------------------------------

const resolveCodexProgressElements = (
	articleElement: HTMLElement,
): ProgressElements | null => {
	const trackNode: Element | null =
		articleElement.querySelector(CODEX_TRACK_SELECTOR);
	const fillNode: Element | null =
		articleElement.querySelector(CODEX_FILL_SELECTOR);
	if (
		trackNode instanceof HTMLElement === false ||
		fillNode instanceof HTMLElement === false
	) {
		return null;
	}

	const trackContainerNode: HTMLElement | null = trackNode.parentElement;
	if (trackContainerNode instanceof HTMLElement === false) {
		return null;
	}

	const trackRect: DOMRect = trackNode.getBoundingClientRect();
	const fillRect: DOMRect = fillNode.getBoundingClientRect();
	if (validateTrackGeometry(trackRect, fillRect) === false) {
		return null;
	}

	return {
		trackElement: trackNode,
		fillElement: fillNode,
		trackContainerElement: trackContainerNode,
	};
};

const collectCodexCards = (now: Date): UsageCard[] => {
	const cards: UsageCard[] = [];
	const articleNodes: NodeListOf<HTMLElement> =
		document.querySelectorAll("article");

	for (const articleNode of articleNodes) {
		const fullText: string = normalizeWhitespace(articleNode.textContent ?? "");
		if (/remaining/i.test(fullText) === false) {
			continue;
		}

		const resolved: ProgressElements | null =
			resolveCodexProgressElements(articleNode);
		if (resolved === null) {
			continue;
		}

		const headerElement: HTMLElement | null =
			articleNode.querySelector("header");
		const headerText: string = normalizeWhitespace(
			headerElement?.textContent ?? "",
		);

		const apiWindow: CodexRateLimitWindow | null =
			findCodexRateLimitWindow(headerText);
		if (apiWindow !== null) {
			cards.push({
				fullText: fullText,
				...resolved,
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
			...resolved,
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

const resolveClaudeProgressElements = (
	candidateNode: HTMLElement,
): (ProgressElements & { rowElement: HTMLElement }) | null => {
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
		trackElement: candidateNode,
		fillElement: fillNode,
		trackContainerElement: trackContainerNode,
		rowElement: rowNode,
	};
};

const CLAUDE_SKIP_PATTERNS: readonly RegExp[] = [
	/current\s+session/i,
	/\$[\d,.]+\s+spent/i,
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

		const { resetAt, durationMs } = parseResetInfo(
			resolved.rowElement,
			rowText,
			rowText,
			now,
		);

		cards.push({
			fullText: rowText,
			trackElement: resolved.trackElement,
			fillElement: resolved.fillElement,
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
			trackElement: barNode,
			fillElement: fillNode,
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
		if (/weekly/i.test(card.fullText) === true && card.resetAt !== null) {
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

		if (/code review/i.test(card.fullText) === true && weeklyReset !== null) {
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
