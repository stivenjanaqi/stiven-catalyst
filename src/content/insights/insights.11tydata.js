export default {
  layout: "layouts/article.njk",
  // Essays marked "soon" are listed but get no page of their own yet.
  // "address" lets older essays keep their original URL (e.g. /article-kpi.html).
  permalink: (data) => {
    if (data.status === "soon") return false;
    return data.address || `/insights/${data.page.fileSlug}/`;
  },
};
