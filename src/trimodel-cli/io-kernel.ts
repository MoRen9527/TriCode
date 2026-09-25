// ── trimodel-cli core · L-B IO 内核层（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 剥移自 TriModel src/api/claude-fallback.ts（commit 3db73829）writeEnvSubset/handleGetBackups/
// handlePostRollback 的内核段；五门（幂等短路/备份轮换+哨兵/键名锁+写后断言自动回滚/掩码审计）
// 逐行等价不删不减——派工单验收门①防线继承硬门 + ⑥ runWrite WritePlan 一步到位（CTO 裁②：
// 不做过渡壳；双基线护航=276 测套 HTTP 零变 + f887b27 STE 25/25 脚本侧对照）。

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import {
  BACKUP_KEEP, MODEL_TIER_KEYS, envSubsetDiff, tokenMaskedFrom, validateTriplet,
  type RestoreInput, type SettingsDoc,
} from './pure.js';
import { appendAudit, type CoreIO } from './env.js';
import type { ResultCode } from './result.js';

// ── 读面 ──

/** 读 settings（剥移自 claude-fallback.ts readSettings :112-131 逐行等价）：
 * 文件缺失=空 doc（新建路径，file_created 语义）；读失败/坏 JSON/顶层非对象=error（写面拒）。 */
export function readSettings(path: string): { raw: string; doc: SettingsDoc } | { error: string } {
  if (!existsSync(path)) return { raw: '', doc: {} };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    return { error: `无法读取设置文件：${err instanceof Error ? err.message : String(err)}` };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    // 坏 JSON=拒绝写入不覆盖（人话报错附路径）——写坏配置文件比不写更糟
    return { error: `设置文件内容不是有效的 JSON，已拒绝写入以免覆盖（文件：${path}）。请先手工修复该文件。` };
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return { error: `设置文件顶层不是对象，已拒绝写入（文件：${path}）。` };
  }
  return { raw, doc: doc as SettingsDoc };
}

// ── 门① 备份轮换 ──

/** 备份轮换：保留近 BACKUP_KEEP 份（mtime 降序），FROZEN-BACKUPS 哨兵豁免（防回滚锚被轮换自毁）。 */
export function rotateBackups(path: string): { rotated: boolean; removed: number } {
  const sentinel = join(dirname(path), 'FROZEN-BACKUPS');
  if (existsSync(sentinel)) return { rotated: false, removed: 0 };
  const dir = dirname(path);
  let baks: Array<{ p: string; m: number }> = [];
  try {
    baks = readdirSync(dir)
      .map((f) => join(dir, f))
      .filter((p) => p.startsWith(`${path}.bak-`))
      .map((p) => ({ p, m: statSync(p).mtimeMs }))
      .sort((a, b) => b.m - a.m);
  } catch { return { rotated: false, removed: 0 }; }
  let removed = 0;
  for (const old of baks.slice(BACKUP_KEEP)) {
    try { unlinkSync(old.p); removed += 1; } catch { /* 单个删除失败不阻塞 */ }
  }
  return { rotated: true, removed };
}

/** 门④ 写后回读断言——重读 parse+逐键比对（非空+与提交一致+JSON 合法）。 */
export function verifyWritten(
  path: string,
  expected: { baseUrl: string; apiKey: string; model: string; hasApiKeyCarrier: boolean },
): { ok: true } | { ok: false; why: string } {
  let raw: string;
  try { raw = readFileSync(path, 'utf-8'); } catch (err) {
    return { ok: false, why: `写后回读失败（无法读取）：${err instanceof Error ? err.message : String(err)}` };
  }
  let doc: unknown;
  try { doc = JSON.parse(raw); } catch {
    return { ok: false, why: '写后回读失败（JSON 不合法）' };
  }
  const env = (doc as SettingsDoc).env ?? {};
  const checks: Array<[string, unknown, unknown]> = [
    ['ANTHROPIC_BASE_URL', env.ANTHROPIC_BASE_URL, expected.baseUrl],
    ['ANTHROPIC_AUTH_TOKEN', env.ANTHROPIC_AUTH_TOKEN, expected.apiKey],
    ...(expected.hasApiKeyCarrier ? [['ANTHROPIC_API_KEY', env.ANTHROPIC_API_KEY, expected.apiKey] as [string, unknown, unknown]] : []),
    ...MODEL_TIER_KEYS.map((k) => [k, env[k], expected.model] as [string, unknown, unknown]),
  ];
  for (const [key, actual, want] of checks) {
    if (typeof actual === 'string' && actual.trim() === '') return { ok: false, why: `写后回读断言失败：${key} 为空` };
    if (actual !== want) return { ok: false, why: `写后回读断言失败：${key} 与提交值不一致` };
  }
  return { ok: true };
}

