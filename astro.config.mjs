// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Load custom language grammars
const fstarGrammar = JSON.parse(
  fs.readFileSync(new URL('./src/grammars/fstar.tmLanguage.json', import.meta.url), 'utf-8')
);
const pulseGrammar = JSON.parse(
  fs.readFileSync(new URL('./src/grammars/pulse.tmLanguage.json', import.meta.url), 'utf-8')
);
const dafnyGrammar = JSON.parse(
  fs.readFileSync(new URL('./src/grammars/dafny.tmLanguage.json', import.meta.url), 'utf-8')
);

// Blog posts for the sidebar, newest first (file names start with YYYY-MM-DD).
const blogPosts = fs
	.readdirSync(new URL('./src/content/docs/blog/', import.meta.url))
	.filter((f) => /^\d{4}-\d{2}-\d{2}.*\.mdx?$/.test(f))
	.map((f) => 'blog/' + f.replace(/\.mdx?$/, ''))
	.sort()
	.reverse();

// https://astro.build/config
export default defineConfig({
	site: 'https://risemsr.github.io',
	redirects: {
		'/blog/0000-welcome': '/',
	},
	markdown: {
		shikiConfig: {
			langs: [
				{
					...fstarGrammar,
					name: 'fstar',
					aliases: ['fst', 'fsti', 'f*'],
				},
				{
					...pulseGrammar,
					name: 'pulse',
					aliases: [],
				},
				{
					...dafnyGrammar,
					name: 'dafny',
					aliases: ['dfy'],
				},
			],
		},
	},
	integrations: [
		starlight({
			title: 'RiSE MSR',
			description: 'News from the RiSE MSR team! This blog covers research, new developments, technical discussions, and the work of the RiSE MSR group.',
			expressiveCode: {
				plugins: [pluginLineNumbers()],
				defaultProps: {
					showLineNumbers: false,
				},
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/risemsr' },
				{ icon: 'rss', label: 'RSS', href: '/rss.xml' },
			],
			sidebar: [
				{
					label: 'Blog',
					items: ['blog', ...blogPosts],
				},
			],
		}),
	],
});
