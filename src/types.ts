// ── TriCode Public Types ──
// CTO-008-P P.2: shared types for code task execution across tool adapters.

/** Supported code execution tools, in tier order. */
export type CodeTool = 'opencode' | 'claude' | 'codex' | 'zcode' | 'copilot' | 'auto';

/** Execution mode for a code task. */
export type CodeExecutionMode = 'execute' | 'plan';

/** Structured request for code task execution. */
export interface CodeTaskRequest {
  /** Natural-language task description. */
  task: string;
  /** Specific tool to use, or 'auto' for tier-based routing. */
  tool?: CodeTool;
  /** Working directory for the task. */
  cwd?: string;
  /** Execution or planning-only mode. */
  mode?: CodeExecutionMode;
  /** Optional environment variables to pass to the tool process. */
  env?: Record<string, string>;
}

/** Structured result from a code task execution. */
export interface CodeTaskResult {
  /** The tool that was actually used. */
  tool: string;
  /** Whether the task succeeded. */
  success: boolean;
  /** Tool output (stdout / structured response). */
  output: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Error message if success is false. */
  error?: string;
  /** Exit code of the tool process, if applicable. */
  exitCode?: number;
}

/** Availability status for a tool. */
export type ToolAvailability = 'available' | 'unavailable' | 'unknown';

/** Adapter interface — each tool must implement this. */
export interface CodeToolAdapter {
  readonly name: CodeTool;
  /** Check if the tool binary/cli is available on this machine. */
  checkAvailability(): Promise<ToolAvailability>;
  /** Execute a code task. */
  execute(req: CodeTaskRequest): Promise<CodeTaskResult>;
}
