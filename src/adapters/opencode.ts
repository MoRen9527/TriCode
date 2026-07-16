// ── TriCode OpenCode Adapter (Tier 1) ──
// Glue layer for the opencode CLI tool.
// CTO-008-P P.2: MVP stub — defines the interface contract; full implementation in Wave 2.

import type { CodeTaskRequest, CodeTaskResult, CodeToolAdapter, ToolAvailability } from '../types.js';
import type { CodeTool } from '../types.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Binary name or path for opencode. Configurable via env. */
const OPENCODE_BIN = process.env.TRICODE_OPENCODE_BIN ?? 'opencode';

export class OpenCodeAdapter implements CodeToolAdapter {
  readonly name: CodeTool = 'opencode';

  async checkAvailability(): Promise<ToolAvailability> {
    try {
      await execFileAsync(OPENCODE_BIN, ['--version'], { timeout: 5000 });
      return 'available';
    } catch {
      return 'unavailable';
    }
  }

  async execute(req: CodeTaskRequest): Promise<CodeTaskResult> {
    const start = Date.now();

    try {
      const args = req.cwd ? ['--cwd', req.cwd, req.task] : [req.task];
      const { stdout, stderr } = await execFileAsync(OPENCODE_BIN, args, {
        timeout: 300_000, // 5 min default
        env: { ...process.env, ...req.env },
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });

      return {
        tool: 'opencode',
        success: true,
        output: stdout || stderr || '(no output)',
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const execError = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
      return {
        tool: 'opencode',
        success: false,
        output: execError.stdout ?? execError.stderr ?? '',
        error: execError.message,
        exitCode: execError.code ? parseInt(execError.code, 10) : undefined,
        durationMs: Date.now() - start,
      };
    }
  }
}
