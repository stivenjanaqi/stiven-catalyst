# stiven-catalyst
Modern publication platform for leadership, operations, management insights, field notes and personal projects by Stiven Janaqi.

## How the site works
The site is built with [Eleventy](https://www.11ty.dev/) from the `src/` folder and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

- `src/content/insights/`, `src/content/notes/`, `src/content/projects/`: one Markdown file per essay, field note and project.
- `src/_data/`: site settings (`site.json`), homepage highlights (`home.json`) and Impressum details (`legal.json`).
- `src/_includes/`: the shared layout (head, header, footer), the article layout and the newsletter block.
- `src/media/`: uploaded images and files.
- `src/tools/` and `src/js/`: the free tools (KPI Diagnostic, 5 Whys, Damage Control, Incomplete Control, Delay Analyzer, Sigma & Control Chart) and the Six Sigma in the Warehouse course. Their cards come from `src/_data/tools.json`; the diagnostic's statements and advice live in `src/_data/kpiDiagnostic.json`. Damage Control and Incomplete Control share one page partial (`partials/defect-log.njk`) and script (`js/defect-log.js`); everything that differs (wording, fields, stage and cause advice, floor check, example week) lives in `src/_data/damageControl.json` and `src/_data/incompleteControl.json`. Delay Analyzer has its own page and script (`js/delay-analyzer.js`), with reasons, advice, floor check and example week in `src/_data/delayAnalyzer.json`. Sigma & Control Chart (`js/sigma-chart.js`, `src/_data/sigmaChart.json`) holds the sigma and perfect delivery calculators and a p-chart with three signal rules. The course (`tools/six-sigma-dmaic.njk`, `js/dmaic.js`) takes its steps, case, quiz, eight wastes, glossary and charter fields from `src/_data/dmaic.json`. The warehouse tools share small helpers in `js/tool-kit.js`. They run entirely in the browser; logs are kept only in the visitor's `localStorage`.
- `.pages.yml`: the editing panel at [app.pagescms.org](https://app.pagescms.org). See `UDHEZUES.md` (in Albanian) for how to add content.

## Run locally
```
npm install
npm start      # http://localhost:8080/stiven-catalyst/
npm run build  # writes the site to _site/
```

## Notes
- Links in templates are written from the site root (`/styles.css`); Eleventy adds the `/stiven-catalyst/` prefix, which comes from `url` in `src/_data/site.json`. For a custom domain, change `url` there and everything follows (links, social previews, sitemap, feed).
- Insights and Field Notes have client-side search and topic filters (`src/js/filter.js`); the filter is kept in the URL (`?topic=Operations&q=handoff`) so it can be shared. Essays show a reading time that is counted from the text unless one is typed in.
- The newsletter section stays hidden until `newsletter.action` is set in `src/_data/site.json`.
- The Impressum and Datenschutz pages are only generated once the name and city in `src/_data/legal.json` are filled in.
- `src/fonts/` holds Archivo Black (SIL OFL), used only on devices without Arial Black (Android, Linux).
