import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, type BigIntStats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WorkspaceRuntimeLocation {
  readonly projectRoot: string;
  readonly dataRoot: string;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly runtimeRoot: string;
}

function directoryGeneration(stat: BigIntStats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}

/** 工作区身份关联这份 checkout 的创建实例；远端地址、分支和修改时间均不参与。 */
export function resolveWorkspaceIdentity(projectRoot: string): {
  projectRoot: string;
  workspaceId: string;
} {
  const root = realpathSync(path.resolve(projectRoot));
  const rootStat = lstatSync(root, { bigint: true });
  if (!rootStat.isDirectory()) throw new Error(`工作区必须是目录：${projectRoot}`);
  const rootGeneration = directoryGeneration(rootStat);
  const identityFor = (gitDirectory: string, gitGeneration: string | null) => ({
    projectRoot: root,
    workspaceId: createHash('sha256')
      .update(
        JSON.stringify(['comet.workspace.v2', root, rootGeneration, gitDirectory, gitGeneration]),
      )
      .digest('hex'),
  });
  const dotGit = path.join(root, '.git');
  let gitDirectory: string;
  let gitGeneration: string;
  try {
    const stat = lstatSync(dotGit);
    if (stat.isSymbolicLink()) throw new Error(`工作区 .git 不能是符号链接：${dotGit}`);
    if (stat.isDirectory()) {
      gitDirectory = realpathSync(dotGit);
      gitGeneration = directoryGeneration(lstatSync(gitDirectory, { bigint: true }));
    } else if (stat.isFile()) {
      if (stat.size > 16 * 1024) throw new Error(`工作区 .git 文件过大：${dotGit}`);
      const match = /^gitdir: (.+)\r?\n?$/u.exec(readFileSync(dotGit, 'utf8'));
      if (!match) throw new Error(`工作区 .git 文件格式无效：${dotGit}`);
      gitDirectory = realpathSync(path.resolve(root, match[1].trim()));
      const gitStat = lstatSync(gitDirectory, { bigint: true });
      if (!gitStat.isDirectory()) throw new Error(`工作区 Git 元数据必须是目录：${gitDirectory}`);
      gitGeneration = directoryGeneration(gitStat);
    } else throw new Error(`工作区 .git 类型无效：${dotGit}`);
  } catch (error) {
    // 仅缺少 .git 可以按普通工作目录处理；损坏的 worktree 指针不能换成另一身份。
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      lstatSync(dotGit);
    } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code === 'ENOENT') {
        return identityFor(dotGit, null);
      }
      throw missing;
    }
    throw error;
  }
  return identityFor(gitDirectory, gitGeneration);
}

/** 规范化受信任的父目录，但保留数据根本身，供调用方拒绝其符号链接。 */
function canonicalParent(target: string): string {
  const parent = path.dirname(target);
  if (parent === target) return target;
  try {
    return path.join(realpathSync(parent), path.basename(target));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return path.join(canonicalParent(parent), path.basename(target));
  }
}

/** 纯路径解析，不创建目录；COMET_DATA_DIR 替代整个用户级 .comet 数据根。 */
export function resolveWorkspaceRuntimeLocation(projectRoot: string): WorkspaceRuntimeLocation {
  const identity = resolveWorkspaceIdentity(projectRoot);
  const configured = process.env.COMET_DATA_DIR;
  if (configured !== undefined && (!configured.trim() || !path.isAbsolute(configured)))
    throw new Error('COMET_DATA_DIR 必须是非空绝对路径');
  const dataRoot = canonicalParent(configured ?? path.join(os.homedir(), '.comet'));
  const relativeData = path.relative(identity.projectRoot, dataRoot);
  if (
    relativeData === '' ||
    (!path.isAbsolute(relativeData) &&
      relativeData !== '..' &&
      !relativeData.startsWith(`..${path.sep}`))
  )
    throw new Error('用户级 Runtime 数据根不能位于当前工作区内');
  const workspaceRoot = path.join(dataRoot, 'workspaces', identity.workspaceId);
  return {
    ...identity,
    dataRoot,
    workspaceRoot,
    runtimeRoot: path.join(workspaceRoot, 'runtime'),
  };
}

export function resolveWorkspaceRuntimeRootSync(projectRoot: string): string {
  return resolveWorkspaceRuntimeLocation(projectRoot).runtimeRoot;
}
