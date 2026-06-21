/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/__tests__/ui'],
  testMatch: ['<rootDir>/__tests__/ui/**/*.test.(ts|tsx)'],
  setupFiles: ['<rootDir>/__tests__/ui/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Render RN components in jsdom via react-native-web (já instalado). Evita o runtime
    // nativo do react-native 0.81, que não inicializa fora do Metro.
    '^react-native$': 'react-native-web',
    // reanimated: a source TS real é type-checada pelo ts-jest (transformIgnorePatterns
    // libera react-native-*) e não compila fora do Metro. Mapeamos p/ um stub local com
    // a superfície usada pelo kit/overlay (Animated.View, shared values, withTiming…).
    '^react-native-reanimated$': '<rootDir>/__tests__/ui/reanimated-mock.js',
    // expo-haptics: source ESM não transformada; no web é no-op. Stub p/ resolver o import.
    '^expo-haptics$': '<rootDir>/__tests__/ui/expo-haptics-mock.js',
    // Assets de fonte (.ttf/.otf) viram stub — jest não transforma binários; o bundler
    // do Expo resolve esses require() em runtime.
    '\\.(ttf|otf)$': '<rootDir>/__tests__/ui/font-asset-mock.js',
  },
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native-web|@react-native|@react-navigation|react-native-.*)/)',
  ],
};
