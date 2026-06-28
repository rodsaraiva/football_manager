/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // O barrel @/theme (index.ts) importa react-native (StyleSheet) p/ commonStyles.
    // No projeto node mapeamos p/ react-native-web (CJS) só p/ resolver o import —
    // os testes de theme só tocam constantes puras, não o runtime nativo.
    '^react-native$': 'react-native-web',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native-web|@react-native|react-native-.*)/)',
  ],
  // __tests__/ui roda no projeto jsdom (jest.ui.config.js); fora deste projeto node.
  testPathIgnorePatterns: ['/node_modules/', '/test-helpers\\.ts$', '/__tests__/ui/'],
};
