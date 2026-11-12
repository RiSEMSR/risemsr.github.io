import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { formatNames, getBlogPosts, postAuthors, postDate, postUrl } from '../utils/posts';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context: APIContext) {
  const posts = await getBlogPosts();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site!.toString(),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description ?? '',
      author: formatNames(postAuthors(post)) || undefined,
      link: postUrl(post),
      pubDate: new Date(postDate(post)!),
    })),
  });
}
