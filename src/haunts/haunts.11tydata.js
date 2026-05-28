module.exports = {
  eleventyComputed: {
    description: (data) => {
      if (data.request) {
        const text = data.request
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .trim();
        return text.length > 160 ? text.slice(0, 157) + '\u2026' : text;
      }
      return null;
    },
  },
};
