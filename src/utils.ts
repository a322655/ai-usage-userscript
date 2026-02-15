export const clamp = (value: number, min: number, max: number): number => {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
};

export const normalizeWhitespace = (value: string): string =>
	value.replace(/\s+/g, " ").trim();
