// ── trimodel-cli core · 命令编排+runCli 派发单测（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 覆盖：restoreDirect（模板+deployed 同拒+钥 fail-closed）、configSet（单键覆盖+零钥值过 argv）、
// configList/configGet（len-only 投影）、statusCommand（probes 回调桩+L2 标记态+PROBE_DEGRADED
// 不翻成功性）、runCli（三命令+--version+help+未知旗标拒收+退出码 0/1/2+model 头 token 容忍）。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_VERSION, configGet, configList, configSet, renderResult, restoreDirect, runCli, statusCommand,
  type CoreIO,
} from '../../src/trimodel-cli/index.js';
import { GOOD_KEY, GOOD_MODEL, GOOD_URL, makeTestIO, makeTmpRoot, writeKey, writePreset } from './helpers.js';

function readyIO(opts: { deployed?: boolean } = {}): { io: CoreIO; root: string } {
  const root = makeTmpRoot('commands');
  const io = makeTestIO(root);
  writePreset(io.presetsDir, 'bigmodel', { base_url: GOOD_URL, model: GOOD_MODEL });
  writePreset(io.presetsDir, 'deepseek', { deployed: opts.deployed === undefined ? false : opts.deployed });
  writeKey(root, 'bigmodel', GOOD_KEY);
  return { io, root };
}

// ── restoreDirect ──

test('restoreDirect 正常：RESTORED + 三组模板值落盘 + data.provider', () => {
  const { io } = readyIO();
  const out = restoreDirect({}, io);
  assert.equal(out.ok, true);
  assert.equal(out.code, 'RESTORED');
  assert.equal((out.data as Record<string, any>).provider, 'bigmodel');
  const doc = JSON.parse(readFileSync(io.settingsPath, 'utf-8'));
  assert.equal(doc.env.ANTHROPIC_BASE_URL, GOOD_URL);
  assert.equal(doc.env.ANTHROPIC_MODEL, GOOD_MODEL);
});

test('restoreDirect 零参数默认=bigmodel 常量（安全侧默认）', () => {
  const { io } = readyIO();
  const out = restoreDirect({}, io);
  assert.equal(out.ok, true);
  assert.equal((out.data as Record<string, any>).provider, 'bigmodel');
});

test('restoreDirect env 覆写一档：defaultProvider=deepseek 时零参走 deepseek', () => {
  const { io, root } = readyIO({ deployed: true });
  writeKey(root, 'deepseek', GOOD_KEY);
  const io2 = makeTestIO(join(root, 'alt'), {
    settingsPath: io.settingsPath,
    presetsDir: io.presetsDir,
    defaultProvider: 'deepseek',
    deployKeyPathFor: io.deployKeyPathFor,
  });
  const out = restoreDirect({}, io2);
  assert.equal(out.ok, true);
  assert.equal((out.data as Record<string, any>).provider, 'deepseek');
});

test('restoreDirect 未知 provider：PRESET_UNKNOWN fail-closed 列可用', () => {
  const { io } = readyIO();
  const out = restoreDirect({ provider: 'volcengine' }, io);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PRESET_UNKNOWN');
  assert.match(out.message, /可用模板/);
});

test('restoreDirect deployed:false 同拒：PRESET_NOT_DEPLOYED（防线一致性 裁④）', () => {
  const { io, root } = readyIO();
  writeKey(root, 'deepseek', GOOD_KEY); // 钥在位也不放行——模板未部署同拒
  const out = restoreDirect({ provider: 'deepseek' }, io);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'PRESET_NOT_DEPLOYED');
  assert.match(out.message, /未部署/);
});

test('restoreDirect 钥缺失：DEPLOY_KEY_MISSING（fail-closed 不猜）', () => {
  const { io, root } = readyIO();
  writeFileSync(join(root, '.deploy-key.bigmodel'), '', 'utf-8'); // 覆写为空
  const out = restoreDirect({}, io);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'DEPLOY_KEY_INVALID');
});

// ── configSet / configList / configGet ──

