import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
	plugins: [
		monkey({
			entry: "src/main.ts",
			userscript: {
				name: "AI Usage",
				namespace: "https://github.com/a322655",
				version: "1.1.0",
				description:
					"Show pace dividers on AI usage pages (Codex, Claude, Kimi Code)",
				author: "WindFade",
				license: "MIT",
				homepageURL: "https://github.com/eigenigma/ai-usage-userscript",
				supportURL: "https://github.com/eigenigma/ai-usage-userscript/issues",
				updateURL:
					"https://raw.githubusercontent.com/eigenigma/ai-usage-userscript/main/dist/ai-usage-userscript.user.js",
				downloadURL:
					"https://raw.githubusercontent.com/eigenigma/ai-usage-userscript/main/dist/ai-usage-userscript.user.js",
				match: [
					"https://chatgpt.com/codex/cloud/settings/analytics*",
					"https://claude.ai/settings/usage*",
					"https://www.kimi.com/code/console*",
				],
				"run-at": "document-start",
			},
		}),
	],
});
