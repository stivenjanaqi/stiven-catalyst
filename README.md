# stiven-catalyst
Modern publication platform for leadership, operations, management insights, field notes and personal projects by Stiven Janaqi.

## How the site works
The site is built with [Eleventy](https://www.11ty.dev/) from the `src/` folder and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

- `src/content/insights/`, `src/content/notes/`, `src/content/projects/`: one Markdown file per essay, field note and project.
- `src/_data/`: site settings (`site.json`), homepage highlights (`home.json`) and Impressum details (`legal.json`).
- `src/_includes/`: the shared layout (head, header, footer), the article layout and the newsletter block.
- `src/media/`: uploaded images and files.
- `.pages.yml`: the editing panel at [app.pagescms.org](https://app.pagescms.org). See `UDHEZUES.md` (in Albanian) for how to add content.

## Run locally
```
npm install
npm start      # http://localhost:8080/stiven-catalyst/
npm run build  # writes the site to _site/
```

## Notes
- Links in templates are written from the site root (`/styles.css`); Eleventy adds the `/stiven-catalyst/` prefix, which comes from `url` in `src/_data/site.json`. For a custom domain, change `url` there and everything follows (links, social previews, sitemap, feed).
- The newsletter section stays hidden until `newsletter.action` is set in `src/_data/site.json`.
- The Impressum and Datenschutz pages are only generated once the address in `src/_data/legal.json` is filled in.
- `src/fonts/` holds Archivo Black (SIL OFL), used only on devices without Arial Black (Android, Linux).