test('configSet：模板三组值+单键覆盖 base_url/model，钥恒走钥文件（零钥值过 argv）', () => {
  const { io } = readyIO();
  const out = configSet({ base_url: 'https://custom.example.com/api', model: 'glm-4.6' }, io);
  assert.equal(out.ok, true);
  assert.equal(out.code, 'RESTORED');
  const doc = JSON.parse(readFileSync(io.settingsPath, 'utf-8'));
  assert.equal(doc.env.ANTHROPIC_BASE_URL, 'https://custom.example.com/api');
  assert.equal(doc.env.ANTHROPIC_MODEL, 'glm-4.6');
  assert.equal(doc.env.ANTHROPIC_AUTH_TOKEN, GOOD_KEY);
  assert.equal(JSON.stringify(out).includes(GOOD_KEY), false); // 结果行不回显钥值
});

test('configSet 坏地址：INVALID_INPUT 人话拒（不落盘）', () => {
  const { io } = readyIO();
  const out = configSet({ base_url: 'ftp://bad.example.com' }, io);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'INVALID_INPUT');
  assert.equal(existsSync(io.settingsPath), false);
});

test('configList：模板表+现役摘要（写入后 current.present=true）', () => {
  const { io } = readyIO();
  const before = configList({}, io);
  assert.equal(before.ok, true);
  assert.equal((before.data as Record<string, any>).current.present, false);
  restoreDirect({}, io);
  const after = configList({}, io);
  assert.equal((after.data as Record<string, any>).current.present, true);
  assert.equal((after.data as Record<string, any>).presets.length, 2);
});

test('configGet：凭据 len-only 投影，全结果零钥值', () => {
  const { io } = readyIO();
  restoreDirect({}, io);
  const out = configGet({}, io);
  assert.equal(out.ok, true);
  const env = (out.data as Record<string, any>).env as Record<string, string>;
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, `len=${[...GOOD_KEY].length}`);
  assert.equal(env.ANTHROPIC_BASE_URL, GOOD_URL); // 非凭据键明文
  assert.equal(JSON.stringify(out).includes(GOOD_KEY), false);
});

// ── statusCommand ──

test('statusCommand：探活回调桩全通 → OK + 现役配置可答', async () => {
  const { io } = readyIO();
  restoreDirect({}, io);
  configSet({ model: 'glm-4.6' }, io); // 第二次写入（现役有前值）→ 产生备份
  const io2: CoreIO = { ...io, probes: [{ name: 'health', probe: async () => ({ up: true, latencyMs: 7 }) }] };
  const out = await statusCommand({}, io2);
  assert.equal(out.ok, true);
  assert.equal(out.code, 'OK');
  assert.match(out.message, /我现在用什么配置/);
  const data = out.data as Record<string, any>;
  assert.equal(data.probes[0].up, true);
  assert.equal(data.probes[0].latency_ms, 7);
  assert.equal(data.backups.count >= 1, true); // 首写无前值不产生备份；二次写入起有回滚锚
});

test('statusCommand：探针不可达 → PROBE_DEGRADED 如实报（ok 仍 true，status 本职=答状态）', async () => {
  const { io } = readyIO();
  const io2: CoreIO = {
    ...io,
    probes: [{ name: 'health', probe: async () => ({ up: false, detail: 'ECONNREFUSED' }) }],
  };
  const out = await statusCommand({}, io2);
  assert.equal(out.ok, true);
  assert.equal(out.code, 'PROBE_DEGRADED');
  assert.match(out.message, /如实报/);
});

test('statusCommand：探针抛异常 → 记探针异常+degraded（不炸命令）', async () => {
  const { io } = readyIO();
  const io2: CoreIO = {
    ...io,
    probes: [{ name: 'boom', probe: async () => { throw new Error('socket hang up'); } }],
  };
  const out = await statusCommand({}, io2);
  assert.equal(out.ok, true);
  assert.equal(out.code, 'PROBE_DEGRADED');
  const data = out.data as Record<string, any>;
  assert.match(String(data.probes[0].detail), /socket hang up/);
});

