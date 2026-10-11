import { resolveClassicStateFile } from './classic-state-file.js';
import { resolveWorkspaceRuntimeRoot } from '../workflow-contract/workspace-runtime.js';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { hasClassicManagedRunMarker } from './classic-state.js';
import { hashClassicProjectFile, readClassicProjectFile } from './classic-protected-path.js';
import {
  createFileRuntimeStore,
  createPortableRunCheckpoint,
  readPortableRunCheckpoint,
  PORTABLE_RUN_CHECKPOINT_KEY,
  hashRuntimeValue,
  type RuntimeAction,
  type RuntimeOutcome,
  type WorkflowRun,
} from '../engine/runtime.js';

export function classicSdkCheckDirectoryRef(run: Pick<WorkflowRun, 'runId'>): string {
  return `.comet/runtime/classic-sdk-checks/${hashRuntimeValue({ runId: run.runId })}`;
}

/** 缺失本机日志时，仍可复用便携 checkpoint 已确认的同一次执行结果。 */
export async function classicSdkCheckLogHash(
  projectRoot: string,
  run: Readonly<WorkflowRun>,
  action: Readonly<RuntimeAction>,
  ref: string,
  contentHash: string,
  label: string,
): Promise<string> {
  const input = run.input as { change?: unknown; changeDir?: unknown } | null;
  const changeDir = input?.changeDir;
  if (
    typeof changeDir !== 'string' ||
    path.posix.normalize(ref) !== ref ||
    !ref.endsWith('.log') ||
    (!ref.startsWith(`${changeDir}/.comet/checks/`) &&
      !ref.startsWith(`${classicSdkCheckDirectoryRef(run)}/`)) ||
    !/^[a-f0-9]{64}$/u.test(contentHash)
  )
    throw new Error(`${label} is outside the current change or has an invalid hash`);
  try {
    const log = await hashClassicProjectFile(projectRoot, ref, { label });
    if (log.digest !== contentHash) throw new Error(`${label} changed`);
    return log.digest;
  } catch (error) {
    // 损坏、符号链接、目录或权限错误均不能当作本机记录缺失。
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const output = action.outcome?.output as Record<string, unknown> | null | undefined;
  if (
    input?.change !== run.runId ||
    (changeDir !== `openspec/changes/${run.runId}` &&
      changeDir !== `docs/openspec/changes/${run.runId}`) ||
    hashRuntimeValue(run.actions.find((candidate) => candidate.id === action.id) ?? null) !==
      hashRuntimeValue(action) ||
    action.type !== 'call_tool' ||
    action.ref !== 'classic-check' ||
    action.status !== 'succeeded' ||
    action.outcome?.status !== 'succeeded' ||
    action.claim?.executorId !== 'comet-classic-check' ||
    !output ||
    output.receiptRef !== ref ||
    output.contentHash !== contentHash
  )
    throw new Error(`${label} is missing without a committed successful check`);
  const source = await readClassicProjectFile(
    projectRoot,
    await resolveClassicStateFile(path.resolve(projectRoot, changeDir)),
    {
      label: 'Classic portable check checkpoint',
      maxBytes: Number.MAX_SAFE_INTEGER,
    },
  );
  if (!hasClassicManagedRunMarker(source))
    throw new Error('Classic check recovery requires a managed Run checkpoint');
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error('Classic check checkpoint YAML is invalid');
  const data = document.toJS() as Record<string, unknown>;
  const checkpoint = data[PORTABLE_RUN_CHECKPOINT_KEY];
  const saved = readPortableRunCheckpoint(checkpoint, run.runId, { preserveSourceRevision: true });
  if (
    !saved ||
    (data.run_id !== undefined && data.run_id !== run.runId) ||
    saved.revision > run.revision ||
    hashRuntimeValue(saved.workflow) !== hashRuntimeValue(run.workflow) ||
    hashRuntimeValue(saved.input) !== hashRuntimeValue(run.input)
  )
    throw new Error('Classic check checkpoint does not match the current Run');
  const portable = createPortableRunCheckpoint(run as WorkflowRun).run;
  const recorded = saved.actions.find((candidate) => candidate.id === action.id);
  const current = portable.actions.find((candidate) => candidate.id === action.id);
  if (!recorded || !current || hashRuntimeValue(recorded) !== hashRuntimeValue(current))
    throw new Error('Classic check checkpoint does not confirm the current action');
  return contentHash;
}

type CheckResult = Pick<RuntimeOutcome, 'status' | 'output'>;
interface ClassicCheckReceipt {
  runId: string;
  revision: number;
  schema: 'comet.classic-sdk-check-receipt.v1';
  result: CheckResult;
  resultHash: string;
}

function receiptIdentity(run: Readonly<WorkflowRun>, action: Readonly<RuntimeAction>) {
  if (!action.claim) throw new Error('Classic check receipt requires the original claim');
  return hashRuntimeValue({
    workflow: run.workflow,
    runId: run.runId,
    actionId: action.id,
    attempt: action.attempt,
    inputHash: action.inputHash,
    claim: action.claim,
  });
}

async function receiptStore(projectRoot: string) {
  return createFileRuntimeStore<ClassicCheckReceipt>({
    rootDir: path.join(await resolveWorkspaceRuntimeRoot(projectRoot), 'check-receipts', 'classic'),
  });
}

/** 原始执行结果写入 Runtime 追加式存储；change 内恢复 JSON 只是可重新生成的副本。 */
export async function recordClassicSdkCheckReceipt(
  projectRoot: string,
  run: Readonly<WorkflowRun>,
  action: Readonly<RuntimeAction>,
  result: CheckResult,
) {
  const runId = receiptIdentity(run, action);
  const store = await receiptStore(projectRoot);
  const next: ClassicCheckReceipt = {
    runId,
    revision: 1,
    schema: 'comet.classic-sdk-check-receipt.v1',
    result,
    resultHash: hashRuntimeValue(result),
  };
  if (!(await store.compareAndSwap(runId, null, next))) {
    const existing = await store.read(runId);
    if (hashRuntimeValue(existing) !== hashRuntimeValue(next))
      throw new Error('Classic check already has a different original execution receipt');
  }
}

export async function assertClassicSdkCheckReceipt(
  projectRoot: string,
  run: Readonly<WorkflowRun>,
  action: Readonly<RuntimeAction>,
  result: CheckResult,
) {
  const receipt = await (await receiptStore(projectRoot)).read(receiptIdentity(run, action));
  if (
    !receipt ||
    receipt.schema !== 'comet.classic-sdk-check-receipt.v1' ||
    receipt.revision !== 1 ||
    receipt.resultHash !== hashRuntimeValue(receipt.result)
  )
    throw new Error(
      'Classic check original Runtime execution receipt is unavailable; an editable recovery file or stdout cannot establish success',
    );
  if (hashRuntimeValue(receipt.result) !== hashRuntimeValue(result))
    throw new Error('Classic check result does not match the original Runtime execution receipt');
}

/** 按原领取身份定位检查记录，不把同一阶段的其他轮次当作本次结果。 */
export function classicSdkCheckRecordRef(
  run: Readonly<WorkflowRun>,
  action: Readonly<RuntimeAction>,
) {
  const input = run.input as { changeDir?: unknown } | null;
  if (typeof input?.changeDir !== 'string' || !action.claim)
    throw new Error('Classic check recovery requires the original change and claim');
  return `${classicSdkCheckDirectoryRef(run)}/sdk-${hashRuntimeValue({
    runId: run.runId,
    actionId: action.id,
    attempt: action.attempt,
    inputHash: action.inputHash,
    claim: action.claim,
  })}.json`;
}
