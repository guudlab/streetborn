// The web base path is "/streetborn" (app.json default) for GitHub Pages.
// Netlify serves the app from the domain root, so its builds (NETLIFY=true) use "".
// EXPO_BASE_URL, when set, overrides both.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl:
      process.env.EXPO_BASE_URL ??
      (process.env.NETLIFY === 'true' ? '' : config.experiments?.baseUrl),
  },
});