// ── 五门写入心脏（runWrite：WritePlan 一步到位形态）──

export interface WritePlan {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** preview 形态：零写返回 diff（现役 opts.dryRun 等价）。 */
  dryRun?: boolean;
}

export interface WriteOutcome {
  ok: boolean;
  code: ResultCode;
  /** 人话 message（与现役 body.message/error 逐字等价——276 回归锚）。 */
  message: string;
  /** 结构化体（现役 body 字段全承载，密钥只 len-only/掩码形态）。 */
  data: Record<string, unknown>;
}

/**
 * 五门写入内核（restore/preview/config set/inject 共用一处落地）：
 * 门① 幂等短路+备份先行+轮换（写入成功才轮换，防回滚锚先丢）／门② 键名服务端锁定（写入键族=
 * 常量，客户端只传三值）／门③ 健康门（调用方先经 validateTriplet 达此）／门④ 写后断言+自动回滚／
 * 门⑤ 结构化审计行。F-1 双载体：既有 API_KEY 载体→同写同值（消灭残留）。
 */
export function runWrite(plan: WritePlan, io: CoreIO): WriteOutcome {
  const { baseUrl, apiKey, model } = plan;
  const who = io.who;
  const path = io.settingsPath;
  const read = readSettings(path);
  if ('error' in read) {
    appendAudit(io.auditLogPath, { who, mode: 'restore', backup: 'none', assert: 'n/a', result: 'error', detail: 'pre-parse-failed' });
    return { ok: false, code: 'SETTINGS_UNREADABLE', message: read.error, data: {} };
  }
  const fileExisted = existsSync(path);
  const doc = read.doc;
  const prevEnv: Record<string, unknown> = doc.env ?? {};
  const hasApiKeyCarrier = 'ANTHROPIC_API_KEY' in prevEnv;

  // 门① 幂等短路：三值已全等（地址+密钥+模型档位全族）+ 凭据键族一致（F-1）→ 明示不重写
  const alreadySame = prevEnv.ANTHROPIC_BASE_URL === baseUrl
    && prevEnv.ANTHROPIC_AUTH_TOKEN === apiKey
    && MODEL_TIER_KEYS.every((k) => prevEnv[k] === model)
    && (!hasApiKeyCarrier || prevEnv.ANTHROPIC_API_KEY === apiKey);
  const diff = envSubsetDiff(prevEnv, baseUrl, apiKey, model, hasApiKeyCarrier);
  if (alreadySame) {
    appendAudit(io.auditLogPath, { who, mode: 'restore', backup: 'none', assert: 'n/a', result: 'ok', detail: 'idempotent-short-circuit' });
    return {
      ok: true,
      code: 'ALREADY_SAME',
      message: '当前已是指定值（' + baseUrl + ' · ' + model + '），无需重写。重启会话后生效。',
      data: { restored: { base_url: baseUrl, model, already_same: true, file_created: false, backup: null }, diff },
    };
  }

  if (plan.dryRun) {
    return {
      ok: true,
      code: 'OK',
      message: '预览（零写入）：以上为将写入的 env 子集变更，凭据仅显示长度。',
      data: { dry_run: true, file_present: fileExisted, diff },
    };
  }

  // 门① 备份先行（存在才备份）——回滚锚
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  let backupPath: string | null = null;
  if (fileExisted) {
    backupPath = `${path}.bak-${ts}`;
    try {
      copyFileSync(path, backupPath);
    } catch (err) {
      appendAudit(io.auditLogPath, { who, mode: 'restore', backup: 'none', assert: 'n/a', result: 'error', detail: 'backup-failed' });
      return { ok: false, code: 'WRITE_FAILED', message: `备份设置文件失败，已中止写入：${err instanceof Error ? err.message : String(err)}`, data: {} };
    }
  }

  // 门② 键名服务端锁定：写入键族=服务端常量，客户端只传三值
  doc.env = {
    ...prevEnv,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: apiKey,
  };
  for (const k of MODEL_TIER_KEYS) doc.env[k] = model;
  // F-1：既有 API_KEY 载体存在 → 同写同值（消灭残留旧密钥；应急语义两载体都通）
  if (hasApiKeyCarrier) doc.env.ANTHROPIC_API_KEY = apiKey;

  // 原子落盘（序列化沿用现役格式：2 空格缩进；尾换行随原文件）
  const trailing = read.raw.endsWith('\n') ? '\n' : '';
  const out = JSON.stringify(doc, null, 2) + trailing;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, out, 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    appendAudit(io.auditLogPath, { who, mode: 'restore', backup: backupPath ?? 'none', assert: 'n/a', result: 'error', detail: 'write-failed' });
    return { ok: false, code: 'WRITE_FAILED', message: `写入设置文件失败：${err instanceof Error ? err.message : String(err)}`, data: {} };
  }

  // 门④ 写后回读断言；失败=自动回滚（本次备份拷回）+ fail-closed 报错
  const verdict = verifyWritten(path, { baseUrl, apiKey, model, hasApiKeyCarrier });
  if (!verdict.ok) {
    if (backupPath) {
      try { copyFileSync(backupPath, path); } catch { /* 回滚失败也要如实报 */ }
    }
    appendAudit(io.auditLogPath, { who, mode: 'restore', backup: backupPath ?? 'none', assert: 'fail', result: 'rolled-back', detail: `len-only keys=${diff.length}` });
    return {
      ok: false,
      code: 'WRITE_FAILED_ROLLED_BACK',
      message: `写后回读断言失败，已自动回滚（${verdict.why}）。配置文件已恢复为写入前状态，未生效任何变更。`,
      data: { rolled_back: true, backup: backupPath },
    };
  }

  // 门① 备份轮换（写入成功后才轮换，防回滚锚先丢）
  const rotation = rotateBackups(path);
  appendAudit(io.auditLogPath, { who, mode: 'restore', backup: backupPath ?? 'new-file', assert: 'pass', result: 'ok', detail: `keys=${diff.length} rotation_removed=${rotation.removed}` });
  return {
    ok: true,
    code: 'RESTORED',
    message: `${fileExisted ? '' : '已新建设置文件；'}兜底直连已写入（${baseUrl} · ${model}）。重启会话后生效。`,
    data: {
      restored: {
        base_url: baseUrl,
        model,
        keys_written: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', ...(hasApiKeyCarrier ? ['ANTHROPIC_API_KEY'] : []), ...MODEL_TIER_KEYS],
        file_created: !fileExisted,
        backup: backupPath,
        already_same: false,
      },
      diff,
    },
  };
}

