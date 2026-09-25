// ── trimodel-cli core · 模板层/独立钥单测（TASK-TRIMODEL-RECOVERY-LADDER-01 波③）──
// 覆盖：presets 装载器（钥形字段拒载 fail-closed/坏 JSON/缺必填/deployed 严格布尔）、
// findPreset 未知、readDeployKey 四连 fail-closed（缺失/空/占位符/健康门）+ 显式 --key-file。

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPreset, loadPresets, readDeployKey } from '../../src/trimodel-cli/index.js';
import { GOOD_KEY, makeTmpRoot, writePreset } from './helpers.js';

test('loadPresets 正常装载：字段族解析+deployed 布尔严格（字符串 "true" 不算部署）', () => {
  const dir = makeTmpRoot('presets-happy');
  writePreset(dir, 'bigmodel');
  writePreset(dir, 'deepseek', { deployed: false });
  writePreset(dir, 'lenient', { deployed: 'true' as unknown as boolean });
  const { presets, errors } = loadPresets(dir);
  assert.deepEqual(errors, []);
  assert.equal(presets.length, 3);
  const byId = Object.fromEntries(presets.map((p) => [p.id, p]));
  assert.equal(byId.bigmodel.deployed, true);
  assert.equal(byId.deepseek.deployed, false);
  assert.equal(byId.lenient.deployed, false); // 严格 ===true
});

test('loadPresets 钥形字段拒载：api_key 在模板=整件拒（钥不进模板红线）', () => {
  const dir = makeTmpRoot('presets-leak');
  writePreset(dir, 'good');
  writePreset(dir, 'leaky', { api_key: 'sk-leak-0123456789abcdef' });
  const { presets, errors } = loadPresets(dir);
  assert.equal(presets.length, 1);
  assert.equal(presets[0].id, 'good');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /钥形字段/);
  assert.match(errors[0], /api_key/);
});

test('loadPresets 坏 JSON/缺必填：逐件报错不阻塞其余装载', () => {
  const dir = makeTmpRoot('presets-bad');
  writePreset(dir, 'good');
  writeFileSync(join(dir, 'broken.json'), '{nope', 'utf-8');
  writeFileSync(join(dir, 'empty-model.json'), JSON.stringify({ id: 'empty-model', base_url: 'https://x.example' }), 'utf-8');
  const { presets, errors } = loadPresets(dir);
  assert.equal(presets.length, 1);
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /broken\.json/);
  assert.match(errors.join('\n'), /empty-model\.json/);
});

test('loadPresets 目录不可读：全量失败人话报路径', () => {
  const { presets, errors } = loadPresets(join(makeTmpRoot('presets-missing'), 'no-such-dir'));
  assert.equal(presets.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /presets 目录不可读/);
});

test('findPreset：命中/未命中列可用清单', () => {
  const dir = makeTmpRoot('presets-find');
  writePreset(dir, 'bigmodel');
  writePreset(dir, 'deepseek', { deployed: false });
  const hit = findPreset(dir, 'bigmodel');
  assert.equal('preset' in hit && hit.preset.id, 'bigmodel');
  const miss = findPreset(dir, 'volcengine');
  assert.equal('unknown' in miss, true);
  if ('unknown' in miss) {
    assert.deepEqual(miss.available.sort(), ['bigmodel', 'deepseek']);
  }
});

test('readDeployKey fail-closed：缺失/空/占位符/短键 四态全拒（人话附路径）', () => {
  const root = makeTmpRoot('deploy-key');
  const path = join(root, '.deploy-key.bigmodel');
  const missing = readDeployKey('bigmodel', path);
  assert.equal('failClosed' in missing, true);
  if ('failClosed' in missing) {
    assert.equal(missing.code, 'DEPLOY_KEY_MISSING');
    assert.match(missing.message, new RegExp(path.replaceAll('\\', '\\\\').replaceAll('.', '\\.')));
  }
  writeFileSync(path, '   \n', 'utf-8');
  const empty = readDeployKey('bigmodel', path);
  assert.equal('failClosed' in empty && (empty as any).code, 'DEPLOY_KEY_INVALID');
  writeFileSync(path, 'PLACEHOLDER_NOT_REAL', 'utf-8');
  const ph = readDeployKey('bigmodel', path);
  assert.equal('failClosed' in ph && (ph as any).code, 'KEY_FAIL_CLOSED');
  assert.match((ph as any).message, /健康门/);
  writeFileSync(path, 'short', 'utf-8');
  const short = readDeployKey('bigmodel', path);
  assert.equal('failClosed' in short && (short as any).code, 'KEY_FAIL_CLOSED');
});

test('readDeployKey 正常：返回键+路径（keyFile 显式优先）', () => {
  const root = makeTmpRoot('deploy-key-ok');
  const custom = join(root, 'custom-key.txt');
  writeFileSync(custom, `  ${GOOD_KEY}\n`, 'utf-8'); // trim 语义
  const res = readDeployKey('bigmodel', custom);
  assert.equal('key' in res && res.key, GOOD_KEY);
  assert.equal('path' in res && res.path, custom);
});
