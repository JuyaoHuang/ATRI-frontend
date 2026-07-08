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
- **后端 TTS 设计文档位置**:
  - `../docs/developments/wiki/TTS/tts-design.md`
  - `../docs/developments/wiki/TTS/tts-implement.md`
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

前端行为必须与后端 WebSocket/API 协议一致。

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

## 提交规范

*和后端 ../ 的 AGENT.md 相同*

- 在开始子系统的实现前（如 LLM 调用模块），执行`git checkout -b feat/...` 切换分支，在新分支上开发，分支命名应准确、简洁、清晰。例如开发 LLM calling 模块，分支命名为：`feat/llm_calling`；开发 TTS 流式时：`feat/tts-streaming`

- 每个功能点一个 commit，不要把多个不相关的改动混在一起

- commit message 标准格式：`<type>(<scope>): <subject>`

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

- `scope` 必填，命名标准为：`branch-name/step`，例：1. 处在开发 LLM 调用模块的分支时，进行到第 4 步时，`llm-calling/step 4`；2. 在 ASR module 开发分支（`feat/asr`）时的第五步：`asr/step 5`，后续跟随具体的改动内容，简洁清晰。

  而不属于步骤内容（分支开发的收尾工作）时使用操作名，例如 `ci`、`docs`、`frontend`。

- `subject` 使用英文祈使句，首字母小写，句末不加句号，单行不超过 72 个字符。

- 示例：

  - `feat(vad/step 2): add audio chunk message dispatch`
  - `fix(vad/step 2): prevent duplicate interrupt on continuous speech`
  - `test(vad/step 2): add audio message protocol tests`
  - `docs(vad/step 3): update realtime voice input plan`
  - `chore(vad/ci): update GitHub Actions runner version`

- 如改动涉及多个文件的协调变更、技术决策或权衡，commit body 可选但建议填写；body 与 subject 之间空一行，每行不超过 72 个字符。

- 不在 commit message 里写 TODO；未完成的工作拆到后续 commit。

- 提交前至少通过当前改动范围对应的 basic check。

- **注意**：commit 内容应该简洁，重点描述做了什么，不附带任何 AI 协助信息，例如"aaaa@claude.com<cooperate by claude>"。

- 提交 commit 时如果触发 GPG 签名验证，前往`.env`文件获取密码`GPG_VERIFY_KEY`

- **一个branch对应一次大的功能开发，一个 commit 对应功能开发里的一个 step 里的一个小点 point**

- 验收结束后，执行`git push` 推送到上游仓库，并且执行`gh pr`进 PR 的提交 

---

## 禁止项

- 不在前端仓库修改后端代码。
- 不提交 `node_modules/`、`dist/` 或本地临时文件。
- 不忽略 TypeScript 类型错误。
- 不忽略 ESLint 错误。
- 不直接在组件中散落 API 调用，优先通过 composable/store/API 模块封装。
- 不把 VAD、ASR、TTS 协议字段硬编码到多个无关组件中。
