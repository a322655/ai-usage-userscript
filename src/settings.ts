import {
	GM_getValue,
	GM_registerMenuCommand,
	GM_setValue,
	GM_unregisterMenuCommand,
} from "vite-plugin-monkey/dist/client";

// ---------------------------------------------------------------------------
// Persistent divider toggles (per-site, keyed by card label)
// ---------------------------------------------------------------------------

const DISABLED_LABELS_KEY: string = `dividerDisabledLabels:${globalThis.location.hostname}`;

// Exported so render passes read GM storage once instead of per card.
export const readDisabledLabels = (): readonly string[] => {
	const stored: unknown = GM_getValue<unknown>(DISABLED_LABELS_KEY, []);
	if (Array.isArray(stored) === false) {
		return [];
	}
	return stored.filter(
		(entry: unknown): entry is string => typeof entry === "string",
	);
};

const toggleDivider = (label: string): void => {
	const disabledLabels: readonly string[] = readDisabledLabels();
	const nextDisabledLabels: readonly string[] =
		disabledLabels.includes(label) === true
			? disabledLabels.filter((entry: string): boolean => entry !== label)
			: [...disabledLabels, label];
	GM_setValue(DISABLED_LABELS_KEY, nextDisabledLabels);
};

// ---------------------------------------------------------------------------
// Menu commands
// ---------------------------------------------------------------------------

// Unregister-all-then-reregister is the only pattern portable across
// Tampermonkey and pre-2.15.9 Violentmonkey menu command APIs.
let registeredMenuIds: ReadonlyArray<string | number> = [];
let lastMenuSignature: string | null = null;

export const syncSettingsMenu = (
	labels: readonly string[],
	disabledLabels: readonly string[],
	onToggle: () => void,
): void => {
	const uniqueLabels: readonly string[] = [...new Set(labels)];
	const menuSignature: string = JSON.stringify([uniqueLabels, disabledLabels]);
	if (menuSignature === lastMenuSignature) {
		return;
	}
	lastMenuSignature = menuSignature;

	for (const menuId of registeredMenuIds) {
		GM_unregisterMenuCommand(menuId);
	}
	registeredMenuIds = uniqueLabels.map((label: string): string | number =>
		GM_registerMenuCommand(
			`${disabledLabels.includes(label) === true ? "✗" : "✓"} ${label}`,
			(): void => {
				toggleDivider(label);
				onToggle();
			},
		),
	);
};
