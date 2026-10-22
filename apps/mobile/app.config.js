// EXPO_BASE_URL overrides the web base path: "/streetborn" (app.json default)
// for GitHub Pages, "" for Netlify, which serves the app from the domain root.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL ?? config.experiments?.baseUrl,
  },
});
