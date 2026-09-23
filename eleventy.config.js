import { HtmlBasePlugin } from "@11ty/eleventy";
import fs from "node:fs";

const site = JSON.parse(fs.readFileSync("src/_data/site.json", "utf8"));

const byDate = (a, b) => a.date - b.date || a.fileSlug.localeCompare(b.fileSlug);

export default function (eleventyConfig) {
  // Pages are written with root-relative links ("/styles.css"); this plugin
  // prefixes them with the folder the site lives in (e.g. /stiven-catalyst/).
  eleventyConfig.addPlugin(HtmlBasePlugin);

  for (const path of ["styles.css", "script.js", "favicon.svg", "social.png", "fonts", "media", "js"]) {
    eleventyConfig.addPassthroughCopy(`src/${path}`);
  }

  // Insights, numbered oldest first (01, 02, ...), as on the Insights page.
  eleventyConfig.addCollection("insights", (api) =>
    api.getFilteredByGlob("src/content/insights/*.md").sort(byDate).map((item, index) => {
      item.data.number = String(index + 1).padStart(2, "0");
      return item;
    })
  );
  eleventyConfig.addCollection("published", (api) =>
    api.getFilteredByGlob("src/content/insights/*.md").filter((item) => item.data.status !== "soon").sort(byDate)
  );
  eleventyConfig.addCollection("notes", (api) =>
    api.getFilteredByGlob("src/content/notes/*.md").sort((a, b) => b.date - a.date || a.fileSlug.localeCompare(b.fileSlug))
  );
  eleventyConfig.addCollection("projects", (api) =>
    api.getFilteredByGlob("src/content/projects/*.md").sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99))
  );

  eleventyConfig.addGlobalData("year", new Date().getFullYear());

  eleventyConfig.addFilter("readableDate", (date) =>
    new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  );
  eleventyConfig.addFilter("pad", (value) => String(value).padStart(2, "0"));
  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString().slice(0, 10));
  eleventyConfig.addFilter("absoluteUrl", (path) => new URL(String(path).replace(/^\//, ""), site.url).href);
  // The newest published essay marked "featured", for the homepage.
  eleventyConfig.addFilter("featured", (items) =>
    items.filter((item) => item.data.featured && item.data.status !== "soon").at(-1)
  );
  eleventyConfig.addFilter("except", (items, excluded) => items.filter((item) => item !== excluded));
  eleventyConfig.addFilter("last", (items, count) => items.slice(-count));
  eleventyConfig.addFilter("first", (items, count) => items.slice(0, count));

  return {
    dir: { input: "src", output: "_site" },
    pathPrefix: new URL(site.url).pathname,
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
}
