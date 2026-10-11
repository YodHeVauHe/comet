import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evalRunCommand } from '../../app/commands/eval.js';
import { readManagedEvalRun } from '../../domains/eval/eval-run-manager.js';
let experiment: string;
vi.mock('../../platform/process/run-owned-command.js', async () => {
  const childProcess = await import('child_process');
  return {
    runOwnedCommand: vi.fn(async (command, args, options) =>
      childProcess.execFileSync(command, args, {
        cwd: options.cwd,
        stdio: 'inherit',
        env: options.env,
      }),
    ),
  };
});
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn((_command, args, options) => {
      if (args[0] === '--version') return Buffer.from('uv test');
      const context = JSON.parse(options.env.COMET_EVAL_CONTEXT);
      experiment = options.env.COMET_EVAL_EXPERIMENT_ID;
      const root = path.join(context.artifactRoot, 'runs', experiment);
      mkdirSync(root, { recursive: true });
      writeFileSync(
        path.join(root, 'metadata.json'),
        JSON.stringify({
          completed_at: new Date().toISOString(),
          expected_case_matrix: { case_count: 0 },
        }),
      );
      return Buffer.from('');
    }),
  };
});
describe('CLI Eval lifecycle', () => {
  let project: string;
  beforeEach(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-cli-eval-run-'));
    vi.spyOn(os, 'homedir').mockReturnValue(path.join(project, 'home'));
    vi.stubEnv('COMET_EVAL_MANAGED', undefined);
    vi.stubEnv('COMET_APPLICATION_EVAL_CONTEXT', undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await fs.mkdir(path.join(project, 'skill'));
    await fs.writeFile(path.join(project, 'skill/SKILL.md'), '# Report');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(project, { recursive: true, force: true });
  });
  it('persists CLI ownership and completion for Dashboard discovery', async () => {
    await evalRunCommand({
      project,
      skillPath: path.join(project, 'skill'),
      agent: 'codex',
      model: 'fixture-model',
    });
    const record = await readManagedEvalRun(project, experiment);
    expect(record).toMatchObject({
      origin: 'cli',
      status: 'completed',
      owner: { pid: process.pid },
      config: { model: 'fixture-model' },
    });
  });
});
