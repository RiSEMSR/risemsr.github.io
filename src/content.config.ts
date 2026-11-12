import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

export const collections = {
  blog: defineCollection({
    loader: glob({ pattern: '**/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*.{md,mdx}', base: './src/content/blog' }),
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      /** One author or a list of authors. */
      author: z.union([z.string(), z.array(z.string())]).optional(),
      /** People to acknowledge, shown below the author line. */
      thanks: z.array(z.string()).optional(),
    }),
  }),
};
