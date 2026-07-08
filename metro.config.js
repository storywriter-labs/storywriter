// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: require.resolve('react'),
  'react-dom': require.resolve('react-dom'),
};

// Add resolver configuration for ES modules compatibility.
// Enabled per the Fizzy #43 audit (see PLAN.md `## Notes`): bundling every
// platform with this flag on vs. off showed no graph-shape changes and no
// unresolved imports, just same-package format swaps (UMD/CJS -> ESM/modern
// builds) plus native resolution of package.json `exports` subpaths such as
// `@posthog/core/surveys`, which previously needed the manual resolveRequest
// alias below.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

module.exports = config;
