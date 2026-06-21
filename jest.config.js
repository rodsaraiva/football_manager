/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // __tests__/ui roda no projeto jsdom (jest.ui.config.js); fora deste projeto node.
  testPathIgnorePatterns: ['/node_modules/', '/test-helpers\\.ts$', '/__tests__/ui/'],
};
