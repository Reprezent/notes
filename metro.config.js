const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add wasm to assetExts to handle expo-sqlite web WASM module
if (config.resolver && config.resolver.assetExts) {
  if (!config.resolver.assetExts.includes('wasm')) {
    config.resolver.assetExts.push('wasm');
  }
} else {
  if (!config.resolver) config.resolver = {};
  config.resolver.assetExts = ['wasm'];
}

module.exports = withNativeWind(config, { input: './tailwind.css' });
