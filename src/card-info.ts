import { parseRelativeDurationMs, parseResetDate } from "./reset-date.ts";
import { normalizeWhitespace } from "./utils.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ONE_WEEK_MS: number = 7 * 24 * 60 * 60 * 1000;

const ONE_HOUR_MS: number = 60 * 60 * 1000;
const FIVE_HOURS_MS: number = 5 * ONE_HOUR_MS;
const MAX_FALLBACK_LABEL_LENGTH: number = 40;

// ---------------------------------------------------------------------------
// Card label derivation
// ---------------------------------------------------------------------------

// Row text is concatenated element text without separators, so the label is
// whatever precedes the first usage readout, reset text, or dollar amount.
const LABEL_BOUNDARY_PATTERNS: readonly RegExp[] = [
	/resets/iu,
	/you've/iu,
	/\d/u,
	/\$/u,
];

const sliceBeforeEarliestBoundary = (
	text: string,
	patterns: readonly RegExp[],
): string => {
	let boundaryIndex: number = text.length;
	for (const pattern of patterns) {
		const matchIndex: number = text.search(pattern);
		if (matchIndex >= 0 && matchIndex < boundaryIndex) {
			boundaryIndex = matchIndex;
		}
	}
	return text.slice(0, boundaryIndex).trim();
};

export const deriveCardLabel = (text: string): string => {
	const label: string = sliceBeforeEarliestBoundary(
		text,
		LABEL_BOUNDARY_PATTERNS,
	);
	if (label.length > 0) {
		return label;
	}
	return text.slice(0, MAX_FALLBACK_LABEL_LENGTH).trim();
};

// Codex headers legitimately contain digits ("5 hour usage limit"), so only
// cut at reset text and percentage readouts instead of the first digit.
const CODEX_LABEL_BOUNDARY_PATTERNS: readonly RegExp[] = [
	/resets/iu,
	/\d+(?:\.\d+)?\s*%/u,
];

export const deriveCodexCardLabel = (
	headerText: string,
	fullText: string,
): string => {
	const label: string = sliceBeforeEarliestBoundary(
		headerText,
		CODEX_LABEL_BOUNDARY_PATTERNS,
	);
	if (label.length > 0) {
		return label;
	}
	return deriveCardLabel(fullText);
};

// ---------------------------------------------------------------------------
// Duration inference
// ---------------------------------------------------------------------------

const parseHourWindowMs = (text: string): number | null => {
	const hourWindowMatch: RegExpMatchArray | null = text.match(
		/\b(?<hours>\d+)[\s-]*hour\s+usage\s+limit\b/iu,
	);
	if (hourWindowMatch === null) {
		return null;
	}

	const hours: number = Number.parseInt(
		hourWindowMatch.groups?.hours ?? "0",
		10,
	);
	if (Number.isNaN(hours) === true || hours <= 0) {
		return null;
	}
	return hours * ONE_HOUR_MS;
};

const inferDurationMs = (
	text: string,
	resetLabel: string | null,
): number | null => {
	if (/weekly/iu.test(text) === true || /code\s*review/iu.test(text) === true) {
		return ONE_WEEK_MS;
	}
	if (/\brate\s+limit\s+details\b/iu.test(text) === true) {
		return FIVE_HOURS_MS;
	}
	if (/\brate\s+limit\b/iu.test(text) === true) {
		return null;
	}
	// No trailing \b: row text concatenates elements without separators
	// ("Current sessionResets in 4 hr"), leaving no word boundary.
	if (/\bcurrent\s+session/iu.test(text) === true) {
		return FIVE_HOURS_MS;
	}

	const hourWindowMs: number | null = parseHourWindowMs(text);
	if (hourWindowMs !== null) {
		return hourWindowMs;
	}

	if (resetLabel !== null) {
		const relativeMs: number | null = parseRelativeDurationMs(resetLabel);
		if (relativeMs !== null && relativeMs >= 24 * ONE_HOUR_MS) {
			return ONE_WEEK_MS;
		}
	}
	if (
		resetLabel !== null &&
		/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*/iu.test(resetLabel) === true
	) {
		return ONE_WEEK_MS;
	}
	return null;
};

// ---------------------------------------------------------------------------
// Reset label extraction
// ---------------------------------------------------------------------------

const extractResetLabel = (text: string): string | null => {
	const label: string | undefined = text
		.match(/Resets\s+(?<label>.+)$/iu)
		?.groups?.label?.trim();
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResetInfo {
	resetAt: Date | null;
	durationMs: number | null;
}

export const parseResetInfo = (
	containerElement: HTMLElement,
	fullText: string,
	durationSourceText: string,
	now: Date,
): ResetInfo => {
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
