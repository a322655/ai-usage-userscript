import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
	plugins: [
		monkey({
			entry: "src/main.ts",
			userscript: {
				name: "AI Usage",
				namespace: "https://github.com/a322655",
				version: "1.0.0",
				description:
					"Show pace dividers on AI usage pages (Codex, Claude, Kimi Code)",
				author: "a322655",
				license: "MIT",
				homepageURL:
					"https://github.com/a322655/ai-usage-userscript",
				supportURL:
					"https://github.com/a322655/ai-usage-userscript/issues",
				match: [
					"https://chatgpt.com/codex/cloud/settings/analytics*",
					"https://claude.ai/settings/usage*",
					"https://www.kimi.com/code/console*",
				],
				"run-at": "document-start",
				grant: "none",
			},
		}),
	],
});