test('statusCommand：L2 标记态在位时如实报 present+content', async () => {
  const { io, root } = readyIO();
  const flagPath = join(root, 'trimodel-l2-flag');
  writeFileSync(flagPath, 'degraded-at-2026-09-26', 'utf-8');
  const io2: CoreIO = { ...io, l2FlagPath: flagPath };
  const out = await statusCommand({}, io2);
  const data = out.data as Record<string, any>;
  assert.equal(data.l2_flag.present, true);
  assert.equal(data.l2_flag.content, 'degraded-at-2026-09-26');
});

test('statusCommand：L2 标记注入但文件不在 → present:false（正常态两态之一）', async () => {
  const { io, root } = readyIO();
  const io2: CoreIO = { ...io, l2FlagPath: join(root, 'absent-flag') };
  const out = await statusCommand({}, io2);
  const data = out.data as Record<string, any>;
  assert.equal(data.l2_flag.present, false);
});

test('statusCommand：l2FlagPath 未注入 → 无 l2_flag 段（诚实未接线态）', async () => {
  const { io } = readyIO();
  const out = await statusCommand({}, io);
  const data = out.data as Record<string, any>;
  assert.equal('l2_flag' in data, false);
});

// ── runCli 派发器 ──

function capture(): { lines: string[]; write: (s: string) => void } {
  const lines: string[] = [];
  return { lines, write: (s: string) => lines.push(s) };
}

test('runCli：restore-direct 业务成功=0 + OK 行渲染', async () => {
  const { io } = readyIO();
  const { lines, write } = capture();
  const code = await runCli(['model', 'restore-direct'], io, write);
  assert.equal(code, 0);
  assert.match(lines[0], /^OK \[RESTORED\]/);
});

test('runCli：不带 model 头 token 亦容忍（core 级直调）', async () => {
  const { io } = readyIO();
  const { lines, write } = capture();
  const code = await runCli(['restore-direct'], io, write);
  assert.equal(code, 0);
  assert.match(lines[0], /^OK \[RESTORED\]/);
});

test('runCli：业务拒=1（未知 provider）', async () => {
  const { io } = readyIO();
  const { write } = capture();
  const code = await runCli(['model', 'restore-direct', '--provider', 'nope'], io, write);
  assert.equal(code, 1);
});

test('runCli：--version=0 出 CORE_VERSION；help=0；无参=2', async () => {
  const { io } = readyIO();
  const v = capture();
  assert.equal(await runCli(['model', '--version'], io, v.write), 0);
  assert.equal(v.lines[0], CORE_VERSION);
  const h = capture();
  assert.equal(await runCli(['model', 'help'], io, h.write), 0);
  assert.match(h.lines[0], /四族统一形态/);
  assert.match(h.lines.join('\n'), new RegExp('trimodel model restore-direct'));
  const none = capture();
  assert.equal(await runCli([], io, none.write), 2);
});

test('runCli：未知命令=2；未知旗标=2（fail-closed 拒收拼错）', async () => {
  const { io } = readyIO();
  const bad1 = capture();
  assert.equal(await runCli(['model', 'explode'], io, bad1.write), 2);
  const bad2 = capture();
  assert.equal(await runCli(['model', 'restore-direct', '--providr', 'x'], io, bad2.write), 2);
  assert.match(bad2.lines[0], /未知旗标/);
});

test('runCli：config get 子命令走通+status --backups 数字旗标走通', async () => {
  const { io } = readyIO();
  await restoreDirect({}, io);
  const g = capture();
  assert.equal(await runCli(['model', 'config', 'get'], io, g.write), 0);
  assert.match(g.lines[0], /^OK \[OK\] 现役配置/);
  const s = capture();
  assert.equal(await runCli(['model', 'status', '--backups', '1'], io, s.write), 0);
  assert.match(s.lines[0], /^OK \[OK\]/);
});

test('renderResult：FAIL 行格式+data 摘要行（自测渲染器三统一契约）', () => {
  const rendered = renderResult({ ok: false, code: 'PRESET_UNKNOWN', message: '未知模板（x）', data: { provider: 'x' } });
  assert.equal(rendered, 'FAIL [PRESET_UNKNOWN] 未知模板（x）\n  provider = x');
});
