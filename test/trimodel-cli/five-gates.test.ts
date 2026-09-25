// ── trimodel-cli core · 五门写入内核单测（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 覆盖：门① 幂等短路/备份先行/轮换 keep-5/哨兵豁免；门② 键名锁定（9 键全族同值）；
// 门③ 健康门由 presets/commands 套件承载；F-1 双载体；原子落盘+尾换行；其余字段逐字节保留；
// 坏 JSON 现役拒写；rollbackTo 全防线（文件名/穿越/缺失/坏备份/回滚前备份/回滚后断言）。
// 已知覆盖缺口（与波① TriModel 测套同款，如实记录）：门④ verify-fail→自动回滚分支
// 无注入面未单测（readFileSync 直读不可替换），以代码路径评审+HTTP 面同内核回归护航。

import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_KEEP, MODEL_TIER_KEYS, listBackups, readSettings, rollbackTo, rotateBackups, runWrite,
} from '../../src/trimodel-cli/index.js';
import { GOOD_KEY, GOOD_MODEL, GOOD_URL, makeTestIO, makeTmpRoot } from './helpers.js';

function root(): string {
  return makeTmpRoot('five-gates');
}

function seedSettings(p: string, env: Record<string, unknown> = {}, rest: Record<string, unknown> = {}, trailing = ''): void {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify({ env, ...rest }, null, 2) + trailing, 'utf-8');
}

test('新文件写入：RESTORED + file_created + 全键落位 + 文案注明已新建', () => {
  const r = root();
  const io = makeTestIO(r);
  const out = runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  assert.equal(out.ok, true);
  assert.equal(out.code, 'RESTORED');
  assert.match(out.message, /已新建设置文件/);
  const doc = JSON.parse(readFileSync(io.settingsPath, 'utf-8'));
  assert.equal(doc.env.ANTHROPIC_BASE_URL, GOOD_URL);
  assert.equal(doc.env.ANTHROPIC_AUTH_TOKEN, GOOD_KEY);
  for (const k of MODEL_TIER_KEYS) assert.equal(doc.env[k], GOOD_MODEL);
  const data = out.data as Record<string, any>;
  assert.equal(data.restored.file_created, true);
});

test('已有文件写入：备份先行（回滚锚在位）+ 审计行落位', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath, { ANTHROPIC_BASE_URL: 'https://old.example.com' });
  const out = runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  assert.equal(out.code, 'RESTORED');
  const bl = listBackups(io.settingsPath);
  assert.equal(bl.backups.length, 1);
  assert.match(bl.backups[0].file, /^settings\.json\.bak-/);
  const audit = readFileSync(io.auditLogPath, 'utf-8');
  assert.match(audit, /who=test-cmd/);
  assert.match(audit, /result=ok/);
  assert.doesNotMatch(audit, new RegExp(GOOD_KEY)); // 钥值不进审计（门⑤ 红线）
});

test('幂等短路：同值重写 → ALREADY_SAME + 零新增备份', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath);
  runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  const before = listBackups(io.settingsPath).backups.length;
  const second = runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  assert.equal(second.code, 'ALREADY_SAME');
  assert.equal(second.ok, true);
  assert.equal(listBackups(io.settingsPath).backups.length, before);
  assert.match(readFileSync(io.auditLogPath, 'utf-8'), /idempotent-short-circuit/);
});

test('dryRun 预览：零写返回 diff + 文件字节不变 + 零备份', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath, { ANTHROPIC_BASE_URL: 'https://old.example.com' });
  const before = readFileSync(io.settingsPath, 'utf-8');
  const out = runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL, dryRun: true }, io);
  assert.equal(out.ok, true);
  assert.equal((out.data as Record<string, any>).dry_run, true);
  assert.equal(readFileSync(io.settingsPath, 'utf-8'), before);
  assert.equal(listBackups(io.settingsPath).backups.length, 0);
});

test('F-1 双载体：既有 API_KEY → 同写同值 + 幂等含载体一致性', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath, { ANTHROPIC_API_KEY: 'sk-old-key-0123456789abcdef' });
  const out = runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  assert.equal(out.code, 'RESTORED');
  const doc = JSON.parse(readFileSync(io.settingsPath, 'utf-8'));
  assert.equal(doc.env.ANTHROPIC_API_KEY, GOOD_KEY);
  assert.deepEqual(
    (out.data as Record<string, any>).restored.keys_written.sort(),
    ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', ...[...MODEL_TIER_KEYS].sort()].sort(),
  );
  const second = runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  assert.equal(second.code, 'ALREADY_SAME'); // 载体不一致时不得短路
});

