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

  // Haunts collection: approved haunts sorted by submitted date descending
  eleventyConfig.addCollection("haunts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/haunts/*.md")
      .filter((item) => item.data.status === "approved")
      .sort((a, b) => {
        const dateA = new Date(a.data.submitted || 0);
        const dateB = new Date(b.data.submitted || 0);
        return dateB - dateA;
      });
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
