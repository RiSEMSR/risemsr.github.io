import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const docs = await getCollection('docs');
  const posts = docs
    .filter((doc) => doc.id.startsWith('blog/') && !doc.id.includes('0000-'))
    .sort((a, b) => {
      // Sort by filename date prefix (e.g., 2026-02-04) descending
      const dateA = a.id.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
      const dateB = b.id.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
      return dateB.localeCompare(dateA);
    });

  return rss({
    title: 'RiSE MSR Blog',
    description:
      'News from the RiSE MSR team! This blog covers research, new developments, technical discussions, and the work of the RiSE MSR group.',
    site: context.site!.toString(),
    items: posts.map((post) => {
      const dateMatch = post.id.match(/(\d{4}-\d{2}-\d{2})/);
      const pubDate = dateMatch ? new Date(dateMatch[1]) : undefined;
      return {
        title: post.data.title,
        description: post.data.description ?? '',
        link: `/${post.id}/`,
        pubDate,
      };
    }),
  });
}
