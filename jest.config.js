export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  modulePathIgnorePatterns: [
    '<rootDir>/.cache/',
    '<rootDir>/node_modules/.cache/',
    '<rootDir>/.bun/',
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/**/*.d.ts',
  ],
  haste: {
    retainAllFiles: false,
    forceNodeFilesystemAPI: true,
  },
};
