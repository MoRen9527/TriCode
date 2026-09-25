// ── trimodel-cli core · L-E 命令编排层（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 三命令契约（joint-plan 问3）：restore-direct（零参数=安全侧默认 bigmodel）／
// config list|get|set（set 与页面同一套五门内核）／status（零参只读，必须答得出
// 「我现在用什么配置」；probes=回调型实时探活，CTO 裁①）。
// 零钥值过 argv 纪律：一切钥经独立钥文件（--key-file 或 per-provider 缺省），CLI 参数只有路径。

import { existsSync, readFileSync } from 'node:fs';
import { runWrite, rollbackTo, listBackups, readSettings, describeCurrent, tripletError } from './io-kernel.js';
import { MODEL_TIER_KEYS } from './pure.js';
import { loadPresets, findPreset, readDeployKey } from './presets.js';
import type { CoreIO } from './env.js';
import type { ResultLine } from './result.js';

export interface RestoreDirectArgs {
  provider?: string;
  keyFile?: string;
  /** 预览形态（--dry-run）：零写返回 diff（沙箱演练/干跑纪律同源）。 */
  dryRun?: boolean;
}

/** preset 查找+deployed 同拒（restore-direct 与 config set 共用；CTO 裁④ 防线一致性）。 */
function presetOrReject(provider: string, io: CoreIO):
  | { preset: { id: string; label: string; base_url: string; model: string; key_placeholder: string; deployed: boolean } }
  | { reject: ResultLine } {
  const found = findPreset(io.presetsDir, provider);
  if ('unknown' in found) {
    const errs = found.errors.length > 0 ? `（装载问题：${found.errors.join('；')}）` : '';
    return {
      reject: {
        ok: false,
        code: 'PRESET_UNKNOWN',
        message: `未知模板（${provider}）${errs}。可用模板：${found.available.join('、') || '（无）'}`,
        data: { provider, available: found.available },
      },
    };
  }
  if (!found.preset.deployed) {
    const { presets } = loadPresets(io.presetsDir);
    const usable = presets.filter((p) => p.deployed).map((p) => p.id);
    return {
      reject: {
        ok: false,
        code: 'PRESET_NOT_DEPLOYED',
        message: `该模板未部署（${provider}）。可用模板：${usable.join('、') || '（无）'}`,
        data: { provider, available: usable },
      },
    };
  }
  return { preset: found.preset };
}

/** 独立钥读取+fail-closed 投影（两写命令共用）。 */
function keyOrReject(provider: string, keyFile: string | undefined, io: CoreIO):
  | { key: string; path: string }
  | { reject: ResultLine } {
  const keyRes = readDeployKey(provider, keyFile ?? io.deployKeyPathFor(provider).path);
  if ('failClosed' in keyRes) {
    return { reject: { ok: false, code: keyRes.code, message: keyRes.message, data: { provider } } };
  }
  return { key: keyRes.key, path: keyRes.path };
}

/** restore-direct：读模板＋独立钥→健康门→runWrite 五门→结构化结果行。 */
export function restoreDirect(args: RestoreDirectArgs, io: CoreIO): ResultLine {
  const provider = args.provider?.trim() || io.defaultProvider || 'bigmodel';
  const p = presetOrReject(provider, io);
  if ('reject' in p) return p.reject;
  const k = keyOrReject(provider, args.keyFile, io);
  if ('reject' in k) return k.reject;
  const outcome = runWrite(
    { baseUrl: p.preset.base_url, apiKey: k.key, model: p.preset.model, dryRun: args.dryRun },
    io,
  );
  return { ok: outcome.ok, code: outcome.code, message: outcome.message, data: { ...outcome.data, provider } };
}

export interface ConfigSetArgs {
  provider?: string;
  base_url?: string;
  model?: string;
  keyFile?: string;
  dryRun?: boolean;
}

/** config set：与页面同一套五门内核（问3 判据）。形态=provider 模板定三组值（可单键覆盖
 * base_url/model），钥恒走独立钥文件——零钥值过 argv。 */
export function configSet(args: ConfigSetArgs, io: CoreIO): ResultLine {
  const provider = args.provider?.trim() || io.defaultProvider || 'bigmodel';
  const p = presetOrReject(provider, io);
  if ('reject' in p) return p.reject;
  const k = keyOrReject(provider, args.keyFile, io);
  if ('reject' in k) return k.reject;
  const triplet = tripletError({
    base_url: args.base_url ?? p.preset.base_url,
    api_key: k.key,
    model: args.model ?? p.preset.model,
  });
  if (!('baseUrl' in triplet)) return triplet;
  const outcome = runWrite(
    { baseUrl: triplet.baseUrl, apiKey: triplet.apiKey, model: triplet.model, dryRun: args.dryRun },
    io,
  );
  return { ok: outcome.ok, code: outcome.code, message: outcome.message, data: { ...outcome.data, provider } };
}

