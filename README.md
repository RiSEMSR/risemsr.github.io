# RiSE MSR Blog

https://risemsr.github.io/

News from the RiSE MSR team! This blog covers research, new developments, technical discussions, and the work of the RiSE MSR group. 

Learn more on the [RiSE webpage](https://www.microsoft.com/en-us/research/group/research-software-engineering-rise/) and the [MSR webpage](https://www.microsoft.com/en-us/research/).

## 🚀 Project Structure

```
.
├── public/
├── src/
│   ├── assets/              # Images used in posts
│   ├── components/          # Header, footer, post cards, table of contents, ...
│   ├── content/
│   │   └── blog/            # Blog posts
│   ├── grammars/            # Syntax highlighting for F*, Pulse, Dafny
│   ├── layouts/
│   │   └── BaseLayout.astro # Page shell (head, header, footer, theme)
│   ├── pages/
│   │   ├── index.astro      # Home page (hero + latest posts)
│   │   ├── blog/index.astro # Archive of all posts
│   │   ├── blog/[...slug].astro # Post page
│   │   ├── authors/         # Author index and per-author post lists
│   │   └── rss.xml.ts
│   ├── styles/global.css    # Design tokens (light/dark) and article typography
│   └── content.config.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

Blog posts are `.md` or `.mdx` files in `src/content/blog/`. Each file is exposed as `/blog/<file name>/`; the file name must start with the publication date (`YYYY-MM-DD-`). Set `title`, `author` and `description` (the abstract shown on the home page) in the frontmatter. `author` can be a single name or a list (`author: [Ada Lovelace, Alan Turing]`); acknowledgments go in an optional `thanks` list. Don't repeat the authors in the post body. Each author gets a page at `/authors/<name>/`, so spell names consistently across posts. Reference images in `src/assets/` with relative paths, e.g. `![Alt](../../assets/foo.png)`.

Search is provided by [Pagefind](https://pagefind.app/), which indexes the built site after `astro build` (so it only works with `npm run build && npm run preview`, not `npm run dev`).

Code blocks are rendered with [Expressive Code](https://expressive-code.com/); add `showLineNumbers` after the language to number lines.

## 🧞 Commands

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm install`     | Installs dependencies                       |
| `npm run dev`     | Starts local dev server at `localhost:4321` |
| `npm run build`   | Build the site and search index to `./dist/` |
| `npm run preview` | Preview your build locally                  |

## 🚢 Publishing

[RiSEMSR/risemsr-blog](https://github.com/RiSEMSR/risemsr-blog) is the private staging repo. Every push to its `main` branch is pushed to the public [RiSEMSR/risemsr.github.io](https://github.com/RiSEMSR/risemsr.github.io) by `.github/workflows/publish.yml`, where `.github/workflows/deploy.yml` builds and deploys GitHub Pages.

One-time setup:

1. `ssh-keygen -t ed25519 -N "" -f deploy_key -C risemsr-blog-publish`
2. In risemsr.github.io → Settings → Deploy keys, add `deploy_key.pub` with **write access**.
3. In risemsr-blog → Settings → Secrets and variables → Actions, add `deploy_key` as secret `PUBLIC_REPO_DEPLOY_KEY`.
4. Delete the local key files.

Commit to the staging repo only; commits made directly to the public repo will make the push fail (non-fast-forward).

## 👀 Want to learn more?

Check out the [Astro documentation](https://docs.astro.build) and the [Expressive Code documentation](https://expressive-code.com/).
