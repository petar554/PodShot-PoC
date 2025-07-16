const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add polyfills for Node.js modules
config.resolver.alias = {
  ...config.resolver.alias,
  stream: 'stream-browserify',
  events: 'events',
  util: 'util',
  buffer: 'buffer',
  process: 'process/browser',
  'node:stream': 'stream-browserify',
  'node:events': 'events',
  'node:util': 'util',
  'node:buffer': 'buffer',
  'node:process': 'process/browser',
};

// Ensure proper entry point resolution
config.resolver.platforms = ['native', 'android', 'ios', 'web'];
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
