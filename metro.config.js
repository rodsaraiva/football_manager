const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to resolve .wasm files (needed by expo-sqlite's wa-sqlite on web)
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'wasm'];

// Add COOP/COEP headers required by expo-sqlite on web (SharedArrayBuffer)
config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      metroMiddleware(req, res, next);
    };
  },
};

module.exports = config;
