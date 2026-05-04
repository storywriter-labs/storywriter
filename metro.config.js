// metro.config.js
const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: require.resolve('react'),
  'react-dom': require.resolve('react-dom'),
};

// Add resolver configuration for ES modules compatibility
config.resolver.unstable_enablePackageExports = false;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

// posthog-react-native 4.44+ uses @posthog/core/surveys subpath exports which
// Metro can't resolve when unstable_enablePackageExports is false. resolveRequest
// intercepts from any origin (including within node_modules, unlike extraNodeModules).
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@posthog/core/surveys') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/@posthog/core/dist/surveys/index.js'),
      type: 'sourceFile',
    };
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;