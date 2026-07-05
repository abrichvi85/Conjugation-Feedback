/**
 * Unit tests cover pure logic only (VAD, segmenter, WAV, base64, schema,
 * provider with mocked fetch, repo against node:sqlite, cost) — plain node
 * environment, no react-native runtime needed.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
