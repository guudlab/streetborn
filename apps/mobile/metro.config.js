// Metro setup for the 3D models and the native 3D match bundle: both are bundled as assets and loaded at runtime.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb', 'html'); // html: the generated 3D match bundle for the native WebView

module.exports = config;
