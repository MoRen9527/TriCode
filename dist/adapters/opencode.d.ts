import type { CodeTaskRequest, CodeTaskResult, CodeToolAdapter, ToolAvailability } from '../types.js';
import type { CodeTool } from '../types.js';
export declare class OpenCodeAdapter implements CodeToolAdapter {
    readonly name: CodeTool;
    checkAvailability(): Promise<ToolAvailability>;
    execute(req: CodeTaskRequest): Promise<CodeTaskResult>;
}
//# sourceMappingURL=opencode.d.ts.map