// ── 备份清单 / 一键回滚内核（自 handleGetBackups/handlePostRollback 剥出，HTTP 壳与 status 共用）──

export interface BackupMeta {
  file: string;
  mtime: string;
  size: number;
}

/** 备份清单（零内容返回；sentinel=防回滚锚自毁哨兵在位；mtime 降序）。 */
export function listBackups(path: string): { backups: BackupMeta[]; sentinel: boolean; keep: number; settingsFile: string } {
  const dir = dirname(path);
  const list: BackupMeta[] = [];
  try {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (!full.startsWith(`${path}.bak-`)) continue;
      const st = statSync(full);
      list.push({ file: f, mtime: st.mtime.toISOString(), size: st.size });
    }
  } catch { /* 目录不可读=空清单 */ }
  list.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return {
    backups: list,
    sentinel: existsSync(join(dir, 'FROZEN-BACKUPS')),
    keep: BACKUP_KEEP,
    settingsFile: path,
  };
}

export interface RollbackPlan {
  /** 备份文件名（settings.json.bak-<时间戳> 清单内条目形态）。 */
  backupFile: string;
  /** 审计调用方标识（'ui-rollback' | '<bin>-cmd'）。 */
  who: string;
}

export function rollbackTo(plan: RollbackPlan, io: CoreIO): WriteOutcome {
  const { backupFile, who } = plan;
  const path = io.settingsPath;
  if (!/^settings\.json\.bak-[0-9A-Za-z:\-.]+$/.test(backupFile)) {
    return { ok: false, code: 'INVALID_INPUT', message: '备份文件名格式不正确（须为 settings.json.bak-<时间戳> 清单内条目）', data: {} };
  }
  const backupPath = resolve(dirname(path), backupFile);
  // 路径穿越防线：解析后必须仍位于 settings 同目录
  if (!backupPath.startsWith(resolve(dirname(path)) + sep)) {
    return { ok: false, code: 'INVALID_INPUT', message: '备份路径越界，已拒绝', data: {} };
  }
  if (!existsSync(backupPath)) {
    // not_found 判别位（HTTP 壳映射 404 用；core 保持零 HTTP 语义）
    return { ok: false, code: 'INVALID_INPUT', message: `备份不存在或已被轮换清理（${backupFile}）。可先查看备份清单另选条目。`, data: { not_found: true } };
  }
  // 门④ 同款：回滚前先读目标备份确认 JSON 合法（不把坏备份拷成现役）
  const probe = readSettings(backupPath);
  if ('error' in probe) {
    appendAudit(io.auditLogPath, { who, mode: 'rollback', backup: backupFile, assert: 'n/a', result: 'error', detail: 'backup-corrupt' });
    return { ok: false, code: 'INVALID_INPUT', message: `该备份内容不是有效的 JSON，已拒绝回滚：${probe.error}`, data: {} };
  }
  // 回滚也是写：先把当前态备份（回滚可逆），再拷入目标备份
  let preRollbackBackup: string | null = null;
  if (existsSync(path)) {
    preRollbackBackup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try { copyFileSync(path, preRollbackBackup); } catch (err) {
      appendAudit(io.auditLogPath, { who, mode: 'rollback', backup: backupFile, assert: 'n/a', result: 'error', detail: 'pre-backup-failed' });
      return { ok: false, code: 'WRITE_FAILED', message: `回滚前备份当前配置失败，已中止回滚：${err instanceof Error ? err.message : String(err)}`, data: {} };
    }
  }
  try { copyFileSync(backupPath, path); } catch (err) {
    appendAudit(io.auditLogPath, { who, mode: 'rollback', backup: backupFile, assert: 'n/a', result: 'error', detail: 'copy-failed' });
    return { ok: false, code: 'WRITE_FAILED', message: `回滚拷贝失败：${err instanceof Error ? err.message : String(err)}`, data: {} };
  }
  // 门④：回滚后回读断言（JSON 合法+可解析）
  const after = readSettings(path);
  if ('error' in after) {
    if (preRollbackBackup) { try { copyFileSync(preRollbackBackup, path); } catch { /* 如实报 */ } }
    appendAudit(io.auditLogPath, { who, mode: 'rollback', backup: backupFile, assert: 'fail', result: 'rolled-back-again', detail: 'post-verify-failed' });
    return { ok: false, code: 'WRITE_FAILED_ROLLED_BACK', message: '回滚后回读断言失败，已恢复回滚前状态。请检查该备份文件。', data: {} };
  }
  const rotation = rotateBackups(path);
  appendAudit(io.auditLogPath, { who, mode: 'rollback', backup: backupFile, assert: 'pass', result: 'ok', detail: `pre_rollback_backup=${preRollbackBackup ? 'created' : 'none'} rotation_removed=${rotation.removed}` });
  return {
    ok: true,
    code: 'ROLLED_BACK',
    message: '已回滚到所选备份。重启会话后生效。',
    data: { rolled_back_to: backupFile, pre_rollback_backup: preRollbackBackup },
  };
}

