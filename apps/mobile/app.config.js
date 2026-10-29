// The web base path is "/streetborn" (app.json default) for GitHub Pages.
// Netlify and Cloudflare serve the app from the domain root, so their builds
// (NETLIFY=true, CF_PAGES=1 or WORKERS_CI=1) use "".
// EXPO_BASE_URL, when set, overrides both.
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    // Placeholder until the store bundle id is decided; the sideload workflow
    // (ios-sideload.yml) lets Sideloadly rewrite it for a free Apple ID.
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? 'com.guudlab.streetborn',
  },
  experiments: {
    ...config.experiments,
    baseUrl:
      process.env.EXPO_BASE_URL ??
      (process.env.NETLIFY === 'true' || process.env.CF_PAGES === '1' || process.env.WORKERS_CI === '1' ? '' : config.experiments?.baseUrl),
  },
});
