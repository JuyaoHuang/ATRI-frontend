> 本文档定义 agents 在前端子模块中编写代码时必须遵循的流程和规范。每次编写或修改代码后，按此清单执行。

---

## 项目上下文

- **项目名**: atri-webui
- **所在位置**: `frontend/`
- **技术栈**: Vue 3 / TypeScript / Vite / Pinia / UnoCSS
- **包管理**: 当前仓库使用 `package-lock.json`，默认使用 `npm`。
- **后端仓库**: 父级工作仓库为 `../`
- **前端文档位置**:
  - `docs/DEVELOPMENT.md`
  - `docs/USER_CONFIG.md`
  - `readme.md`
- **后端 VAD 设计文档位置**:
  - `../docs/developments/wiki/VAD/vad-design.md`
  - `../docs/developments/wiki/VAD/vad-implement.md`
  - `../docs/developments/wiki/VAD/vad-implementation-plan.md`
  - `../docs/developments/wiki/VAD/development.md`
- **实现前必读**: 修改某个功能前，先阅读对应的前端文档和后端接口/设计文档。

---

## 代码编写后的检查清单

每次编写或修改前端代码后，按顺序执行：

### 1. 类型检查

```bash
npm run type-check
```

### 2. 代码检查和自动修复

```bash
npm run lint
```

### 3. 构建验证

```bash
npm run build
```

### 4. 依赖检查

- 新增 import 必须来自 `package.json` 已声明依赖。
- 新增运行时依赖使用 `npm install <package>`。
- 新增开发依赖使用 `npm install -D <package>`。
- 不提交 `node_modules/` 或 `dist/`。

### 5. 设计一致性

- 前端行为必须与后端 WebSocket/API 协议一致。
- 如果实现中发现协议需要调整，先更新 `../docs/developments/wiki/VAD/` 下的设计文档，再改代码。
- VAD 相关前端实现从 M3 开始，M2 只属于后端 WebSocket 协议扩展。

---

## 编码规范

### 命名

- Vue 组件文件：`PascalCase.vue`
- Composables：`useXxx.ts`
- Store：按模块命名，导出 `useXxxStore`
- 工具/类型文件：`camelCase.ts`
- 函数和变量：`camelCase`
- 常量：`UPPER_SNAKE_CASE`
- 类型和接口：`PascalCase`

### Vue 组件结构

```vue
<script setup lang="ts">
// imports
// props / emits
// composables / stores
// reactive state
// computed
// methods
// lifecycle
</script>

<template>
  <!-- template -->
</template>

<style scoped>
/* component styles */
</style>
```

### 状态与 API

- 全局状态放在 `src/stores/`。
- 可复用浏览器能力放在 `src/composables/`。
- API 调用统一封装在 `src/api/`。
- WebSocket 相关逻辑优先复用 `src/composables/useWebSocket.ts` 和 `src/stores/websocket.ts`。
- 播放控制优先复用 `src/composables/useAudioPlayer.ts`。

### 样式

- 优先使用 UnoCSS 原子类。
- 组件特定样式使用 `<style scoped>`。
- 全局样式放在 `src/assets/styles/` 或现有全局样式文件。
- 不为了局部效果引入新的 UI 框架。

### TypeScript

- 避免使用 `any`。
- 为 props、emits、函数参数和返回值补充类型。
- 复杂共享类型放在 `src/types/`。

---

## VAD 前端实现约束

M3 以后实现实时语音输入时遵循：

1. 前端通过 WebSocket 发送 `input:audio:chunk`。
2. 后端返回 `control:listen-state` 和 `control:interrupt`。
3. 收到 `control:interrupt` 后，调用现有 audio player stop 能力。
4. 实时 VAD 主路径使用 16 kHz、mono、PCM float array。
5. 优先使用 `AudioContext` / `AudioWorklet` 采集实时音频。
6. `MediaRecorder` 保留为按钮式 ASR 或降级路径，不作为实时 VAD 主路径。
7. 不在前端硬编码后端协议字段；协议字段以 `../docs/developments/wiki/VAD/development.md` 为准。

---

## 提交规范

- 每个功能点一个 commit。
- 不把无关格式化、空白变更和功能改动混在同一个 commit。
- commit message 标准格式：`<type>(<scope>): <subject>`。
- `type` 必填，允许值：
  - `feat`：新功能
  - `fix`：Bug 修复
  - `docs`：文档变动
  - `refactor`：重构（不改功能不改 bug）
  - `perf`：性能优化
  - `test`：测试相关
  - `style`：代码格式（不改逻辑）
  - `chore`：杂项（依赖、配置、CI 等）
  - `revert`：回滚
- `scope` 必填。属于 VAD 里程碑时使用 `M0`、`M1`、`M2`、`M3` 等；不属于里程碑时使用模块名，例如 `ui`、`websocket`、`asr`。
- `subject` 使用英文祈使句，首字母小写，句末不加句号，单行不超过 72 个字符。
- 示例：
  - `feat(M3): add realtime voice toggle`
  - `feat(M3): send realtime audio chunks`
  - `fix(M3): stop realtime listening on ws disconnect`
  - `test(M3): add realtime voice input type checks`
  - `chore(ui): update icon dependency`
- 如改动涉及多个文件的协调变更、技术决策或权衡，commit body 可选但建议填写；body 与 subject 之间空一行，每行不超过 72 个字符。
- 不在 commit message 里写 TODO；未完成的工作拆到后续 commit。
- 提交前至少通过当前改动范围对应的 basic check。
- commit message 不包含 AI 协助信息。
- 实现完成后等待负责人验收，再推送或发起 PR。

---

## 禁止项

- 不在前端仓库修改后端代码。
- 不提交 `node_modules/`、`dist/` 或本地临时文件。
- 不忽略 TypeScript 类型错误。
- 不忽略 ESLint 错误。
- 不直接在组件中散落 API 调用，优先通过 composable/store/API 模块封装。
- 不把 VAD、ASR、TTS 协议字段硬编码到多个无关组件中。
