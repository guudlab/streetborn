// Metro setup for the 3D models: .glb files are bundled as assets and loaded at runtime.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb');

module.exports = config;
