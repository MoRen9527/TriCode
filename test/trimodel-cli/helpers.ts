// ── trimodel-cli core 测试共享件（临时域注入 CoreIO；TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCoreIO, type CoreIO } from '../../src/trimodel-cli/env.js';

export function makeTmpRoot(label: string): string {
  return mkdtempSync(join(tmpdir(), `trimodel-cli-${label}-`));
}

/** 临时域 CoreIO：settings/presets/deploy-key/audit 全落 tmpdir，真活体零接触（禁区纪律同源）。 */
export function makeTestIO(root: string, overrides: Partial<CoreIO> = {}): CoreIO {
  const presetsDir = join(root, 'presets');
  mkdirSync(presetsDir, { recursive: true });
  return makeCoreIO({
    settingsPath: join(root, 'settings.json'),
    presetsDir,
    deployKeyPathFor: (p: string) => ({ path: join(root, `.deploy-key.${p}`), source: 'per-provider' }),
    auditLogPath: join(root, 'audit.log'),
    who: 'test-cmd',
    ...overrides,
  });
}

export const GOOD_KEY = 'sk-test-0123456789abcdef0123456789abcdef';
export const GOOD_URL = 'https://open.bigmodel.cn/api/anthropic';
export const GOOD_MODEL = 'glm-5.3-flash';

/** 落一个标准 preset 文件（deployed 可覆写；extra 合并进顶层字段）。 */
export function writePreset(dir: string, id: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(
      {
        id,
        label: `${id} 模板`,
        base_url: 'https://example.com/api',
        model: 'test-model',
        key_placeholder: 'API Key',
        deployed: true,
        ...extra,
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
}

/** 落 per-provider 独立钥文件（makeTestIO 的 deployKeyPathFor 序）。 */
export function writeKey(root: string, provider: string, key: string): void {
  writeFileSync(join(root, `.deploy-key.${provider}`), key, 'utf-8');
}
