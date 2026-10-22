import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'docs'>;

/** Date prefix (YYYY-MM-DD) from a post's file name, or undefined. */
export function postDate(post: Post): string | undefined {
  return post.id.match(/\d{4}-\d{2}-\d{2}/)?.[0];
}

/** All dated blog posts, newest first. */
export async function getBlogPosts(): Promise<Post[]> {
  const docs = await getCollection('docs');
  return docs
    .filter((doc) => doc.id.startsWith('blog/') && postDate(doc) !== undefined)
    .sort((a, b) => postDate(b)!.localeCompare(postDate(a)!));
}
