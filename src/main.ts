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
const UPDATE_INTERVAL_MS: number = 30_000;
const PACE_EPSILON: number = 0.01;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaceStatus = "fast" | "slow" | "on-track" | "unknown";

const STATUS_COLORS: Readonly<Record<PaceStatus, string>> = {
	fast: "rgb(239, 68, 68)",
	slow: "rgb(37, 99, 235)",
	"on-track": "rgb(249, 115, 22)",
	unknown: "rgb(249, 115, 22)",
};

const STATUS_LABELS: Readonly<Record<PaceStatus, string>> = {
	fast: "too fast",
	slow: "too slow",
	"on-track": "on track",
	unknown: "unknown",
};

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

const computeCurrentRemainingRatio = (card: UsageCard): number | null => {
	const trackWidth: number = card.trackElement.getBoundingClientRect().width;
	if (trackWidth <= 0) {
		return null;
	}
	const fillWidth: number = card.fillElement.getBoundingClientRect().width;
	const fillRatio: number = clamp(fillWidth / trackWidth, 0, 1);

	if (card.fillMeaning === "used") {
		return 1 - fillRatio;
	}
	return fillRatio;
};

const computePaceStatus = (
	targetRemainingRatio: number,
	currentRemainingRatio: number | null,
): PaceStatus => {
	if (currentRemainingRatio === null) {
		return "unknown";
	}

	const targetUsedRatio: number = 1 - targetRemainingRatio;
	const currentUsedRatio: number = 1 - currentRemainingRatio;
	const usedDelta: number = currentUsedRatio - targetUsedRatio;

	if (Math.abs(usedDelta) <= PACE_EPSILON) {
		return "on-track";
	}
	if (usedDelta > 0) {
		return "fast";
	}
	return "slow";
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

const removeDividerElement = (trackContainer: HTMLElement): void => {
	const dividerElement: HTMLDivElement | null = trackContainer.querySelector(
		`.${DIVIDER_CLASS}`,
	);
	if (dividerElement !== null) {
		dividerElement.remove();
	}
};

const buildDividerTooltip = (
	targetRemainingRatio: number,
	currentRemainingRatio: number | null,
	status: PaceStatus,
): string => {
	const targetPercent: string = (targetRemainingRatio * 100).toFixed(1);
	if (currentRemainingRatio === null) {
		return `Pace marker: expected ${targetPercent}% remaining`;
	}

	const currentPercent: string = (currentRemainingRatio * 100).toFixed(1);
	const statusLabel: string = STATUS_LABELS[status];
	return `Pace marker: expected ${targetPercent}% remaining, current ${currentPercent}% (${statusLabel})`;
};

const applyDividerStyles = (
	dividerElement: HTMLDivElement,
	leftPercent: number,
	status: PaceStatus,
): void => {
	dividerElement.style.position = "absolute";
	dividerElement.style.top = "-2px";
	dividerElement.style.bottom = "-2px";
	dividerElement.style.left = `${leftPercent.toFixed(4)}%`;
	dividerElement.style.width = "2px";
	dividerElement.style.transform = "translateX(-50%)";
	dividerElement.style.borderRadius = "9999px";
	dividerElement.style.pointerEvents = "none";
	dividerElement.style.zIndex = "5";
	dividerElement.style.backgroundColor = STATUS_COLORS[status];
	dividerElement.style.boxShadow = "0 0 0 1px rgba(255, 255, 255, 0.7)";
};

const updateDividerElement = (
	card: UsageCard,
	targetRemainingRatio: number,
	currentRemainingRatio: number | null,
	status: PaceStatus,
): void => {
	const trackContainer: HTMLElement = card.trackContainerElement;
	if (getComputedStyle(trackContainer).position === "static") {
		trackContainer.style.position = "relative";
	}

	const leftPercent: number =
		card.fillMeaning === "used"
			? (1 - targetRemainingRatio) * 100
			: targetRemainingRatio * 100;
	const dividerElement: HTMLDivElement = ensureDividerElement(trackContainer);
	applyDividerStyles(dividerElement, leftPercent, status);
	dividerElement.title = buildDividerTooltip(
		targetRemainingRatio,
		currentRemainingRatio,
		status,
	);
};

// ---------------------------------------------------------------------------
// Render orchestration
// ---------------------------------------------------------------------------

const renderPaceDividers = (): void => {
	const now: Date = new Date();
	const cards: UsageCard[] = collectUsageCards(now);
	resolveMissingResetInformation(cards);

	for (const card of cards) {
		const targetRemainingRatio: number | null = computeTargetRemainingRatio(
			card,
			now,
		);
		if (targetRemainingRatio === null) {
			removeDividerElement(card.trackContainerElement);
			continue;
		}

		const currentRemainingRatio: number | null =
			computeCurrentRemainingRatio(card);
		const status: PaceStatus = computePaceStatus(
			targetRemainingRatio,
			currentRemainingRatio,
		);
		updateDividerElement(
			card,
			targetRemainingRatio,
			currentRemainingRatio,
			status,
		);
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
	scheduleRender();
	globalThis.setTimeout((): void => {
		scheduleRender();
	}, 300);
	globalThis.setTimeout((): void => {
		scheduleRender();
	}, 2_000);
	setupAutoRefresh();
};

bootstrap();
