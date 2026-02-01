# risemsr.github.io

This is the RiSE MSR blog, built with Jekyll and hosted on GitHub Pages.

## Building Locally

To build and preview the site locally:

```bash
bundle install
bundle exec jekyll serve
```

Then visit http://localhost:4000 in your browser.

## Adding Blog Posts

Create a new file in `_posts/` with the format `YYYY-MM-DD-title.markdown`:

```markdown
---
layout: post
title:  "Your Post Title"
date:   YYYY-MM-DD HH:MM:SS +0000
author: Author Name
---

Your post excerpt here.

<!--excerpt-->

The rest of your post content...
Website for posts from the RiSE group at MSR 
