# TriCode Product State

> 最后更新：2026-07-16（模块目录初始化，从 TriPilot 独立）
> Owner：ChiefProductOfficer（小乔）
> 来源：CPO 路由包裁决 #3, #14-#15
> 参考：`TriMetaverse/docs/workflow/operating-records/2026-W29/cpo-product-routing-package.md`

## Module Overview

`TriCode` 是 TriMetaverse 生态的**多代码工具 glue 层**，统一管理对多种代码 AI 工具的接入、调度和账户关联。

- TriCode 不是单一工具封装，而是工具策略层——决定用哪个工具、怎么用、何时切换。
- 消费者包括 TriMC（云端下发任务时直接调用代码工具）、TriLC（本地执行）、TriPilot（用户手动触发）等，**不限于 TriPilot 单一消费者**。
- 独立模块后，各调用方只依赖 TriCode 接口，不与具体工具实现耦合。

## Current Product Scope

### 多工具接入策略（裁决 #14-#15）

```
Tier 1 → Tier 2 → Tier 3 顺序接入：

Tier 1: opencode       ← 当前优先
Tier 2: Claude Code    ← 第二阶段
Tier 3: Codex / zcode / Copilot  ← 第三阶段
```

### 工具账户模型（裁决 #3）

```
TriMem 账户 ←──可选关联──→ opencode 账户
            ←──可选关联──→ Claude Code 账户
            ←──可选关联──→ Codex 账户
            ←──可选关联──→ zcode 账户
            ←──可选关联──→ Copilot 账户
```

- 各工具维护自身认证，TriMem **不作为**工具侧的 Auth Provider
- TriMem 提供"关联工具账户"功能：用户主动在 TriPilot 设置中绑定
- 关联行为**非强制**——不关联不影响工具正常使用
- 关联后解锁：跨工具用量统计面板、统一 Token 消耗视图

### MVP 范围（Phase 1 L1）

| 功能 | 说明 | 状态 |
|------|------|------|
| opencode 接入 | Tier 1 优先接入，提供基础 glue 接口 | DISCOVERY |
| 工具选择路由 | 根据任务类型/用户偏好选择工具 | Phase 1 L1 |
| Claude Code 接入 | Tier 2 第二阶段 | Phase 1 L2 |
| Codex/zcode/Copilot 接入 | Tier 3 扩展 | Phase 2+ |

**Phase 1 不做：** 工具间任务迁移/协同、跨工具 session 共享、工具性能基准测试平台

## Current Progress

- 模块目录已建立（`TriCode/`），含 registry 工作文档
- 产品规格已完成（2026-07-16），CPO 路由包裁决 #3, #14-#15 已落地
- **待 CTO 接手**：模块初始化（README.md / AGENTS.md / 工程骨架）、opencode glue 接口设计

## Bug And Gap State

- 尚无工程代码，处于 DISCOVERY 阶段
- 各工具 API 稳定性/可用性待验证
- 工具账户关联的跨模块接口（TriMem↔TriCode）待 CTO 设计

## Cross-Module Dependencies

| 依赖模块 | 关系 | 状态 |
|----------|------|------|
| TriMem | 工具账户可选关联（code_tool_links 表） | DISCOVERY→DESIGNING |
| TriPilot | 用户手动触发代码工具的 UI 入口 | 已有基础 |
| TriMC | 云端 Agent 下发代码任务时调用 TriCode | Phase 1+2 done |
| TriLC | 本地 CLI 执行时调用 TriCode | DISCOVERY |

## Architecture State

- 当前为纯产品规格层，无代码实现
- 目标架构：统一 glue 接口层 → 工具 adapter → 各代码工具
- TriCode 不替代任何工具，只是策略路由和统一管理面

## Sources

- `CPO 路由包裁决 #3, #14-#15` — `TriMetaverse/docs/workflow/operating-records/2026-W29/cpo-product-routing-package.md`
- `TriMem docs/registry/product-state.md` §TriCode
- `TriPilot docs/registry/product-state.md` §TriCode（迁移来源）
- `TriCompany docs/registry/product-state.md` 模块边界表
