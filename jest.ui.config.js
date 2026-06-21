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
