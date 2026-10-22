# RiSE MSR Blog

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

https://risemsr.github.io/

News from the RiSE MSR team! This blog covers research, new developments, technical discussions, and the work of the RiSE MSR group. 

Learn more on the [RiSE webpage](https://www.microsoft.com/en-us/research/group/research-software-engineering-rise/) and the [MSR webpage](https://www.microsoft.com/en-us/research/).

## 🚀 Project Structure

```
.
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   └── PostList.astro   # Post list (title, author, abstract)
│   ├── content/
│   │   └── docs/
│   │       ├── blog/        # Blog posts (+ index.mdx: list of all posts)
│   │       └── index.mdx    # Home page (welcome + latest posts)
│   └── content/config.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

Blog posts are `.md` or `.mdx` files in `src/content/docs/blog/`. Each file is exposed as a route based on its file name, which must start with the publication date (`YYYY-MM-DD-`). Set `title`, `author` and `description` (the abstract shown on the home page) in the frontmatter.

## 🧞 Commands

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm install`     | Installs dependencies                       |
| `npm run dev`     | Starts local dev server at `localhost:4321` |
| `npm run build`   | Build your production site to `./dist/`     |
| `npm run preview` | Preview your build locally                  |

## 👀 Want to learn more?

Check out [Starlight's docs](https://starlight.astro.build/) or [Astro documentation](https://docs.astro.build).
