// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_ABBR_TO_INDEX: Readonly<Record<string, number>> = {
	sun: 0,
	mon: 1,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
	sat: 6,
};

// ---------------------------------------------------------------------------
// Shared time-of-day helpers
// ---------------------------------------------------------------------------

const parseTimeTokens = (
	hourToken: string,
	minuteToken: string,
	meridiemToken: string,
): number | null => {
	const hourValue: number = Number.parseInt(hourToken, 10);
	const minuteValue: number = Number.parseInt(minuteToken, 10);
	if (
		Number.isNaN(hourValue) === true ||
		Number.isNaN(minuteValue) === true ||
		hourValue < 1 ||
		hourValue > 12 ||
		minuteValue < 0 ||
		minuteValue > 59
	) {
		return null;
	}

	let normalizedHours: number = hourValue % 12;
	if (meridiemToken.toUpperCase() === "PM") {
		normalizedHours += 12;
	}
	return normalizedHours * 60 + minuteValue;
};

const buildDateAtTimeOfDay = (totalMinutes: number, now: Date): Date => {
	const candidateDate: Date = new Date(now.getTime());
	candidateDate.setHours(
		Math.floor(totalMinutes / 60),
		totalMinutes % 60,
		0,
		0,
	);
	return candidateDate;
};

// ---------------------------------------------------------------------------
// Format-specific parsers
// ---------------------------------------------------------------------------

const parseDayTimeLabel = (resetLabel: string, now: Date): Date | null => {
	const dayTimeMatch: RegExpMatchArray | null = resetLabel.match(
		/^\s*(?<day>Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(?<hour>\d{1,2}):(?<minute>\d{2})\s*(?<meridiem>[AP]M)\s*$/i,
	);
	if (dayTimeMatch?.groups === undefined) {
		return null;
	}

	const totalMinutes: number | null = parseTimeTokens(
		dayTimeMatch.groups["hour"] ?? "",
		dayTimeMatch.groups["minute"] ?? "",
		dayTimeMatch.groups["meridiem"] ?? "",
	);
	if (totalMinutes === null) {
		return null;
	}

	const dayAbbr: string = (dayTimeMatch.groups["day"] ?? "")
		.toLowerCase()
		.slice(0, 3);
	const targetDayIndex: number | undefined = DAY_ABBR_TO_INDEX[dayAbbr];
	if (targetDayIndex === undefined) {
		return null;
	}

	const candidateDate: Date = buildDateAtTimeOfDay(totalMinutes, now);
	const currentDayIndex: number = candidateDate.getDay();
	let daysToAdd: number = targetDayIndex - currentDayIndex;
	if (daysToAdd < 0) {
		daysToAdd += 7;
	}
	if (daysToAdd === 0 && candidateDate.getTime() <= now.getTime()) {
		daysToAdd = 7;
	}

	candidateDate.setDate(candidateDate.getDate() + daysToAdd);
	return candidateDate;
};

const parseTimeOnlyLabel = (resetLabel: string, now: Date): Date | null => {
	const timeMatch: RegExpMatchArray | null = resetLabel.match(
		/^\s*(?<hour>\d{1,2}):(?<minute>\d{2})\s*(?<meridiem>[AP]M)\s*$/i,
	);
	if (timeMatch?.groups === undefined) {
		return null;
	}

	const totalMinutes: number | null = parseTimeTokens(
		timeMatch.groups["hour"] ?? "",
		timeMatch.groups["minute"] ?? "",
		timeMatch.groups["meridiem"] ?? "",
	);
	if (totalMinutes === null) {
		return null;
	}

	const candidateDate: Date = buildDateAtTimeOfDay(totalMinutes, now);
	if (candidateDate.getTime() <= now.getTime()) {
		candidateDate.setDate(candidateDate.getDate() + 1);
	}
	return candidateDate;
};

const parseRelativeTimeLabel = (resetLabel: string, now: Date): Date | null => {
	const relativeMatch: RegExpMatchArray | null = resetLabel.match(
		/^in\s+(?:(\d+)\s+days?\s*)?(?:(\d+)\s+hours?\s*)?(?:(\d+)\s+minutes?)?\s*$/i,
	);
	if (relativeMatch === null) {
		return null;
	}

	const days: number = Number.parseInt(relativeMatch[1] ?? "0", 10) || 0;
	const hours: number = Number.parseInt(relativeMatch[2] ?? "0", 10) || 0;
	const minutes: number = Number.parseInt(relativeMatch[3] ?? "0", 10) || 0;

	const totalMs: number = (days * 24 * 60 + hours * 60 + minutes) * 60 * 1_000;
	if (totalMs <= 0) {
		return null;
	}

	return new Date(now.getTime() + totalMs);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const parseResetDate = (resetLabel: string, now: Date): Date | null => {
	const directTimestamp: number = Date.parse(resetLabel);
	if (Number.isNaN(directTimestamp) === false) {
		return new Date(directTimestamp);
	}

	return (
		parseDayTimeLabel(resetLabel, now) ??
		parseTimeOnlyLabel(resetLabel, now) ??
		parseRelativeTimeLabel(resetLabel, now)
	);
};
