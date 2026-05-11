import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  preset: 'ts-jest',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts', '<rootDir>/src/**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    // Resolve @/ path aliases
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        // ts-jest needs these to be explicit
        esModuleInterop: true,
        moduleResolution: 'bundler',
      },
    }],
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],

  // Don't try to transform node_modules except viem (ESM)
  transformIgnorePatterns: [
    '/node_modules/(?!(viem)/)',
  ],
  // Web Crypto is available in Node 18+ but jsdom needs it forwarded
  testEnvironmentOptions: {
    customExportConditions: ['node', 'require', 'default'],
  },
  // Collect coverage from source files
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/hooks/**/*.ts',
    'src/app/api/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
}

export default config
