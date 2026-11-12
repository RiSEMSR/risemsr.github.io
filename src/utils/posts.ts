import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Date prefix (YYYY-MM-DD) from a post's file name, or undefined. */
export function postDate(post: Post): string | undefined {
  return post.id.match(/\d{4}-\d{2}-\d{2}/)?.[0];
}

/** URL of a post. */
export function postUrl(post: Post): string {
  return `/blog/${post.id}/`;
}

/** Human-readable date, e.g. "Oct 20, 2026". */
export function formatDate(date: string | undefined): string {
  if (!date) return '';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Authors of a post, as a list. */
export function postAuthors(post: Post): string[] {
  const { author } = post.data;
  return (Array.isArray(author) ? author : author ? [author] : []).map((a) => a.trim());
}

/** URL slug for an author name, e.g. "Nikolaj Bjørner" -> "nikolaj-bjorner". */
export function authorSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/gi, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** URL of an author's page. */
export function authorUrl(name: string): string {
  return `/authors/${authorSlug(name)}/`;
}

/** All authors with their posts (newest first), sorted by name. */
export async function getAuthors(): Promise<{ name: string; slug: string; posts: Post[] }[]> {
  const bySlug = new Map<string, { name: string; slug: string; posts: Post[] }>();
  for (const post of await getBlogPosts()) {
    for (const name of postAuthors(post)) {
      const slug = authorSlug(name);
      if (!bySlug.has(slug)) bySlug.set(slug, { name, slug, posts: [] });
      bySlug.get(slug)!.posts.push(post);
    }
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Joins names as "A", "A and B", or "A, B, and C". */
export function formatNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

/** Estimated reading time in minutes. */
export function readingTime(post: Post): number {
  const words = (post.body ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

/** All dated blog posts, newest first. */
export async function getBlogPosts(): Promise<Post[]> {
  const posts = await getCollection('blog');
  return posts
    .filter((post) => postDate(post) !== undefined)
    .sort((a, b) => postDate(b)!.localeCompare(postDate(a)!));
}
