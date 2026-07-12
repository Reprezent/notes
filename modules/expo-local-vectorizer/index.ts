// Re-export the native module. On web, it will be resolved to ExpoLocalVectorizerModule.web.ts
// and on native platforms to ExpoLocalVectorizerModule.ts
export { default } from './src/ExpoLocalVectorizerModule';
export * from './src/ExpoLocalVectorizer.types';
