// metro.config.js
const path = require('path');
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

// posthog-react-native (>= 4.38) imports `@posthog/core/surveys`, a package.json
// `exports` subpath. With `unstable_enablePackageExports` pinned `false` above,
// Metro can't map that subpath to its real location on disk, so the bundle fails
// to resolve it. Alias just this one subpath to its CJS entry instead of flipping
// the global package-exports flag (which the comment above keeps off for native).
// `@posthog/core`'s `exports` map only exposes `./surveys` (and not `.` deep
// paths or `./package.json`), so derive the package root from its resolvable
// main entry and join the on-disk CJS path manually.
const posthogCoreMarker = path.join('@posthog', 'core');
const posthogCoreMain = require.resolve('@posthog/core');
const posthogCoreRoot = posthogCoreMain.slice(
  0,
  posthogCoreMain.indexOf(posthogCoreMarker) + posthogCoreMarker.length,
);
const posthogSurveys = path.join(posthogCoreRoot, 'dist/surveys/index.js');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@posthog/core/surveys') {
    return { type: 'sourceFile', filePath: posthogSurveys };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;
