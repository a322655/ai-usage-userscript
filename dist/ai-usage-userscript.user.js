// ==UserScript==
// @name         AI Usage
// @namespace    https://github.com/a322655
// @version      1.0.0
// @author       a322655
// @description  Show pace dividers on AI usage pages (Codex, Claude, Kimi Code)
// @license      MIT
// @homepageURL  https://github.com/a322655/ai-usage-userscript
// @supportURL   https://github.com/a322655/ai-usage-userscript/issues
// @match        https://chatgpt.com/codex/settings/usage*
// @match        https://claude.ai/settings/usage*
// @match        https://www.kimi.com/code/console*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DAY_ABBR_TO_INDEX = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  };
  const parseTimeTokens = (hourToken, minuteToken, meridiemToken) => {
    const hourValue = Number.parseInt(hourToken, 10);
    const minuteValue = Number.parseInt(minuteToken, 10);
    if (Number.isNaN(hourValue) === true || Number.isNaN(minuteValue) === true || hourValue < 1 || hourValue > 12 || minuteValue < 0 || minuteValue > 59) {
      return null;
    }
    let normalizedHours = hourValue % 12;
    if (meridiemToken.toUpperCase() === "PM") {
      normalizedHours += 12;
    }
    return normalizedHours * 60 + minuteValue;
  };
  const buildDateAtTimeOfDay = (totalMinutes, now) => {
    const candidateDate = new Date(now.getTime());
    candidateDate.setHours(
      Math.floor(totalMinutes / 60),
      totalMinutes % 60,
      0,
      0
    );
    return candidateDate;
  };
  const parseDayTimeLabel = (resetLabel, now) => {
    const dayTimeMatch = resetLabel.match(
      /^\s*(?<day>Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(?<hour>\d{1,2}):(?<minute>\d{2})\s*(?<meridiem>[AP]M)\s*$/i
    );
    if (dayTimeMatch?.groups === void 0) {
      return null;
    }
    const totalMinutes = parseTimeTokens(
      dayTimeMatch.groups["hour"] ?? "",
      dayTimeMatch.groups["minute"] ?? "",
      dayTimeMatch.groups["meridiem"] ?? ""
    );
    if (totalMinutes === null) {
      return null;
    }
    const dayAbbr = (dayTimeMatch.groups["day"] ?? "").toLowerCase().slice(0, 3);
    const targetDayIndex = DAY_ABBR_TO_INDEX[dayAbbr];
    if (targetDayIndex === void 0) {
      return null;
    }
    const candidateDate = buildDateAtTimeOfDay(totalMinutes, now);
    const currentDayIndex = candidateDate.getDay();
    let daysToAdd = targetDayIndex - currentDayIndex;
    if (daysToAdd < 0) {
      daysToAdd += 7;
    }
    if (daysToAdd === 0 && candidateDate.getTime() <= now.getTime()) {
      daysToAdd = 7;
    }
    candidateDate.setDate(candidateDate.getDate() + daysToAdd);
    return candidateDate;
  };
  const parseTimeOnlyLabel = (resetLabel, now) => {
    const timeMatch = resetLabel.match(
      /^\s*(?<hour>\d{1,2}):(?<minute>\d{2})\s*(?<meridiem>[AP]M)\s*$/i
    );
    if (timeMatch?.groups === void 0) {
      return null;
    }
    const totalMinutes = parseTimeTokens(
      timeMatch.groups["hour"] ?? "",
      timeMatch.groups["minute"] ?? "",
      timeMatch.groups["meridiem"] ?? ""
    );
    if (totalMinutes === null) {
      return null;
    }
    const candidateDate = buildDateAtTimeOfDay(totalMinutes, now);
    if (candidateDate.getTime() <= now.getTime()) {
      candidateDate.setDate(candidateDate.getDate() + 1);
    }
    return candidateDate;
  };
  const parseRelativeTimeLabel = (resetLabel, now) => {
    const relativeMatch = resetLabel.match(
      /^in\s+(?:(\d+)\s+days?\s*)?(?:(\d+)\s+hours?\s*)?(?:(\d+)\s+minutes?)?\s*$/i
    );
    if (relativeMatch === null) {
      return null;
    }
    const days = Number.parseInt(relativeMatch[1] ?? "0", 10) || 0;
    const hours = Number.parseInt(relativeMatch[2] ?? "0", 10) || 0;
    const minutes = Number.parseInt(relativeMatch[3] ?? "0", 10) || 0;
    const totalMs = (days * 24 * 60 + hours * 60 + minutes) * 60 * 1e3;
    if (totalMs <= 0) {
      return null;
    }
    return new Date(now.getTime() + totalMs);
  };
  const parseResetDate = (resetLabel, now) => {
    const directTimestamp = Date.parse(resetLabel);
    if (Number.isNaN(directTimestamp) === false) {
      return new Date(directTimestamp);
    }
    return parseDayTimeLabel(resetLabel, now) ?? parseTimeOnlyLabel(resetLabel, now) ?? parseRelativeTimeLabel(resetLabel, now);
  };
  const clamp = (value, min, max) => {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  };
  const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1e3;
  const CODEX_TRACK_SELECTOR = 'div[class*="bg-[#ebebf0]"]';
  const CODEX_FILL_SELECTOR = 'div[class*="bg-[#22c55e]"]';
  const CLAUDE_TRACK_SELECTOR = 'div[class*="bg-bg-000"][class*="h-4"][class*="rounded"]';
  const CLAUDE_FILL_SELECTOR = 'div[class*="h-full"]';
  const KIMI_CARD_SELECTOR = ".stats-card";
  const KIMI_BAR_SELECTOR = ".stats-card-progress-bar";
  const KIMI_FILL_SELECTOR = ".stats-card-progress-filled";
  const validateTrackGeometry = (trackRect, fillRect) => {
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
  const inferDurationMs = (text, resetLabel) => {
    if (/weekly/i.test(text) === true || /code\s*review/i.test(text) === true) {
      return ONE_WEEK_MS;
    }
    if (resetLabel !== null && /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*/i.test(resetLabel) === true) {
      return ONE_WEEK_MS;
    }
    return null;
  };
  const extractResetLabel = (text) => {
    const label = text.match(/Resets\s+(.+)$/i)?.[1]?.trim();
    if (label === void 0 || label.length === 0) {
      return null;
    }
    return label;
  };
  const findResetLabel = (containerElement, fullText) => {
    const candidateNodes = containerElement.querySelectorAll("p, span, div");
    for (const candidateNode of candidateNodes) {
      if (candidateNode instanceof HTMLElement === false) {
        continue;
      }
      const label = extractResetLabel(
        normalizeWhitespace(candidateNode.textContent ?? "")
      );
      if (label !== null) {
        return label;
      }
    }
    return extractResetLabel(fullText);
  };
  const parseResetInfo = (containerElement, fullText, durationSourceText, now) => {
    const resetLabel = findResetLabel(containerElement, fullText);
    const resetAt = resetLabel === null ? null : parseResetDate(resetLabel, now);
    const durationMs = inferDurationMs(
      durationSourceText,
      resetLabel
    );
    return { resetAt, durationMs };
  };
  const resolveCodexProgressElements = (articleElement) => {
    const trackNode = articleElement.querySelector(CODEX_TRACK_SELECTOR);
    const fillNode = articleElement.querySelector(CODEX_FILL_SELECTOR);
    if (trackNode instanceof HTMLElement === false || fillNode instanceof HTMLElement === false) {
      return null;
    }
    const trackContainerNode = trackNode.parentElement;
    if (trackContainerNode instanceof HTMLElement === false) {
      return null;
    }
    const trackRect = trackNode.getBoundingClientRect();
    const fillRect = fillNode.getBoundingClientRect();
    if (validateTrackGeometry(trackRect, fillRect) === false) {
      return null;
    }
    return {
      trackElement: trackNode,
      fillElement: fillNode,
      trackContainerElement: trackContainerNode
    };
  };
  const collectCodexCards = (now) => {
    const cards = [];
    const articleNodes = document.querySelectorAll("article");
    for (const articleNode of articleNodes) {
      const fullText = normalizeWhitespace(articleNode.textContent ?? "");
      if (/remaining/i.test(fullText) === false) {
        continue;
      }
      const resolved = resolveCodexProgressElements(articleNode);
      if (resolved === null) {
        continue;
      }
      const headerElement = articleNode.querySelector("header");
      const headerText = normalizeWhitespace(
        headerElement?.textContent ?? ""
      );
      const durationSourceText = headerText.length > 0 ? headerText : fullText;
      const { resetAt, durationMs } = parseResetInfo(
        articleNode,
        fullText,
        durationSourceText,
        now
      );
      cards.push({
        fullText,
        ...resolved,
        resetAt,
        durationMs,
        fillMeaning: "remaining"
      });
    }
    return cards;
  };
  const resolveClaudeProgressElements = (candidateNode) => {
    const fillNode = candidateNode.querySelector(CLAUDE_FILL_SELECTOR);
    if (fillNode instanceof HTMLElement === false) {
      return null;
    }
    const trackRect = candidateNode.getBoundingClientRect();
    const fillRect = fillNode.getBoundingClientRect();
    if (validateTrackGeometry(trackRect, fillRect) === false) {
      return null;
    }
    const trackContainerNode = candidateNode.parentElement;
    if (trackContainerNode instanceof HTMLElement === false) {
      return null;
    }
    const rowNode = trackContainerNode.parentElement?.parentElement ?? null;
    if (rowNode instanceof HTMLElement === false) {
      return null;
    }
    return {
      trackElement: candidateNode,
      fillElement: fillNode,
      trackContainerElement: trackContainerNode,
      rowElement: rowNode
    };
  };
  const CLAUDE_SKIP_PATTERNS = [
    /current\s+session/i,
    /\$[\d,.]+\s+spent/i
  ];
  const collectClaudeCards = (now) => {
    const cards = [];
    const trackCandidates = document.querySelectorAll(
      CLAUDE_TRACK_SELECTOR
    );
    for (const candidateNode of trackCandidates) {
      if (candidateNode instanceof HTMLElement === false) {
        continue;
      }
      const resolved = resolveClaudeProgressElements(candidateNode);
      if (resolved === null) {
        continue;
      }
      const rowText = normalizeWhitespace(
        resolved.rowElement.textContent ?? ""
      );
      const shouldSkip = CLAUDE_SKIP_PATTERNS.some(
        (pattern) => pattern.test(rowText)
      );
      if (shouldSkip === true) {
        continue;
      }
      const { resetAt, durationMs } = parseResetInfo(
        resolved.rowElement,
        rowText,
        rowText,
        now
      );
      cards.push({
        fullText: rowText,
        trackElement: resolved.trackElement,
        fillElement: resolved.fillElement,
        trackContainerElement: resolved.trackContainerElement,
        resetAt,
        durationMs,
        fillMeaning: "used"
      });
    }
    return cards;
  };
  const collectKimiCards = (now) => {
    const cards = [];
    const cardNodes = document.querySelectorAll(KIMI_CARD_SELECTOR);
    for (const cardNode of cardNodes) {
      if (cardNode instanceof HTMLElement === false) {
        continue;
      }
      const barNode = cardNode.querySelector(KIMI_BAR_SELECTOR);
      const fillNode = cardNode.querySelector(KIMI_FILL_SELECTOR);
      if (barNode instanceof HTMLElement === false || fillNode instanceof HTMLElement === false) {
        continue;
      }
      const trackRect = barNode.getBoundingClientRect();
      const fillRect = fillNode.getBoundingClientRect();
      if (validateTrackGeometry(trackRect, fillRect) === false) {
        continue;
      }
      const fullText = normalizeWhitespace(cardNode.textContent ?? "");
      const { resetAt, durationMs } = parseResetInfo(
        cardNode,
        fullText,
        fullText,
        now
      );
      cards.push({
        fullText,
        trackElement: barNode,
        fillElement: fillNode,
        trackContainerElement: barNode,
        resetAt,
        durationMs,
        fillMeaning: "used"
      });
    }
    return cards;
  };
  const buildResetByDurationLookup = (cards) => {
    const lookup = new Map();
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
  const findWeeklyReset = (cards) => {
    for (const card of cards) {
      if (/weekly/i.test(card.fullText) === true && card.resetAt !== null) {
        return card.resetAt;
      }
    }
    return null;
  };
  const resolveMissingResetInformation = (cards) => {
    const resetByDurationLookup = buildResetByDurationLookup(cards);
    const weeklyReset = findWeeklyReset(cards);
    for (const card of cards) {
      if (card.resetAt !== null) {
        continue;
      }
      if (card.durationMs !== null) {
        const fallbackReset = resetByDurationLookup.get(
          card.durationMs
        );
        if (fallbackReset !== void 0) {
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
  const collectUsageCards = (now) => {
    const hostname = globalThis.location.hostname;
    if (hostname === "claude.ai") {
      return collectClaudeCards(now);
    }
    if (hostname === "www.kimi.com") {
      return collectKimiCards(now);
    }
    return collectCodexCards(now);
  };
  const DIVIDER_CLASS = "ai-usage-pace-divider";
  const UPDATE_INTERVAL_MS = 3e4;
  const PACE_EPSILON = 0.01;
  const STATUS_COLORS = {
    fast: "rgb(239, 68, 68)",
    slow: "rgb(37, 99, 235)",
    "on-track": "rgb(249, 115, 22)",
    unknown: "rgb(249, 115, 22)"
  };
  const STATUS_LABELS = {
    fast: "too fast",
    slow: "too slow",
    "on-track": "on track",
    unknown: "unknown"
  };
  const computeTargetRemainingRatio = (card, now) => {
    if (card.resetAt === null || card.durationMs === null || card.durationMs <= 0) {
      return null;
    }
    const resetTimeMs = card.resetAt.getTime();
    if (Number.isFinite(resetTimeMs) === false) {
      return null;
    }
    const cycleStartMs = resetTimeMs - card.durationMs;
    const elapsedMs = clamp(
      now.getTime() - cycleStartMs,
      0,
      card.durationMs
    );
    const targetRemainingRatio = 1 - elapsedMs / card.durationMs;
    return clamp(targetRemainingRatio, 0, 1);
  };
  const computeCurrentRemainingRatio = (card) => {
    const trackWidth = card.trackElement.getBoundingClientRect().width;
    if (trackWidth <= 0) {
      return null;
    }
    const fillWidth = card.fillElement.getBoundingClientRect().width;
    const fillRatio = clamp(fillWidth / trackWidth, 0, 1);
    if (card.fillMeaning === "used") {
      return 1 - fillRatio;
    }
    return fillRatio;
  };
  const computePaceStatus = (targetRemainingRatio, currentRemainingRatio) => {
    if (currentRemainingRatio === null) {
      return "unknown";
    }
    const targetUsedRatio = 1 - targetRemainingRatio;
    const currentUsedRatio = 1 - currentRemainingRatio;
    const usedDelta = currentUsedRatio - targetUsedRatio;
    if (Math.abs(usedDelta) <= PACE_EPSILON) {
      return "on-track";
    }
    if (usedDelta > 0) {
      return "fast";
    }
    return "slow";
  };
  const ensureDividerElement = (trackContainer) => {
    const existingDivider = trackContainer.querySelector(
      `.${DIVIDER_CLASS}`
    );
    if (existingDivider !== null) {
      return existingDivider;
    }
    const dividerElement = document.createElement("div");
    dividerElement.className = DIVIDER_CLASS;
    trackContainer.append(dividerElement);
    return dividerElement;
  };
  const removeDividerElement = (trackContainer) => {
    const dividerElement = trackContainer.querySelector(
      `.${DIVIDER_CLASS}`
    );
    if (dividerElement !== null) {
      dividerElement.remove();
    }
  };
  const buildDividerTooltip = (targetRemainingRatio, currentRemainingRatio, status) => {
    const targetPercent = (targetRemainingRatio * 100).toFixed(1);
    if (currentRemainingRatio === null) {
      return `Pace marker: expected ${targetPercent}% remaining`;
    }
    const currentPercent = (currentRemainingRatio * 100).toFixed(1);
    const statusLabel = STATUS_LABELS[status];
    return `Pace marker: expected ${targetPercent}% remaining, current ${currentPercent}% (${statusLabel})`;
  };
  const applyDividerStyles = (dividerElement, leftPercent, status) => {
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
  const updateDividerElement = (card, targetRemainingRatio, currentRemainingRatio, status) => {
    const trackContainer = card.trackContainerElement;
    if (getComputedStyle(trackContainer).position === "static") {
      trackContainer.style.position = "relative";
    }
    const leftPercent = card.fillMeaning === "used" ? (1 - targetRemainingRatio) * 100 : targetRemainingRatio * 100;
    const dividerElement = ensureDividerElement(trackContainer);
    applyDividerStyles(dividerElement, leftPercent, status);
    dividerElement.title = buildDividerTooltip(
      targetRemainingRatio,
      currentRemainingRatio,
      status
    );
  };
  const renderPaceDividers = () => {
    const now = new Date();
    const cards = collectUsageCards(now);
    resolveMissingResetInformation(cards);
    for (const card of cards) {
      const targetRemainingRatio = computeTargetRemainingRatio(
        card,
        now
      );
      if (targetRemainingRatio === null) {
        removeDividerElement(card.trackContainerElement);
        continue;
      }
      const currentRemainingRatio = computeCurrentRemainingRatio(card);
      const status = computePaceStatus(
        targetRemainingRatio,
        currentRemainingRatio
      );
      updateDividerElement(
        card,
        targetRemainingRatio,
        currentRemainingRatio,
        status
      );
    }
  };
  let renderScheduled = false;
  const scheduleRender = () => {
    if (renderScheduled === true) {
      return;
    }
    renderScheduled = true;
    globalThis.requestAnimationFrame(() => {
      renderScheduled = false;
      renderPaceDividers();
    });
  };
  const setupAutoRefresh = () => {
    const observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    globalThis.setInterval(scheduleRender, UPDATE_INTERVAL_MS);
    globalThis.addEventListener("resize", scheduleRender);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        scheduleRender();
      }
    });
  };
  const bootstrap = () => {
    const globalWindow = globalThis;
    if (globalWindow.__aiUsageDividerInitialized__ === true) {
      return;
    }
    globalWindow.__aiUsageDividerInitialized__ = true;
    scheduleRender();
    globalThis.setTimeout(() => {
      scheduleRender();
    }, 300);
    globalThis.setTimeout(() => {
      scheduleRender();
    }, 2e3);
    setupAutoRefresh();
  };
  bootstrap();

})();