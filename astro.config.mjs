// @ts-check
import { defineConfig } from 'astro/config';
import expressiveCode from 'astro-expressive-code';
import sitemap from '@astrojs/sitemap';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import fs from 'fs';

// Load custom language grammars
const loadGrammar = (/** @type {string} */ file) =>
	JSON.parse(fs.readFileSync(new URL(`./src/grammars/${file}`, import.meta.url), 'utf-8'));

const langs = [
	{ ...loadGrammar('fstar.tmLanguage.json'), name: 'fstar', aliases: ['fst', 'fsti', 'f*'] },
	{ ...loadGrammar('pulse.tmLanguage.json'), name: 'pulse', aliases: [] },
	{ ...loadGrammar('dafny.tmLanguage.json'), name: 'dafny', aliases: ['dfy'] },
];

// https://astro.build/config
export default defineConfig({
	site: 'https://risemsr.github.io',
	redirects: {
		'/blog/0000-welcome': '/',
	},
	markdown: {
		shikiConfig: { langs },
	},
	integrations: [
		expressiveCode({
			themes: ['github-dark-dimmed', 'github-light'],
			// Follow the site's light/dark toggle (data-theme on <html>).
			themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
			useDarkModeMediaQuery: false,
			shiki: { langs },
			plugins: [pluginLineNumbers()],
			defaultProps: {
				showLineNumbers: false,
			},
			styleOverrides: {
				borderRadius: '0',
				codeFontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
				codeFontSize: '0.875rem',
				uiFontFamily: "'Inter Variable', system-ui, sans-serif",
			},
		}),
		sitemap(),
	],
});
