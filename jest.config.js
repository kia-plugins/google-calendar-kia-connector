module.exports = {
  projects: [
    { displayName: 'src', testEnvironment: 'node', testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }] } },
    { displayName: 'ui', testEnvironment: 'jsdom', testMatch: ['<rootDir>/ui/**/__tests__/**/*.test.ts?(x)'],
      transform: { '^.+\\.tsx?$': ['ts-jest', { diagnostics: false, tsconfig: { jsx: 'react-jsx' } }] } },
  ],
};
