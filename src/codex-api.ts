// ---------------------------------------------------------------------------
// Types (API response shape)
// ---------------------------------------------------------------------------

interface ApiRateLimitWindow {
	limit_window_seconds: number;
	reset_at: number;
}

interface ApiRateLimit {
	primary_window: ApiRateLimitWindow | null;
	secondary_window: ApiRateLimitWindow | null;
}

interface ApiUsageResponse {
	rate_limit?: ApiRateLimit;
	code_review_rate_limit?: ApiRateLimit;
	additional_rate_limits?: ReadonlyArray<{
		limit_name: string;
		rate_limit: ApiRateLimit;
	}>;
}

// ---------------------------------------------------------------------------
// Types (public)
// ---------------------------------------------------------------------------

export interface CodexRateLimitWindow {
	durationMs: number;
	resetAt: Date;
}

// ---------------------------------------------------------------------------
// Fetch interception (side-effect on import)
// ---------------------------------------------------------------------------

let interceptedData: ApiUsageResponse | null = null;

const USAGE_API_PATH: string = "/backend-api/wham/usage";

const isUsageApiUrl = (url: string): boolean =>
	url.includes(USAGE_API_PATH) === true &&
	url.includes("daily") === false &&
	url.includes("credit") === false;

const extractUrlFromInput = (input: unknown): string => {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof Request) {
		return input.url;
	}
	return "";
};

const handleInterceptedResponse = (response: Response): void => {
	response
		.clone()
		.json()
		.then((data: unknown): void => {
			interceptedData = data as ApiUsageResponse;
		})
		// Intentionally swallow JSON parse failures from non-JSON responses
		.catch((): undefined => undefined);
};

const installFetchInterceptor = (): void => {
	const originalFetch: typeof fetch = globalThis.fetch;
	const handler: ProxyHandler<typeof fetch> = {
		apply: (
			target: typeof fetch,
			thisArg: unknown,
			args: unknown[],
		): Promise<Response> => {
			const result: Promise<Response> = Reflect.apply(
				target,
				thisArg,
				args,
			) as Promise<Response>;
			const url: string = extractUrlFromInput(args[0]);
			if (isUsageApiUrl(url) === true) {
				result.then(handleInterceptedResponse).catch(
					// Intentionally swallow network errors
					(): undefined => undefined,
				);
			}
			return result;
		},
	};
	globalThis.fetch = new Proxy(originalFetch, handler);
};

if (globalThis.location.hostname === "chatgpt.com") {
	installFetchInterceptor();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const toWindow = (
	apiWindow: ApiRateLimitWindow | null | undefined,
): CodexRateLimitWindow | null => {
	if (apiWindow === null || apiWindow === undefined) {
		return null;
	}
	if (apiWindow.limit_window_seconds <= 0 || apiWindow.reset_at <= 0) {
		return null;
	}
	return {
		durationMs: apiWindow.limit_window_seconds * 1_000,
		resetAt: new Date(apiWindow.reset_at * 1_000),
	};
};

const resolveRateLimitWindow = (
	rateLimit: ApiRateLimit,
	headerText: string,
): CodexRateLimitWindow | null => {
	if (/weekly/i.test(headerText) === true) {
		return toWindow(rateLimit.secondary_window);
	}
	if (/\d+\s*hour/i.test(headerText) === true) {
		return toWindow(rateLimit.primary_window);
	}
	return null;
};

const findAdditionalModelWindow = (
	additionalLimits: NonNullable<ApiUsageResponse["additional_rate_limits"]>,
	headerText: string,
): CodexRateLimitWindow | null => {
	for (const model of additionalLimits) {
		if (headerText.includes(model.limit_name) === true) {
			return resolveRateLimitWindow(model.rate_limit, headerText);
		}
	}
	return null;
};

export const findCodexRateLimitWindow = (
	headerText: string,
): CodexRateLimitWindow | null => {
	if (interceptedData === null) {
		return null;
	}

	if (interceptedData.additional_rate_limits !== undefined) {
		return findAdditionalModelWindow(
			interceptedData.additional_rate_limits,
			headerText,
		);
	}

	if (/code\s*review/i.test(headerText) === true) {
		return toWindow(
			interceptedData.code_review_rate_limit?.primary_window ?? null,
		);
	}

	const fallbackRateLimit: ApiRateLimit = {
		primary_window: null,
		secondary_window: null,
	};
	return resolveRateLimitWindow(
		interceptedData.rate_limit ?? fallbackRateLimit,
		headerText,
	);
};
