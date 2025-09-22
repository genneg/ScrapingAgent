export const SecurityUtils = {
  generateRequestId: jest.fn(() => 'test-request-id'),
  validateUrl: jest.fn(() => ({ valid: true })),
  sanitizeInput: jest.fn((input) => input),
  redactSensitiveData: jest.fn((data) => data),
};