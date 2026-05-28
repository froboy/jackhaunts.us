const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  // Passthrough copy for assets
  eleventyConfig.addPassthroughCopy("src/assets");

  // Slug filter
  eleventyConfig.addFilter("slug", function (str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });

  // Date filter
  eleventyConfig.addFilter("readableDate", function (dateObj) {
    if (!dateObj) return "";
    return DateTime.fromJSDate(new Date(dateObj), { zone: "utc" }).toFormat(
      "LLLL d, yyyy"
    );
  });

  // Capitalize filter
  eleventyConfig.addFilter("capitalize", function (str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  // Truncate filter for teasers
  eleventyConfig.addFilter("truncate", function (str, length = 160) {
    if (!str) return "";
    if (str.length <= length) return str;
    return str.slice(0, length).trim() + "…";
  });

  // Haunts collection: approved haunts in randomized order
  eleventyConfig.addCollection("haunts", function (collectionApi) {
    const approvedHaunts = collectionApi
      .getFilteredByGlob("src/haunts/*.md")
      .filter((item) => item.data.status === "approved");

    for (let i = approvedHaunts.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [approvedHaunts[i], approvedHaunts[j]] = [approvedHaunts[j], approvedHaunts[i]];
    }

    return approvedHaunts;
  });

  return {
    dir: {
      input: "src",
      output: "dist",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
};
