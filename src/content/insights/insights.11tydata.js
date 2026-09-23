const WORDS_PER_MINUTE = 220;

export default {
  layout: "layouts/article.njk",
  // Essays marked "soon" are listed but get no page of their own yet.
  // "address" lets older essays keep their original URL (e.g. /article-kpi.html).
  permalink: (data) => {
    if (data.status === "soon") return false;
    return data.address || `/insights/${data.page.fileSlug}/`;
  },
  eleventyComputed: {
    // A reading time typed in the panel wins; otherwise it is counted from the text.
    readingTime: (data) => {
      if (data.read_time) return data.read_time;
      const text = String(data.page.rawInput || "").replace(/<[^>]+>/g, " ");
      const words = text.split(/\s+/).filter(Boolean).length;
      return words ? `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min` : "";
    },
  },
};