/** config list：模板表+现役键形摘要（len-only 显示策略在此）。 */
export function configList(_args: Record<string, never>, io: CoreIO): ResultLine {
  const { presets, errors } = loadPresets(io.presetsDir);
  const current = describeCurrent(io);
  return {
    ok: true,
    code: 'OK',
    message: `模板 ${presets.length} 件（deployed ${presets.filter((p) => p.deployed).length}）；当前配置${current.present ? `=${current.baseUrl} · ${current.model}` : '未落位'}`,
    data: {
      presets: presets.map((p) => ({ id: p.id, label: p.label, deployed: p.deployed, base_url: p.base_url, model: p.model })),
      current: { present: current.present, base_url: current.baseUrl, model: current.model, api_key: current.keyMasked },
      load_errors: errors,
    },
  };
}

/** config get：现役 env 键形投影（密钥 len-only；答「我现在用什么配置」）。 */
export function configGet(args: { keys?: string[] }, io: CoreIO): ResultLine {
  const read = readSettings(io.settingsPath);
  if ('error' in read) {
    return { ok: false, code: 'SETTINGS_UNREADABLE', message: read.error, data: {} };
  }
  const env = read.doc.env ?? {};
  const wanted = args.keys && args.keys.length > 0 ? args.keys : Object.keys(env).filter((k) => k.startsWith('ANTHROPIC_'));
  const projection: Record<string, unknown> = {};
  for (const k of wanted) {
    const v = env[k];
    if (typeof v !== 'string') { projection[k] = v ?? null; continue; }
    const isCred = /TOKEN|KEY|SECRET/.test(k);
    projection[k] = isCred ? `len=${[...v].length}` : v;
  }
  return {
    ok: true,
    code: 'OK',
    message: `现役配置：${typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : '（地址未设）'} · ${typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : '（模型未设）'}`,
    data: { env: projection, model_tier_keys: MODEL_TIER_KEYS.length },
  };
}

export interface StatusArgs {
  /** 最近备份清单截断数（缺省 3）。 */
  backups?: number;
}

/** status：零参只读——现役配置+实时探活（回调注入）+L2 标记态+备份清单+模板计数。
 * 判据：必须答得出「我现在用什么配置」。探针不可达=如实报（PROBE_DEGRADED 只做状态内容，
 * 不翻转命令成功性——status 本职=答状态）。 */
export async function statusCommand(args: StatusArgs, io: CoreIO): Promise<ResultLine> {
  const current = describeCurrent(io);
  const sections: Record<string, unknown> = {};

  // 配置现势
  sections.current = {
    present: current.present,
    base_url: current.baseUrl,
    model: current.model,
    api_key: current.keyMasked,
    unreadable: current.error,
  };

  // 实时探活（回调型；core 零端点知识——bin 按域注入）
  const probeResults: Array<Record<string, unknown>> = [];
  let degraded = false;
  if (io.probes && io.probes.length > 0) {
    for (const p of io.probes) {
      try {
        const started = Date.now();
        const r = await p.probe();
        probeResults.push({ name: p.name, up: r.up, detail: r.detail, latency_ms: r.latencyMs ?? (Date.now() - started) });
        if (!r.up) degraded = true;
      } catch (err) {
        probeResults.push({ name: p.name, up: false, detail: `探针异常：${err instanceof Error ? err.message : String(err)}` });
        degraded = true;
      }
    }
  }
  sections.probes = probeResults;

  // L2 标记态（恢复梯现势：标记在=曾降级未清）
  if (io.l2FlagPath) {
    try {
      sections.l2_flag = existsSync(io.l2FlagPath)
        ? { present: true, content: readFileSync(io.l2FlagPath, 'utf-8').trim() }
        : { present: false };
    } catch {
      sections.l2_flag = { present: false };
    }
  }

  // 备份清单（摘要：sentinel/keep/最近 N 件）
  const bl = listBackups(io.settingsPath);
  sections.backups = {
    count: bl.backups.length,
    keep: bl.keep,
    sentinel: bl.sentinel,
    recent: bl.backups.slice(0, args.backups ?? 3),
  };

  // 模板计数
  const { presets, errors } = loadPresets(io.presetsDir);
  sections.presets = { count: presets.length, deployed: presets.filter((p) => p.deployed).map((p) => p.id), load_errors: errors };

  const configLine = current.present
    ? `我现在用什么配置：${current.baseUrl} · ${current.model}（密钥 ${current.keyMasked ?? '未设'}）`
    : '配置未落位或不可读——本机尚未写入直连配置';
  return {
    ok: true,
    code: degraded ? 'PROBE_DEGRADED' : 'OK',
    message: degraded ? `${configLine}；部分探活不可达（如实报，不影响本地运行）` : configLine,
    data: sections,
  };
}

/** 一键回滚（命令面形态；HTTP 壳 rollback 共用内核）。 */
export function rollback(args: { backup: string }, io: CoreIO): ResultLine {
  const outcome = rollbackTo({ backupFile: args.backup, who: io.who }, io);
  return { ok: outcome.ok, code: outcome.code, message: outcome.message, data: outcome.data };
}
