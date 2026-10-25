// Ensure Next.js loads Tailwind v4 PostCSS plugin via CommonJS
// Some toolchains may not pick up ESM `.mjs` configs reliably.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