test('门② 键名锁定+其余字段逐字节保留+尾换行随原文件', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(
    io.settingsPath,
    { UNRELATED: 'keep-me', ANTHROPIC_BASE_URL: 'https://old.example.com' },
    { permissions: { allow: ['Bash(ls)'] }, model: 'sonnet' },
    '\n',
  );
  runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  const raw = readFileSync(io.settingsPath, 'utf-8');
  const doc = JSON.parse(raw);
  assert.equal(doc.env.UNRELATED, 'keep-me');
  assert.deepEqual(doc.permissions, { allow: ['Bash(ls)'] });
  assert.equal(doc.model, 'sonnet');
  assert.ok(raw.endsWith('\n'));
});

test('坏 JSON 现役：SETTINGS_UNREADABLE 拒写 + 文件零触碰', () => {
  const r = root();
  const io = makeTestIO(r);
  writeFileSync(io.settingsPath, '{not-json', 'utf-8');
  const out = runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'SETTINGS_UNREADABLE');
  assert.equal(readFileSync(io.settingsPath, 'utf-8'), '{not-json');
  assert.match(readFileSync(io.auditLogPath, 'utf-8'), /pre-parse-failed/);
});

test('备份轮换 keep-5：连写多轮后备份清单收敛到 BACKUP_KEEP', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath);
  for (let i = 0; i < 7; i++) {
    runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: `model-v${i}` }, io);
  }
  const bl = listBackups(io.settingsPath);
  assert.equal(bl.backups.length, BACKUP_KEEP);
  assert.equal(bl.keep, BACKUP_KEEP);
  assert.equal(bl.sentinel, false);
});

test('FROZEN-BACKUPS 哨兵：轮换豁免（哨兵在位→写入不轮换，回滚锚全保留）', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath);
  writeFileSync(join(r, 'FROZEN-BACKUPS'), '', 'utf-8'); // 哨兵先于写入在位
  for (let i = 0; i < 7; i++) {
    runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: `model-v${i}` }, io);
  }
  assert.equal(listBackups(io.settingsPath).backups.length, 7); // 轮换被豁免，7 份全留
  const rot = rotateBackups(io.settingsPath);
  assert.equal(rot.rotated, false);
  assert.equal(rot.removed, 0);
  // 哨兵撤除后恢复轮换：收敛到 keep-5
  unlinkSync(join(r, 'FROZEN-BACKUPS'));
  const rot2 = rotateBackups(io.settingsPath);
  assert.equal(rot2.removed, 2);
  assert.equal(listBackups(io.settingsPath).backups.length, BACKUP_KEEP);
});

test('rollbackTo 正常路径：回滚前先备份当前态 + 内容还原', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath, { ANTHROPIC_BASE_URL: 'https://old.example.com' });
  runWrite({ baseUrl: GOOD_URL, apiKey: GOOD_KEY, model: GOOD_MODEL }, io);
  const bak = listBackups(io.settingsPath).backups[0].file;
  const out = rollbackTo({ backupFile: bak, who: 'test-cmd' }, io);
  assert.equal(out.ok, true);
  assert.equal(out.code, 'ROLLED_BACK');
  const doc = JSON.parse(readFileSync(io.settingsPath, 'utf-8'));
  assert.equal(doc.env.ANTHROPIC_BASE_URL, 'https://old.example.com');
  assert.match(String((out.data as Record<string, any>).pre_rollback_backup ?? ''), /settings\.json\.bak-/);
});

test('rollbackTo 防线：坏文件名/路径穿越/不存在/坏备份 全拒', () => {
  const r = root();
  const io = makeTestIO(r);
  seedSettings(io.settingsPath);
  const bad = [
    { backupFile: '../evil.bak-1', why: '穿越' },
    { backupFile: 'settings.json.bak-../../etc', why: '穿越2' },
    { backupFile: 'no-such-backup', why: '不存在' },
  ];
  for (const c of bad) {
    const out = rollbackTo({ backupFile: c.backupFile, who: 'test-cmd' }, io);
    assert.equal(out.ok, false, c.why);
    assert.equal(out.code, 'INVALID_INPUT', c.why);
  }
  // 坏备份（文件名合法但内容非 JSON）
  const corrupt = 'settings.json.bak-garbage';
  writeFileSync(join(r, corrupt), '{broken', 'utf-8');
  const out = rollbackTo({ backupFile: corrupt, who: 'test-cmd' }, io);
  assert.equal(out.ok, false);
  assert.match(out.message, /不是有效的 JSON/);
  // 现役文件未被坏备份污染
  assert.ok(existsSync(io.settingsPath));
  assert.equal((readSettings(io.settingsPath) as any).doc !== undefined, true);
});
