// ==UserScript==
// @name         AI Usage
// @namespace    https://github.com/a322655
// @version      1.1.0
// @author       WindFade
// @description  Show pace dividers on AI usage pages (Codex, Claude, Kimi Code)
// @license      MIT
// @homepageURL  https://github.com/eigenigma/ai-usage-userscript
// @supportURL   https://github.com/eigenigma/ai-usage-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/eigenigma/ai-usage-userscript/main/dist/ai-usage-userscript.user.js
// @updateURL    https://raw.githubusercontent.com/eigenigma/ai-usage-userscript/main/dist/ai-usage-userscript.user.js
// @match        https://chatgpt.com/codex/cloud/settings/analytics*
// @match        https://claude.ai/settings/usage*
// @match        https://claude.ai/new*
// @match        https://www.kimi.com/code/console*
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
	"use strict";
	var _GM_getValue = (() => typeof GM_getValue != "undefined" ? GM_getValue : void 0)();
	var _GM_registerMenuCommand = (() => typeof GM_registerMenuCommand != "undefined" ? GM_registerMenuCommand : void 0)();
	var _GM_setValue = (() => typeof GM_setValue != "undefined" ? GM_setValue : void 0)();
	var _GM_unregisterMenuCommand = (() => typeof GM_unregisterMenuCommand != "undefined" ? GM_unregisterMenuCommand : void 0)();
	var _unsafeWindow = (() => typeof unsafeWindow != "undefined" ? unsafeWindow : void 0)();
	var interceptedData = null;
	var USAGE_API_PATH = "/backend-api/wham/usage";
	var isUsageApiUrl = (url) => url.includes(USAGE_API_PATH) === true && url.includes("daily") === false && url.includes("credit") === false;
	var extractUrlFromInput = (input) => {
		if (typeof input === "string") return input;
		if (input instanceof Request) return input.url;
		return "";
	};
	var handleInterceptedResponse = (response) => {
		if (response.ok === false) return;
		response.clone().json().then((data) => {
			interceptedData = data;
		}).catch(() => void 0);
	};
	var installFetchInterceptor = () => {
		const originalFetch = _unsafeWindow.fetch;
		_unsafeWindow.fetch = new Proxy(originalFetch, { apply: (target, thisArg, args) => {
			const result = Reflect.apply(target, thisArg, args);
			if (isUsageApiUrl(extractUrlFromInput(args[0])) === true) result.then(handleInterceptedResponse).catch(() => void 0);
			return result;
		} });
	};
	if (globalThis.location.hostname === "chatgpt.com") installFetchInterceptor();
	var toWindow = (apiWindow) => {
		if (apiWindow === null || apiWindow === void 0) return null;
		if (apiWindow.limit_window_seconds <= 0 || apiWindow.reset_at <= 0) return null;
		return {
			durationMs: apiWindow.limit_window_seconds * 1e3,
			resetAt: new Date(apiWindow.reset_at * 1e3)
		};
	};
	var resolveRateLimitWindow = (rateLimit, headerText) => {
		if (/weekly/iu.test(headerText) === true) return toWindow(rateLimit.secondary_window);
		if (/\d+\s*hour/iu.test(headerText) === true) return toWindow(rateLimit.primary_window);
		return null;
	};
	var findAdditionalModelWindow = (additionalLimits, headerText) => {
		for (const model of additionalLimits) if (headerText.includes(model.limit_name) === true) return resolveRateLimitWindow(model.rate_limit, headerText);
		return null;
	};
	var findCodexRateLimitWindow = (headerText) => {
		if (interceptedData === null) return null;
		if (interceptedData.additional_rate_limits !== void 0) {
			const modelWindow = findAdditionalModelWindow(interceptedData.additional_rate_limits, headerText);
			if (modelWindow !== null) return modelWindow;
		}
		if (/code\s*review/iu.test(headerText) === true) return toWindow(interceptedData.code_review_rate_limit?.primary_window ?? null);
		return resolveRateLimitWindow(interceptedData.rate_limit ?? {
			primary_window: null,
			secondary_window: null
		}, headerText);
	};
	var DISABLED_LABELS_KEY = `dividerDisabledLabels:${globalThis.location.hostname}`;
	var readDisabledLabels = () => {
		const stored = _GM_getValue(DISABLED_LABELS_KEY, []);
		if (Array.isArray(stored) === false) return [];
		return stored.filter((entry) => typeof entry === "string");
	};
	var toggleDivider = (label) => {
		const disabledLabels = readDisabledLabels();
		_GM_setValue(DISABLED_LABELS_KEY, disabledLabels.includes(label) === true ? disabledLabels.filter((entry) => entry !== label) : [...disabledLabels, label]);
	};
	var registeredMenuIds = [];
	var lastMenuSignature = null;
	var clearSettingsMenu = () => {
		for (const menuId of registeredMenuIds) _GM_unregisterMenuCommand(menuId);
		registeredMenuIds = [];
		lastMenuSignature = null;
	};
	var syncSettingsMenu = (labels, disabledLabels, onToggle) => {
		const uniqueLabels = [...new Set(labels)];
		const menuSignature = JSON.stringify([uniqueLabels, disabledLabels]);
		if (menuSignature === lastMenuSignature) return;
		clearSettingsMenu();
		lastMenuSignature = menuSignature;
		registeredMenuIds = uniqueLabels.map((label) => _GM_registerMenuCommand(`${disabledLabels.includes(label) === true ? "✗" : "✓"} ${label}`, () => {
			toggleDivider(label);
			onToggle();
		}));
	};
	var DAY_ABBR_TO_INDEX = {
		sun: 0,
		mon: 1,
		tue: 2,
		wed: 3,
		thu: 4,
		fri: 5,
		sat: 6
	};
	var parseTimeTokens = (hourToken, minuteToken, meridiemToken) => {
		const hourValue = Number.parseInt(hourToken, 10);
		const minuteValue = Number.parseInt(minuteToken, 10);
		if (Number.isNaN(hourValue) === true || Number.isNaN(minuteValue) === true || hourValue < 1 || hourValue > 12 || minuteValue < 0 || minuteValue > 59) return null;
		let normalizedHours = hourValue % 12;
		if (meridiemToken.toUpperCase() === "PM") normalizedHours += 12;
		return normalizedHours * 60 + minuteValue;
	};
	var buildDateAtTimeOfDay = (totalMinutes, now) => {
		const candidateDate = new Date(now.getTime());
		candidateDate.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
		return candidateDate;
	};
	var parseDayTimeLabel = (resetLabel, now) => {
		const dayTimeMatch = resetLabel.match(/^\s*(?<day>Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(?<hour>\d{1,2}):(?<minute>\d{2})\s*(?<meridiem>[AP]M)\s*$/iu);
		if (dayTimeMatch?.groups === void 0) return null;
		const totalMinutes = parseTimeTokens(dayTimeMatch.groups["hour"] ?? "", dayTimeMatch.groups["minute"] ?? "", dayTimeMatch.groups["meridiem"] ?? "");
		if (totalMinutes === null) return null;
		const targetDayIndex = DAY_ABBR_TO_INDEX[(dayTimeMatch.groups["day"] ?? "").toLowerCase().slice(0, 3)];
		if (targetDayIndex === void 0) return null;
		const candidateDate = buildDateAtTimeOfDay(totalMinutes, now);
		let daysToAdd = targetDayIndex - candidateDate.getDay();
		if (daysToAdd < 0) daysToAdd += 7;
		if (daysToAdd === 0 && candidateDate.getTime() <= now.getTime()) daysToAdd = 7;
		candidateDate.setDate(candidateDate.getDate() + daysToAdd);
		return candidateDate;
	};
	var parseTimeOnlyLabel = (resetLabel, now) => {
		const timeMatch = resetLabel.match(/^\s*(?<hour>\d{1,2}):(?<minute>\d{2})\s*(?<meridiem>[AP]M)\s*$/iu);
		if (timeMatch?.groups === void 0) return null;
		const totalMinutes = parseTimeTokens(timeMatch.groups["hour"] ?? "", timeMatch.groups["minute"] ?? "", timeMatch.groups["meridiem"] ?? "");
		if (totalMinutes === null) return null;
		const candidateDate = buildDateAtTimeOfDay(totalMinutes, now);
		if (candidateDate.getTime() <= now.getTime()) candidateDate.setDate(candidateDate.getDate() + 1);
		return candidateDate;
	};
	var parseRelativeDurationMs = (resetLabel) => {
		const relativeMatch = resetLabel.match(/^in\s+(?:(?<days>\d+)\s+days?\s*)?(?:(?<hours>\d+)\s+(?:hours?|hrs?)\s*)?(?:(?<minutes>\d+)\s+(?:minutes?|mins?))?\s*$/iu);
		if (relativeMatch === null) return null;
		const days = Number.parseInt(relativeMatch.groups?.days ?? "0", 10) || 0;
		const hours = Number.parseInt(relativeMatch.groups?.hours ?? "0", 10) || 0;
		const minutes = Number.parseInt(relativeMatch.groups?.minutes ?? "0", 10) || 0;
		const totalMs = (days * 24 * 60 + hours * 60 + minutes) * 60 * 1e3;
		if (totalMs <= 0) return null;
		return totalMs;
	};
	var parseRelativeTimeLabel = (resetLabel, now) => {
		const durationMs = parseRelativeDurationMs(resetLabel);
		if (durationMs === null) return null;
		return new Date(now.getTime() + durationMs);
	};
	var parseResetDate = (resetLabel, now) => {
		const directTimestamp = Date.parse(resetLabel);
		if (Number.isNaN(directTimestamp) === false) return new Date(directTimestamp);
		return parseDayTimeLabel(resetLabel, now) ?? parseTimeOnlyLabel(resetLabel, now) ?? parseRelativeTimeLabel(resetLabel, now);
	};
	var clamp = (value, min, max) => {
		if (value < min) return min;
		if (value > max) return max;
		return value;
	};
	var normalizeWhitespace = (value) => value.replace(/\s+/gu, " ").trim();
	var ONE_WEEK_MS = 10080 * 60 * 1e3;
	var ONE_HOUR_MS = 3600 * 1e3;
	var FIVE_HOURS_MS = 5 * ONE_HOUR_MS;
	var MAX_FALLBACK_LABEL_LENGTH = 40;
	var LABEL_BOUNDARY_PATTERNS = [
		/resets/iu,
		/you've/iu,
		/\d/u,
		/\$/u
	];
	var sliceBeforeEarliestBoundary = (text, patterns) => {
		let boundaryIndex = text.length;
		for (const pattern of patterns) {
			const matchIndex = text.search(pattern);
			if (matchIndex >= 0 && matchIndex < boundaryIndex) boundaryIndex = matchIndex;
		}
		return text.slice(0, boundaryIndex).trim();
	};
	var deriveCardLabel = (text) => {
		const label = sliceBeforeEarliestBoundary(text, LABEL_BOUNDARY_PATTERNS);
		if (label.length > 0) return label;
		return text.slice(0, MAX_FALLBACK_LABEL_LENGTH).trim();
	};
	var CODEX_LABEL_BOUNDARY_PATTERNS = [/resets/iu, /\d+(?:\.\d+)?\s*%/u];
	var deriveCodexCardLabel = (headerText, fullText) => {
		const label = sliceBeforeEarliestBoundary(headerText, CODEX_LABEL_BOUNDARY_PATTERNS);
		if (label.length > 0) return label;
		return deriveCardLabel(fullText);
	};
	var parseHourWindowMs = (text) => {
		const hourWindowMatch = text.match(/\b(?<hours>\d+)[\s-]*hour\s+usage\s+limit\b/iu);
		if (hourWindowMatch === null) return null;
		const hours = Number.parseInt(hourWindowMatch.groups?.hours ?? "0", 10);
		if (Number.isNaN(hours) === true || hours <= 0) return null;
		return hours * ONE_HOUR_MS;
	};
	var inferDurationMs = (text, resetLabel) => {
		if (/weekly/iu.test(text) === true || /code\s*review/iu.test(text) === true) return ONE_WEEK_MS;
		if (/\brate\s+limit\s+details\b/iu.test(text) === true) return FIVE_HOURS_MS;
		if (/\brate\s+limit\b/iu.test(text) === true) return null;
		if (/\bcurrent\s+session/iu.test(text) === true) return FIVE_HOURS_MS;
		const hourWindowMs = parseHourWindowMs(text);
		if (hourWindowMs !== null) return hourWindowMs;
		if (resetLabel !== null) {
			const relativeMs = parseRelativeDurationMs(resetLabel);
			if (relativeMs !== null && relativeMs >= 24 * ONE_HOUR_MS) return ONE_WEEK_MS;
		}
		if (resetLabel !== null && /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*/iu.test(resetLabel) === true) return ONE_WEEK_MS;
		return null;
	};
	var extractResetLabel = (text) => {
		const label = text.match(/Resets\s+(?<label>.+)$/iu)?.groups?.label?.trim();
		if (label === void 0 || label.length === 0) return null;
		return label;
	};
	var findResetLabel = (containerElement, fullText) => {
		const candidateNodes = containerElement.querySelectorAll("p, span, div");
		for (const candidateNode of candidateNodes) {
			if (candidateNode instanceof HTMLElement === false) continue;
			const label = extractResetLabel(normalizeWhitespace(candidateNode.textContent ?? ""));
			if (label !== null) return label;
		}
		return extractResetLabel(fullText);
	};
	var parseResetInfo = (containerElement, fullText, durationSourceText, now) => {
		const resetLabel = findResetLabel(containerElement, fullText);
		return {
			resetAt: resetLabel === null ? null : parseResetDate(resetLabel, now),
			durationMs: inferDurationMs(durationSourceText, resetLabel)
		};
	};
	var validateTrackGeometry = (trackRect, fillRect) => {
		if (trackRect.width < 120 || trackRect.height < 6 || trackRect.height > 18) return false;
		if (fillRect.height < 4 || fillRect.height > 18) return false;
		if (Math.abs(fillRect.top - trackRect.top) > 2) return false;
		if (fillRect.width < 0 || fillRect.width > trackRect.width + 1) return false;
		return true;
	};
	var CLAUDE_TRACK_SELECTOR = "[data-cds=\"Meter\"] > [role=\"meter\"]";
	var CLAUDE_FILL_SELECTOR = "div[class*=\"bg-fill-\"]";
	var CLAUDE_SETTINGS_DIALOG_SELECTOR = `[role="dialog"]:has(${CLAUDE_TRACK_SELECTOR})`;
	var CLAUDE_SKIP_PATTERNS = [/\$[\d,.]+\s+spent/iu, /\bdaily\s+included\b/iu];
	var findClaudeRowElement = (candidateNode) => {
		const labelId = candidateNode.getAttribute("aria-labelledby");
		const labelElement = labelId === null ? null : document.getElementById(labelId);
		const valueText = normalizeWhitespace(candidateNode.getAttribute("aria-valuetext") ?? "");
		if (labelElement === null && valueText.length === 0) return null;
		let ancestorElement = candidateNode.parentElement;
		while (ancestorElement !== null && ancestorElement.tagName !== "SECTION") {
			const ancestorText = normalizeWhitespace(ancestorElement.textContent ?? "");
			if ((labelElement === null || ancestorElement.contains(labelElement) === true) === true && /resets/iu.test(ancestorText) === true && (valueText.length === 0 || ancestorText.includes(valueText) === true)) return ancestorElement;
			ancestorElement = ancestorElement.parentElement;
		}
		return null;
	};
	var resolveClaudeProgressElements = (candidateNode) => {
		const fillNode = candidateNode.querySelector(CLAUDE_FILL_SELECTOR);
		const trackContainerNode = candidateNode.parentElement;
		if (fillNode instanceof HTMLElement === false || trackContainerNode instanceof HTMLElement === false) return null;
		if (validateTrackGeometry(candidateNode.getBoundingClientRect(), fillNode.getBoundingClientRect()) === false) return null;
		return { trackContainerElement: trackContainerNode };
	};
	var findClaudeQueryRoot = () => document.querySelector(CLAUDE_SETTINGS_DIALOG_SELECTOR) ?? document;
	var readSectionHeading = (candidateNode, headingCache) => {
		const sectionElement = candidateNode.closest("section");
		if (sectionElement === null) return "";
		const cachedHeading = headingCache.get(sectionElement);
		if (cachedHeading !== void 0) return cachedHeading;
		const headingText = normalizeWhitespace(sectionElement.querySelector("h1, h2, h3, h4")?.textContent ?? "");
		headingCache.set(sectionElement, headingText);
		return headingText;
	};
	var collectClaudeCards = (now) => {
		const cards = [];
		const headingCache = new WeakMap();
		const trackCandidates = findClaudeQueryRoot().querySelectorAll(CLAUDE_TRACK_SELECTOR);
		for (const candidateNode of trackCandidates) {
			if (candidateNode instanceof HTMLElement === false) continue;
			const rowElement = findClaudeRowElement(candidateNode);
			if (rowElement === null) continue;
			const rowText = normalizeWhitespace(rowElement.textContent ?? "");
			if (CLAUDE_SKIP_PATTERNS.some((pattern) => pattern.test(rowText)) === true) continue;
			const progressElements = resolveClaudeProgressElements(candidateNode);
			if (progressElements === null) continue;
			const { resetAt, durationMs } = parseResetInfo(rowElement, rowText, `${readSectionHeading(candidateNode, headingCache)} ${rowText}`, now);
			cards.push({
				fullText: rowText,
				label: deriveCardLabel(rowText),
				trackContainerElement: progressElements.trackContainerElement,
				resetAt,
				durationMs,
				fillMeaning: "used"
			});
		}
		return cards;
	};
	var CODEX_TRACK_SELECTOR = "div[class*=\"bg-[#ebebf0]\"]";
	var CODEX_FILL_SELECTOR = "div[class*=\"bg-[#\"]:not([class*=\"bg-[#ebebf0]\"])";
	var resolveCodexTrackContainer = (articleElement) => {
		const trackNode = articleElement.querySelector(CODEX_TRACK_SELECTOR);
		if (trackNode instanceof HTMLElement === false) return null;
		const trackContainerNode = trackNode.parentElement;
		if (trackContainerNode instanceof HTMLElement === false) return null;
		const trackRect = trackNode.getBoundingClientRect();
		const fillCandidates = trackContainerNode.querySelectorAll(CODEX_FILL_SELECTOR);
		for (const candidate of fillCandidates) {
			if (candidate instanceof HTMLElement === false) continue;
			if (validateTrackGeometry(trackRect, candidate.getBoundingClientRect())) return trackContainerNode;
		}
		return null;
	};
	var collectCodexCards = (now) => {
		const cards = [];
		const articleNodes = document.querySelectorAll("article");
		for (const articleNode of articleNodes) {
			const fullText = normalizeWhitespace(articleNode.textContent ?? "");
			if (/remaining/iu.test(fullText) === false) continue;
			const trackContainerElement = resolveCodexTrackContainer(articleNode);
			if (trackContainerElement === null) continue;
			const headerText = normalizeWhitespace(articleNode.querySelector("header")?.textContent ?? "");
			const label = deriveCodexCardLabel(headerText, fullText);
			const apiWindow = findCodexRateLimitWindow(headerText);
			if (apiWindow !== null) {
				cards.push({
					fullText,
					label,
					trackContainerElement,
					resetAt: apiWindow.resetAt,
					durationMs: apiWindow.durationMs,
					fillMeaning: "remaining"
				});
				continue;
			}
			const { resetAt, durationMs } = parseResetInfo(articleNode, fullText, headerText.length > 0 ? headerText : fullText, now);
			cards.push({
				fullText,
				label,
				trackContainerElement,
				resetAt,
				durationMs,
				fillMeaning: "remaining"
			});
		}
		return cards;
	};
	var KIMI_CARD_SELECTOR = ".stats-card";
	var KIMI_BAR_SELECTOR = ".stats-card-progress-bar";
	var KIMI_FILL_SELECTOR = ".stats-card-progress-filled";
	var collectKimiCards = (now) => {
		const cards = [];
		const cardNodes = document.querySelectorAll(KIMI_CARD_SELECTOR);
		for (const cardNode of cardNodes) {
			if (cardNode instanceof HTMLElement === false) continue;
			const barNode = cardNode.querySelector(KIMI_BAR_SELECTOR);
			const fillNode = cardNode.querySelector(KIMI_FILL_SELECTOR);
			if (barNode instanceof HTMLElement === false || fillNode instanceof HTMLElement === false) continue;
			if (validateTrackGeometry(barNode.getBoundingClientRect(), fillNode.getBoundingClientRect()) === false) continue;
			const fullText = normalizeWhitespace(cardNode.textContent ?? "");
			const label = deriveCardLabel(fullText);
			const parsedResetInfo = parseResetInfo(cardNode, fullText, fullText, now);
			cards.push({
				fullText,
				label,
				trackContainerElement: barNode,
				resetAt: parsedResetInfo.resetAt,
				durationMs: parsedResetInfo.durationMs,
				fillMeaning: "used"
			});
		}
		return cards;
	};
	var buildResetByDurationLookup = (cards) => {
		const lookup = new Map();
		for (const card of cards) {
			if (card.durationMs === null || card.resetAt === null) continue;
			if (lookup.has(card.durationMs) === false) lookup.set(card.durationMs, card.resetAt);
		}
		return lookup;
	};
	var findWeeklyReset = (cards) => {
		for (const card of cards) if (/weekly/iu.test(card.fullText) === true && card.resetAt !== null) return card.resetAt;
		return null;
	};
	var resolveMissingResetInformation = (cards) => {
		const resetByDurationLookup = buildResetByDurationLookup(cards);
		const weeklyReset = findWeeklyReset(cards);
		for (const card of cards) {
			if (card.resetAt !== null) continue;
			if (card.durationMs !== null) {
				const fallbackReset = resetByDurationLookup.get(card.durationMs);
				if (fallbackReset !== void 0) {
					card.resetAt = fallbackReset;
					continue;
				}
			}
			if (/code\s*review/iu.test(card.fullText) === true && weeklyReset !== null) {
				card.durationMs = ONE_WEEK_MS;
				card.resetAt = weeklyReset;
			}
		}
	};
	var collectUsageCards = (now) => {
		const hostname = globalThis.location.hostname;
		if (hostname === "claude.ai") return collectClaudeCards(now);
		if (hostname === "www.kimi.com") return collectKimiCards(now);
		return collectCodexCards(now);
	};
	var DIVIDER_CLASS = "ai-usage-pace-divider";
	var DIVIDER_BAR_CLASS = "ai-usage-pace-divider-bar";
	var UPDATE_INTERVAL_MS = 3e4;
	var DIVIDER_COLOR = "rgb(249, 115, 22)";
	var DIVIDER_HIT_AREA_WIDTH = "12px";
	var DIVIDER_BAR_WIDTH = "2px";
	var isTargetViewActive = () => {
		if (globalThis.location.hostname !== "claude.ai") return true;
		const { hash, pathname } = globalThis.location;
		return pathname.startsWith("/settings/usage") || pathname === "/new" && hash === "#settings/usage";
	};
	var computeTargetRemainingRatio = (card, now) => {
		if (card.resetAt === null || card.durationMs === null || card.durationMs <= 0) return null;
		const resetTimeMs = card.resetAt.getTime();
		if (Number.isFinite(resetTimeMs) === false) return null;
		const cycleStartMs = resetTimeMs - card.durationMs;
		return clamp(1 - clamp(now.getTime() - cycleStartMs, 0, card.durationMs) / card.durationMs, 0, 1);
	};
	var computeDividerLeftPercent = (card, targetRemainingRatio) => {
		if (card.fillMeaning === "used") return (1 - targetRemainingRatio) * 100;
		return targetRemainingRatio * 100;
	};
	var ensureDividerElement = (trackContainer) => {
		const existingDivider = trackContainer.querySelector(`.${DIVIDER_CLASS}`);
		if (existingDivider !== null) return existingDivider;
		const dividerElement = document.createElement("div");
		dividerElement.className = DIVIDER_CLASS;
		trackContainer.append(dividerElement);
		return dividerElement;
	};
	var ensureBarElement = (dividerElement) => {
		const existingBar = dividerElement.querySelector(`.${DIVIDER_BAR_CLASS}`);
		if (existingBar !== null) return existingBar;
		const barElement = document.createElement("div");
		barElement.className = DIVIDER_BAR_CLASS;
		dividerElement.append(barElement);
		return barElement;
	};
	var removeDividerElement = (trackContainer) => {
		trackContainer.querySelector(`.${DIVIDER_CLASS}`)?.remove();
	};
	var removeAllDividerElements = () => {
		const dividerElements = document.querySelectorAll(`.${DIVIDER_CLASS}`);
		for (const dividerElement of dividerElements) dividerElement.remove();
	};
	var buildDividerTooltip = (targetRemainingRatio) => {
		return `Pace marker: expected ${(targetRemainingRatio * 100).toFixed(1)}% remaining`;
	};
	var applyDividerStyles = (dividerElement, leftPercent) => {
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
	var applyBarStyles = (barElement) => {
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
	var updateDividerElement = (card, targetRemainingRatio) => {
		const trackContainer = card.trackContainerElement;
		if (getComputedStyle(trackContainer).position === "static") trackContainer.style.position = "relative";
		const leftPercent = computeDividerLeftPercent(card, targetRemainingRatio);
		const dividerElement = ensureDividerElement(trackContainer);
		applyDividerStyles(dividerElement, leftPercent);
		applyBarStyles(ensureBarElement(dividerElement));
		dividerElement.title = buildDividerTooltip(targetRemainingRatio);
	};
	var renderPaceDividers = (scheduleRender) => {
		const now = new Date();
		const cards = collectUsageCards(now);
		if (globalThis.location.hostname !== "chatgpt.com") resolveMissingResetInformation(cards);
		const disabledLabels = readDisabledLabels();
		const paceableLabels = [];
		for (const card of cards) {
			const targetRemainingRatio = computeTargetRemainingRatio(card, now);
			if (targetRemainingRatio === null) {
				removeDividerElement(card.trackContainerElement);
				continue;
			}
			paceableLabels.push(card.label);
			if (disabledLabels.includes(card.label) === true) {
				removeDividerElement(card.trackContainerElement);
				continue;
			}
			updateDividerElement(card, targetRemainingRatio);
		}
		syncSettingsMenu(paceableLabels, disabledLabels, scheduleRender);
	};
	var createRenderSession = () => {
		let active = true;
		let animationFrameId = null;
		const scheduleRender = () => {
			if (active === false || animationFrameId !== null) return;
			animationFrameId = globalThis.requestAnimationFrame(() => {
				animationFrameId = null;
				if (active === true) renderPaceDividers(scheduleRender);
			});
		};
		const observer = new MutationObserver(scheduleRender);
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
		const intervalId = globalThis.setInterval(scheduleRender, UPDATE_INTERVAL_MS);
		const timeoutIds = [globalThis.setTimeout(scheduleRender, 300), globalThis.setTimeout(scheduleRender, 2e3)];
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") scheduleRender();
		};
		globalThis.addEventListener("resize", scheduleRender);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		scheduleRender();
		return () => {
			active = false;
			observer.disconnect();
			globalThis.clearInterval(intervalId);
			for (const timeoutId of timeoutIds) globalThis.clearTimeout(timeoutId);
			if (animationFrameId !== null) {
				globalThis.cancelAnimationFrame(animationFrameId);
				animationFrameId = null;
			}
			globalThis.removeEventListener("resize", scheduleRender);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			removeAllDividerElements();
			clearSettingsMenu();
		};
	};
	var setupLifecycle = () => {
		let stopRenderSession = null;
		const syncRenderSession = () => {
			if (isTargetViewActive() === true) {
				stopRenderSession ??= createRenderSession();
				return;
			}
			stopRenderSession?.();
			stopRenderSession = null;
		};
		globalThis.addEventListener("hashchange", syncRenderSession);
		syncRenderSession();
		return () => {
			globalThis.removeEventListener("hashchange", syncRenderSession);
			stopRenderSession?.();
			stopRenderSession = null;
		};
	};
	var bootstrap = () => {
		const globalWindow = globalThis;
		if (globalWindow.__aiUsageDividerInitialized__ === true) return;
		globalWindow.__aiUsageDividerInitialized__ = true;
		const init = () => {
			setupLifecycle();
		};
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
		else init();
	};
	bootstrap();
})();
