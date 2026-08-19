import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  validateDevelopmentWorkspace,
} from '../src/services/ai/kaviar-ai.development-workspace-validator';

describe('validateDevelopmentWorkspace', () => {
  it('rejeita lista vazia', async () => {
    await expect(
      validateDevelopmentWorkspace({
        workspace: '/tmp/job',
        baseBackend: '/tmp/base/backend',
        changedPaths: [],
      }),
    ).rejects.toThrow(
      'DEVELOPMENT_WORKSPACE_VALIDATION_NO_CHANGES',
    );
  });

  it('rejeita arquivo de produção nesta fase', async () => {
    await expect(
      validateDevelopmentWorkspace({
        workspace: '/tmp/job',
        baseBackend: '/tmp/base/backend',
        changedPaths: [
          'backend/src/server.ts',
        ],
      }),
    ).rejects.toThrow(
      'DEVELOPMENT_WORKSPACE_VALIDATION_UNSUPPORTED_PATH',
    );
  });

  it('rejeita path traversal', async () => {
    await expect(
      validateDevelopmentWorkspace({
        workspace: '/tmp/job',
        baseBackend: '/tmp/base/backend',
        changedPaths: [
          'backend/tests/../../outside.test.ts',
        ],
      }),
    ).rejects.toThrow();
  });

  it('não aceita arquivo fora de backend/tests', async () => {
    await expect(
      validateDevelopmentWorkspace({
        workspace: '/tmp/job',
        baseBackend: '/tmp/base/backend',
        changedPaths: [
          'tests/example.test.ts',
        ],
      }),
    ).rejects.toThrow(
      'DEVELOPMENT_WORKSPACE_VALIDATION_UNSUPPORTED_PATH',
    );
  });
});
