// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
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

// https://astro.build/config
export default defineConfig({
	site: 'https://risemsr.github.io',
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
			],
		},
	},
	integrations: [
		starlight({
			title: 'RiSE MSR',
			description: 'News from the RiSE MSR team! This blog covers research, new developments, technical discussions, and the work of the RiSE MSR group.',
			social: {
				github: 'https://github.com/risemsr',
			},
			sidebar: [
				{
					label: 'Blog',
					autogenerate: { directory: 'blog' },
				},
			],
		}),
	],
});
