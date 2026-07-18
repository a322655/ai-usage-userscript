import { deriveCardLabel, parseResetInfo } from "./card-info.ts";
import { type UsageCard, validateTrackGeometry } from "./usage-card-common.ts";
import { normalizeWhitespace } from "./utils.ts";

const CLAUDE_TRACK_SELECTOR: string = '[data-cds="Meter"] > [role="meter"]';
const CLAUDE_FILL_SELECTOR: string = 'div[class*="bg-fill-"]';
const CLAUDE_SETTINGS_DIALOG_SELECTOR: string = `[role="dialog"]:has(${CLAUDE_TRACK_SELECTOR})`;
const CLAUDE_SKIP_PATTERNS: readonly RegExp[] = [
	/\$[\d,.]+\s+spent/iu,
	/\bdaily\s+included\b/iu,
];

interface ClaudeProgressElements {
	trackContainerElement: HTMLElement;
}

const findClaudeRowElement = (
	candidateNode: HTMLElement,
): HTMLElement | null => {
	const labelId: string | null = candidateNode.getAttribute("aria-labelledby");
	const labelElement: HTMLElement | null =
		labelId === null ? null : document.getElementById(labelId);
	const valueText: string = normalizeWhitespace(
		candidateNode.getAttribute("aria-valuetext") ?? "",
	);
	if (labelElement === null && valueText.length === 0) {
		return null;
	}

	let ancestorElement: HTMLElement | null = candidateNode.parentElement;
	while (ancestorElement !== null && ancestorElement.tagName !== "SECTION") {
		const ancestorText: string = normalizeWhitespace(
			ancestorElement.textContent ?? "",
		);
		const containsLabel: boolean =
			labelElement === null || ancestorElement.contains(labelElement) === true;
		if (
			containsLabel === true &&
			/resets/iu.test(ancestorText) === true &&
			(valueText.length === 0 || ancestorText.includes(valueText) === true)
		) {
			return ancestorElement;
		}
		ancestorElement = ancestorElement.parentElement;
	}

	return null;
};

const resolveClaudeProgressElements = (
	candidateNode: HTMLElement,
): ClaudeProgressElements | null => {
	const fillNode: Element | null =
		candidateNode.querySelector(CLAUDE_FILL_SELECTOR);
	const trackContainerNode: HTMLElement | null = candidateNode.parentElement;
	if (
		fillNode instanceof HTMLElement === false ||
		trackContainerNode instanceof HTMLElement === false
	) {
		return null;
	}

	if (
		validateTrackGeometry(
			candidateNode.getBoundingClientRect(),
			fillNode.getBoundingClientRect(),
		) === false
	) {
		return null;
	}

	return {
		trackContainerElement: trackContainerNode,
	};
};

const findClaudeQueryRoot = (): ParentNode =>
	document.querySelector(CLAUDE_SETTINGS_DIALOG_SELECTOR) ?? document;

const readSectionHeading = (
	candidateNode: HTMLElement,
	headingCache: WeakMap<HTMLElement, string>,
): string => {
	const sectionElement: HTMLElement | null = candidateNode.closest("section");
	if (sectionElement === null) {
		return "";
	}

	const cachedHeading: string | undefined = headingCache.get(sectionElement);
	if (cachedHeading !== undefined) {
		return cachedHeading;
	}

	const headingText: string = normalizeWhitespace(
		sectionElement.querySelector("h1, h2, h3, h4")?.textContent ?? "",
	);
	headingCache.set(sectionElement, headingText);
	return headingText;
};

export const collectClaudeCards = (now: Date): UsageCard[] => {
	const cards: UsageCard[] = [];
	const headingCache: WeakMap<HTMLElement, string> = new WeakMap();
	const trackCandidates: NodeListOf<Element> =
		findClaudeQueryRoot().querySelectorAll(CLAUDE_TRACK_SELECTOR);

	for (const candidateNode of trackCandidates) {
		if (candidateNode instanceof HTMLElement === false) {
			continue;
		}

		const rowElement: HTMLElement | null = findClaudeRowElement(candidateNode);
		if (rowElement === null) {
			continue;
		}

		const rowText: string = normalizeWhitespace(rowElement.textContent ?? "");
		const shouldSkip: boolean = CLAUDE_SKIP_PATTERNS.some(
			(pattern: RegExp): boolean => pattern.test(rowText),
		);
		if (shouldSkip === true) {
			continue;
		}

		const progressElements: ClaudeProgressElements | null =
			resolveClaudeProgressElements(candidateNode);
		if (progressElements === null) {
			continue;
		}

		const sectionHeadingText: string = readSectionHeading(
			candidateNode,
			headingCache,
		);
		const { resetAt, durationMs } = parseResetInfo(
			rowElement,
			rowText,
			`${sectionHeadingText} ${rowText}`,
			now,
		);

		cards.push({
			fullText: rowText,
			label: deriveCardLabel(rowText),
			trackContainerElement: progressElements.trackContainerElement,
			resetAt: resetAt,
			durationMs: durationMs,
			fillMeaning: "used",
		});
	}

	return cards;
};
