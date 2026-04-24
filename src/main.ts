import "./codex-api.ts";
import {
	collectUsageCards,
	resolveMissingResetInformation,
	type UsageCard,
} from "./usage-card.ts";
import { clamp } from "./utils.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIVIDER_CLASS: string = "ai-usage-pace-divider";
const DIVIDER_BAR_CLASS: string = "ai-usage-pace-divider-bar";
const UPDATE_INTERVAL_MS: number = 30_000;
const DIVIDER_COLOR: string = "rgb(249, 115, 22)";
const DIVIDER_HIT_AREA_WIDTH: string = "12px";
const DIVIDER_BAR_WIDTH: string = "2px";

// ---------------------------------------------------------------------------
// Pace computation
// ---------------------------------------------------------------------------

const computeTargetRemainingRatio = (
	card: UsageCard,
	now: Date,
): number | null => {
	if (
		card.resetAt === null ||
		card.durationMs === null ||
		card.durationMs <= 0
	) {
		return null;
	}

	const resetTimeMs: number = card.resetAt.getTime();
	if (Number.isFinite(resetTimeMs) === false) {
		return null;
	}

	const cycleStartMs: number = resetTimeMs - card.durationMs;
	const elapsedMs: number = clamp(
		now.getTime() - cycleStartMs,
		0,
		card.durationMs,
	);
	const targetRemainingRatio: number = 1 - elapsedMs / card.durationMs;
	return clamp(targetRemainingRatio, 0, 1);
};

const computeDividerLeftPercent = (
	card: UsageCard,
	targetRemainingRatio: number,
): number => {
	if (card.fillMeaning === "used") {
		return (1 - targetRemainingRatio) * 100;
	}
	return targetRemainingRatio * 100;
};

// ---------------------------------------------------------------------------
// Divider element management
// ---------------------------------------------------------------------------

const ensureDividerElement = (trackContainer: HTMLElement): HTMLDivElement => {
	const existingDivider: HTMLDivElement | null = trackContainer.querySelector(
		`.${DIVIDER_CLASS}`,
	);
	if (existingDivider !== null) {
		return existingDivider;
	}

	const dividerElement: HTMLDivElement = document.createElement("div");
	dividerElement.className = DIVIDER_CLASS;
	trackContainer.append(dividerElement);
	return dividerElement;
};

const ensureBarElement = (dividerElement: HTMLDivElement): HTMLDivElement => {
	const existingBar: HTMLDivElement | null = dividerElement.querySelector(
		`.${DIVIDER_BAR_CLASS}`,
	);
	if (existingBar !== null) {
		return existingBar;
	}

	const barElement: HTMLDivElement = document.createElement("div");
	barElement.className = DIVIDER_BAR_CLASS;
	dividerElement.append(barElement);
	return barElement;
};

const removeDividerElement = (trackContainer: HTMLElement): void => {
	const dividerElement: HTMLDivElement | null = trackContainer.querySelector(
		`.${DIVIDER_CLASS}`,
	);
	if (dividerElement !== null) {
		dividerElement.remove();
	}
};

const buildDividerTooltip = (targetRemainingRatio: number): string => {
	const targetPercent: string = (targetRemainingRatio * 100).toFixed(1);
	return `Pace marker: expected ${targetPercent}% remaining`;
};

const applyDividerStyles = (
	dividerElement: HTMLDivElement,
	leftPercent: number,
): void => {
	dividerElement.style.position = "absolute";
	dividerElement.style.top = "-2px";
	dividerElement.style.bottom = "-2px";
	dividerElement.style.left = `${leftPercent.toFixed(4)}%`;
	dividerElement.style.width = DIVIDER_HIT_AREA_WIDTH;
	dividerElement.style.transform = "translateX(-50%)";
	dividerElement.style.backgroundColor = "transparent";
	dividerElement.style.cursor = "help";
	dividerElement.style.zIndex = "5";
};

const applyBarStyles = (barElement: HTMLDivElement): void => {
	barElement.style.position = "absolute";
	barElement.style.top = "0";
	barElement.style.bottom = "0";
	barElement.style.left = "50%";
	barElement.style.width = DIVIDER_BAR_WIDTH;
	barElement.style.transform = "translateX(-50%)";
	barElement.style.borderRadius = "9999px";
	barElement.style.pointerEvents = "none";
	barElement.style.backgroundColor = DIVIDER_COLOR;
	barElement.style.boxShadow = "0 0 0 1px rgba(255, 255, 255, 0.7)";
};

const updateDividerElement = (
	card: UsageCard,
	targetRemainingRatio: number,
): void => {
	const trackContainer: HTMLElement = card.trackContainerElement;
	if (getComputedStyle(trackContainer).position === "static") {
		trackContainer.style.position = "relative";
	}

	const leftPercent: number = computeDividerLeftPercent(
		card,
		targetRemainingRatio,
	);
	const dividerElement: HTMLDivElement = ensureDividerElement(trackContainer);
	applyDividerStyles(dividerElement, leftPercent);

	const barElement: HTMLDivElement = ensureBarElement(dividerElement);
	applyBarStyles(barElement);

	dividerElement.title = buildDividerTooltip(targetRemainingRatio);
};

// ---------------------------------------------------------------------------
// Render orchestration
// ---------------------------------------------------------------------------

const renderPaceDividers = (): void => {
	const now: Date = new Date();
	const cards: UsageCard[] = collectUsageCards(now);
	if (globalThis.location.hostname !== "chatgpt.com") {
		resolveMissingResetInformation(cards);
	}

	for (const card of cards) {
		const targetRemainingRatio: number | null = computeTargetRemainingRatio(
			card,
			now,
		);
		if (targetRemainingRatio === null) {
			removeDividerElement(card.trackContainerElement);
			continue;
		}

		updateDividerElement(card, targetRemainingRatio);
	}
};

let renderScheduled: boolean = false;

const scheduleRender = (): void => {
	if (renderScheduled === true) {
		return;
	}

	renderScheduled = true;
	globalThis.requestAnimationFrame((): void => {
		renderScheduled = false;
		renderPaceDividers();
	});
};

// ---------------------------------------------------------------------------
// Auto-refresh and bootstrap
// ---------------------------------------------------------------------------

const setupAutoRefresh = (): void => {
	const observer: MutationObserver = new MutationObserver(scheduleRender);
	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});

	globalThis.setInterval(scheduleRender, UPDATE_INTERVAL_MS);
	globalThis.addEventListener("resize", scheduleRender);

	document.addEventListener("visibilitychange", (): void => {
		if (document.visibilityState === "visible") {
			scheduleRender();
		}
	});
};

const bootstrap = (): void => {
	const globalWindow: typeof globalThis & {
		__aiUsageDividerInitialized__?: boolean;
	} = globalThis;
	if (globalWindow.__aiUsageDividerInitialized__ === true) {
		return;
	}

	globalWindow.__aiUsageDividerInitialized__ = true;

	const init = (): void => {
		scheduleRender();
		globalThis.setTimeout((): void => {
			scheduleRender();
		}, 300);
		globalThis.setTimeout((): void => {
			scheduleRender();
		}, 2_000);
		setupAutoRefresh();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
};

bootstrap();
