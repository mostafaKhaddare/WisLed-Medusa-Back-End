const { loadEnv } = require('@medusajs/utils');
loadEnv('test', process.cwd());

module.exports = {
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true
          },
          target: 'es2022',
          transform: {
            hidden: {
              jest: true
            }
          }
        },
        module: {
          type: 'commonjs'
        }
      }
    ]
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'ts', 'json'],
  modulePathIgnorePatterns: ['dist/', '<rootDir>/.medusa/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};

if (process.env.TEST_TYPE === 'integration:http') {
  module.exports.testMatch = ['**/integration-tests/http/*.spec.[jt]s'];
} else if (process.env.TEST_TYPE === 'integration:new') {
  module.exports.testMatch = ['**/integration-tests/new/*.integration.spec.[jt]s'];
} else if (process.env.TEST_TYPE === 'integration:modules') {
  module.exports.testMatch = ['**/src/modules/*/__tests__/**/*.[jt]s'];
} else if (process.env.TEST_TYPE === 'unit') {
  module.exports.testMatch = ['**/src/**/__tests__/**/*.unit.spec.[jt]s'];
}