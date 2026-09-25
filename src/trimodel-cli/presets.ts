// ── trimodel-cli core · L-D 模板层（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// presets 唯一真源装载器（CTO 裁③：TriCode core presets=唯一模板真源；HTTP 下拉与 CLI
// restore-direct 同源——TriModel 内置 TEMPLATES 常量随壳改造删除）。钥不进模板=装载器断言拒载。
// bigmodel 第一实现（presets/bigmodel.json）；deepseek 候批禁用位；占位符未替换=拒写（readDeployKey）。

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { credentialGate } from './pure.js';

export interface ProviderPreset {
  id: string;
  label: string;
  base_url: string;
  model: string;
  key_placeholder: string;
  deployed: boolean;
}

/** 钥不进模板：preset 文件出现任一钥形字段=拒载（fail-closed，防钥被写进随仓分发面）。 */
const FORBIDDEN_KEY_FIELDS = ['api_key', 'apiKey', 'auth_token', 'authToken', 'token', 'key', 'secret'];

export interface PresetsLoad {
  presets: ProviderPreset[];
  /** 拒载/坏文件清单（人话；非空时 presets 可能仍含可用件，调用方酌情降级）。 */
  errors: string[];
}

/** 装载 presets 目录全部 *.json；字段族校验+钥形字段拒载。目录不可读=全部失败。 */
export function loadPresets(dir: string): PresetsLoad {
  const errors: string[] = [];
  const presets: ProviderPreset[] = [];
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch (err) {
    return { presets: [], errors: [`presets 目录不可读（${dir}）：${err instanceof Error ? err.message : String(err)}`] };
  }
  for (const f of files) {
    const full = join(dir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(full, 'utf-8'));
    } catch (err) {
      errors.push(`${f}：不是有效的 JSON（${err instanceof Error ? err.message : String(err)}）`);
      continue;
    }
    if (typeof raw !== 'object' || raw === null) {
      errors.push(`${f}：内容不是对象`);
      continue;
    }
    const obj = raw as Record<string, unknown>;
    const leak = FORBIDDEN_KEY_FIELDS.filter((k) => k in obj);
    if (leak.length > 0) {
      errors.push(`${f}：含钥形字段（${leak.join('/')}）——钥不进模板，拒载（fail-closed）`);
      continue;
    }
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    const baseUrl = typeof obj.base_url === 'string' ? obj.base_url.trim() : '';
    const model = typeof obj.model === 'string' ? obj.model.trim() : '';
    if (!id || !baseUrl || !model) {
      errors.push(`${f}：缺必填字段（id/base_url/model）`);
      continue;
    }
    presets.push({
      id,
      label: typeof obj.label === 'string' ? obj.label : id,
      base_url: baseUrl,
      model,
      key_placeholder: typeof obj.key_placeholder === 'string' ? obj.key_placeholder : 'API Key',
      deployed: obj.deployed === true,
    });
  }
  return { presets, errors };
}

/** 已部署 preset 查找（找不到=人话拒因载体，PRESET_UNKNOWN 用）。 */
export function findPreset(dir: string, provider: string): { preset: ProviderPreset } | { unknown: true; available: string[]; errors: string[] } {
  const { presets, errors } = loadPresets(dir);
  const hit = presets.find((p) => p.id === provider);
  if (hit) return { preset: hit };
  return { unknown: true, available: presets.map((p) => p.id), errors };
}

export interface DeployKeyRead {
  key: string;
  path: string;
  source: 'env' | 'per-provider' | 'legacy';
}

export type DeployKeyReject = { failClosed: true; code: 'DEPLOY_KEY_MISSING' | 'DEPLOY_KEY_INVALID' | 'KEY_FAIL_CLOSED'; message: string };

/** 独立钥读取（fail-closed 四连：文件缺失/空/占位符/健康门；钥值不过 RESULT/日志——len-only）。 */
export function readDeployKey(provider: string, keyFile: string | undefined): DeployKeyRead | DeployKeyReject {
  const path = keyFile ?? defaultKeyPath(provider);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8').trim();
  } catch {
    return {
      failClosed: true,
      code: 'DEPLOY_KEY_MISSING',
      message: `独立钥文件未落位（${path}）。请先完成部署日供钥步骤，或改用手填密钥。`,
    };
  }
  if (!raw) {
    return {
      failClosed: true,
      code: 'DEPLOY_KEY_INVALID',
      message: '独立钥文件存在但内容为空，已拒绝写入（fail-closed）。请重新落位钥文件。',
    };
  }
  const gate = credentialGate(raw);
  if (gate) {
    return { failClosed: true, code: 'KEY_FAIL_CLOSED', message: `独立钥文件内容未通过健康门：${gate}` };
  }
  return { key: raw, path, source: 'per-provider' };
}

function defaultKeyPath(_provider: string): string {
  // 缺省路径由 CoreIO.deployKeyPathFor 注入（env.ts 序）；此兜底仅在上游漏注入时给出可读报错路径
  return `~/.claude/settings.presets/.deploy-key.${_provider}`;
}
