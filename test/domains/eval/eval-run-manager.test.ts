import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvalRun, requestStopEvalRun } from '../../../domains/eval/eval-run-manager.js';
const launch = vi.fn(async () => ({ pid: process.pid }));
vi.mock('../../../platform/process/eval-worker.js', () => ({
  launchEvalWorker: (...args: unknown[]) => launch(...args),
}));
vi.mock('../../../domains/eval/eval-run-preview.js', () => ({
  previewEvalRun: vi.fn(async (_project: string, config: unknown) => ({
    config,
    target: { id: 'skill', contentHash: 'content', type: 'skill' },
    confirmationHash: 'preview',
    taskSource: 'pending-generation',
    blockedReasons: [],
  })),
}));
describe('Eval run launch ownership', () => {
  let project: string;
  const request = {
    config: { target: 'skill', targetType: 'skill', agent: 'codex', model: 'model-a' },
    confirmationHash: 'preview',
    requestId: 'one-click',
  };
  beforeEach(async () => {
    launch.mockClear();
    project = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-eval-manager-'));
  });
  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });
  it('deduplicates concurrent launches with the same request identity', async () => {
    const [a, b] = await Promise.all([
      startEvalRun(project, request),
      startEvalRun(project, request),
    ]);
    expect(a.id).toBe(b.id);
    expect(launch).toHaveBeenCalledTimes(1);
  });
  it('rejects changed preview identity before launching a process', async () => {
    await expect(startEvalRun(project, { ...request, confirmationHash: 'stale' })).rejects.toThrow(
      /变化|重新/,
    );
    expect(launch).not.toHaveBeenCalled();
  });
  it('records a stop request instead of claiming the worker has already stopped', async () => {
    const run = await startEvalRun(project, request);
    const stopping = await requestStopEvalRun(project, run.id);
    expect(stopping.executionStatus).toBe('stopping');
    const marker = JSON.parse(
      await fs.readFile(
        path.join(project, '.comet/eval/runs', run.id, 'stop-request.json'),
        'utf8',
      ),
    );
    expect(marker.runId).toBe(run.id);
  });
});
