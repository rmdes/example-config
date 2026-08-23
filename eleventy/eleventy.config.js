export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "content/media": "media" });

  // Index page as a virtual template so it lives outside Indiekit's content dir
  eleventyConfig.addTemplate("index.njk", `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>Indiekit local site</title>
<link rel="authorization_endpoint" href="http://localhost:3000/auth">
<link rel="token_endpoint" href="http://localhost:3000/auth/token">
<link rel="micropub" href="http://localhost:3000/micropub">
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem}</style>
</head><body><h1>Indiekit local site</h1>
<p>Built by Eleventy from <code>./content</code>, written by Indiekit at
<a href="http://localhost:3000">localhost:3000</a>.</p>
<ul>{%- for p in collections.all %}{%- if p.url and p.url != "/" %}
<li><a href="{{ p.url }}">{{ p.url }}</a></li>{% endif %}{% endfor %}</ul>
</body></html>`, { permalink: "/index.html", layout: false });

  return {
    dir: { input: "content", output: "_site", includes: "../_includes" },
    markdownTemplateEngine: "njk",
  };
}
