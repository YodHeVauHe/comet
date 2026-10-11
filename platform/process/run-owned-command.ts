import { spawnOwnedCommand } from './owned-command.js';
import { readProcessIdentity } from './process-identity.js';
import { terminateProcessTree } from './terminate-process-tree.js';

export async function runOwnedCommand(
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    streamOutput?: boolean;
    timeoutMs?: number;
    onRegistered?: (instance: { pid: number; identity?: string }) => Promise<void>;
  },
): Promise<string> {
  const owned = spawnOwnedCommand(command, args, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: options.timeoutMs ?? 2_147_483_000,
  });
  const closed = new Promise<void>((resolve) => owned.child.once('close', () => resolve()));
  const output: Buffer[] = [];
  let bytes = 0;
  let exitCode: number | null = null;
  let resolveResult: () => void;
  let rejectResult: (error: Error) => void;
  const result = new Promise<void>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  void result.catch(() => {});
  owned.child.once('error', (error) => rejectResult(error));
  owned.child.once('close', () => {
    if (exitCode === null) rejectResult(new Error('执行监管进程已中断'));
  });
  owned.child.on('message', (message) => {
    const value = message as {
      type?: string;
      exitCode?: number;
      message?: string;
      reason?: string;
    };
    if (value.type === 'completed') {
      exitCode = value.exitCode ?? null;
      if (exitCode === 0) resolveResult();
      else rejectResult(new Error(`命令退出码 ${exitCode}`));
    } else if (value.type === 'spawn-error' || value.type === 'interrupted')
      rejectResult(new Error(value.message ?? value.reason ?? '执行已中断'));
  });
  if (options.streamOutput) {
    owned.child.stdout.pipe(process.stdout, { end: false });
    owned.child.stderr.pipe(process.stderr, { end: false });
  } else {
    owned.child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= 8 * 1024 * 1024) output.push(chunk);
      else {
        rejectResult(new Error('命令输出超过限制'));
        void terminateProcessTree(owned.child);
      }
    });
    owned.child.stderr.on('data', () => {});
  }
  try {
    const identity = await readProcessIdentity(owned.child.pid!);
    await options.onRegistered?.({ pid: owned.child.pid!, ...(identity ? { identity } : {}) });
    owned.start();
    await result;
    await closed;
    return Buffer.concat(output).toString('utf8');
  } catch (error) {
    if (owned.child.connected) owned.child.disconnect();
    await terminateProcessTree(owned.child).catch(() => {});
    owned.child.stdout.destroy();
    owned.child.stderr.destroy();
    owned.child.unref();
    throw error;
  }
}
