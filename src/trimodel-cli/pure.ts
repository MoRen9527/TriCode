// ── trimodel-cli core · L-A 纯函数层（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 剥移自 TriModel src/api/claude-fallback.ts（commit 3db73829）；零 IO 零 env——同函数逐行等价，
// 五防线硬条款不删不减（派工单验收门①）。来源注释保留修-族对应关系（继承验收基线=f887b27）。

/** 模型档位 9 键全族（现役 settings.json 同款键；全族同值保证各档位一致直连）。 */
export const MODEL_TIER_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
] as const;

/** 门① 备份轮换保留份数（近 5 份；照 restore-claude-config.ps1 修-3 同族）。 */
export const BACKUP_KEEP = 5;

/** 密钥掩码（尾 4 位；剥移自 TriModel secure-keys.ts maskKey——core 零仓依赖随迁）。 */
export function maskKey(apiKey: string): string {
  if (apiKey.length <= 4) return '****';
  return `****${apiKey.slice(-4)}`;
}

export interface SettingsDoc {
  env?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 门③：凭据健康门（fail-closed）——PLACEHOLDER/空串/纯空白/短键 四态全拒（照 ps1 修-1 同族）。
 * 返回 null=通过；字符串=人话拒因。 */
export function credentialGate(apiKey: string): string | null {
  if (apiKey.trim() === '') return 'API 密钥为空或纯空白，已拒绝写入';
  if (/PLACEHOLDER/.test(apiKey)) return '检测到占位符（PLACEHOLDER 残留），请输入真实密钥';
  if (apiKey.length < 16) return 'API 密钥长度不足（至少 16 位），请核对后重填';
  return null;
}

/** 三输入（restore/preview/config set 共用形态）。 */
export interface RestoreInput {
  base_url?: unknown;
  api_key?: unknown;
  model?: unknown;
}

/** 三值规范化（trim；未知字段忽略——HTTP 壳自做 JSON.parse 后调本函数）。 */
export function normalizeInput(raw: RestoreInput | undefined): RestoreInput {
  return raw ?? {};
}

/** 三值规范化+门③健康门+地址/模型格式校验（restore/preview/inject 共用）。
 * 返回 error 字符串=人话拒因（fail-closed 零半写）。 */
export function validateTriplet(
  input: RestoreInput,
): { baseUrl: string; apiKey: string; model: string } | { error: string } {
  const baseUrl = typeof input.base_url === 'string' ? input.base_url.trim() : '';
  const apiKey = typeof input.api_key === 'string' ? input.api_key.trim() : '';
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  if (!baseUrl) return { error: '请填写服务地址' };
  if (!/^https?:\/\/.+/i.test(baseUrl)) return { error: '服务地址需以 http:// 或 https:// 开头' };
  const gate = credentialGate(apiKey);
  if (gate) return { error: gate };
  if (!model) return { error: '请填写模型名称' };
  return { baseUrl, apiKey, model };
}

/** 门④ 预览 diff：env 子集逐键 before/after（凭据 len-only，掩码红线）。 */
export function envSubsetDiff(
  prevEnv: Record<string, unknown>,
  baseUrl: string,
  apiKey: string,
  model: string,
  hasApiKeyCarrier: boolean,
): Array<Record<string, unknown>> {
  const target: Record<string, string> = {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ...(hasApiKeyCarrier ? { ANTHROPIC_API_KEY: apiKey } : {}),
    ...Object.fromEntries(MODEL_TIER_KEYS.map((k) => [k, model])),
  };
  const credential = new Set(['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']);
  return Object.entries(target).map(([key, after]) => {
    const before = prevEnv[key];
    const changed = before !== after;
    const isCred = credential.has(key);
    // len 取 code-point 数（Array.from，与 [...str] 等价；lint no-misused-spread 合规形）
    return {
      key,
      changed,
      before: isCred ? (typeof before === 'string' && before ? `len=${String(Array.from(before).length)}` : null) : (before ?? null),
      after: isCred ? `len=${String(Array.from(after).length)}` : after,
    };
  });
}

/** 读面掩码（GET/config get/status）：AUTH_TOKEN 优先、API_KEY 载体次之；无值返 null。 */
export function tokenMaskedFrom(doc: SettingsDoc): string | null {
  const env = doc.env ?? {};
  const token = typeof env.ANTHROPIC_AUTH_TOKEN === 'string' ? env.ANTHROPIC_AUTH_TOKEN
    : typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
  return token ? maskKey(token) : null;
}
