module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'services/**/*.ts',
    'types/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Add transformIgnorePatterns to handle ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(nanoid)/)'
  ],
  // Add moduleNameMapper for ES modules
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/node_modules/nanoid/index.cjs'
  }
};