// ── 共用小件 ──

/** 三值校验直通（commands 层用：validateTriplet 结果 → WriteOutcome 形态的拒因）。 */
export function tripletError(input: RestoreInput): { baseUrl: string; apiKey: string; model: string } | WriteOutcome {
  const t = validateTriplet(input);
  if ('error' in t) {
    return { ok: false, code: 'INVALID_INPUT', message: t.error, data: {} };
  }
  return t;
}

/** 现役配置投影（config get/status 共用）：地址+模型明文、密钥掩码、其余 env 键形摘要。
 * present=「有配置值」（任一三值在位），非「文件可读」——文件缺失/空 env=未落位（读面不炸语义）。 */
export function describeCurrent(io: CoreIO): { present: boolean; baseUrl: string | null; model: string | null; keyMasked: string | null; error: string | null } {
  const read = readSettings(io.settingsPath);
  if ('error' in read) {
    return { present: false, baseUrl: null, model: null, keyMasked: null, error: read.error };
  }
  const env = read.doc.env ?? {};
  const baseUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : null;
  const model = typeof env.ANTHROPIC_MODEL === 'string' ? env.ANTHROPIC_MODEL : null;
  const keyMasked = tokenMaskedFrom(read.doc);
  return {
    present: baseUrl !== null || model !== null || keyMasked !== null,
    baseUrl,
    model,
    keyMasked,
    error: null,
  };
}
