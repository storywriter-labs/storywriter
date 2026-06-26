// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: require.resolve('react'),
  'react-dom': require.resolve('react-dom'),
};

// Add resolver configuration for ES modules compatibility.
// Kept at `false` deliberately: this is a global resolver setting that also
// affects native bundles. The SDK 54 web build succeeds with it flipped to
// `true`, but that flip can't be validated for native here, so leave it pinned.
config.resolver.unstable_enablePackageExports = false;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

module.exports = config;
