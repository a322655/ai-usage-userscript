import { ONE_WEEK_MS } from "./card-info.ts";
import { collectClaudeCards } from "./claude-card.ts";
import { collectCodexCards } from "./codex-card.ts";
import { collectKimiCards } from "./kimi-card.ts";
import type { UsageCard } from "./usage-card-common.ts";

export type { UsageCard } from "./usage-card-common.ts";

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
