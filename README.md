# 日记助手

一个本地优先的 AI 日记工具：三条录入路径（按框架写 / 自由写 / 对话引导），把日记自动蒸馏成四层月报。
数据全部存在浏览器本地，用户自带 API Key，没有服务端。

---

## 一、查看代码

代码就在 `D:\myProject\diary`。

**方式 1 · 用 VS Code（推荐）**

打开 VS Code → 菜单「文件 → 打开文件夹」→ 选 `D:\myProject\diary`。

或者在命令提示符 / PowerShell 里直接一行打开：

```
code D:\myProject\diary
```

VS Code 里两个必会快捷键：

| 操作 | 快捷键 |
|---|---|
| 按文件名跳转 | `Ctrl` + `P` |
| 在所有文件里搜文字 | `Ctrl` + `Shift` + `F` |

**方式 2 · 在浏览器里看效果**（不看代码，只看界面）

```
cd /d D:\myProject\diary
npm run dev
```

浏览器打开 `http://localhost:5173`。停止：在那个窗口按 `Ctrl + C`。

⚠️ 首次使用要先配置：**设置** 标签 → 填 baseURL / model / API Key → 点「测试连接」。

---

## 二、建议的读代码顺序

按这个顺序看，20 分钟能摸清主干：

| 顺序 | 文件 | 看什么 |
|---|---|---|
| 1 | `src/types.ts` | 数据长什么样。一天的记录 = `Entry`，月报 = `MonthlyReport`，六个字段的定义在 `FIELD_META` |
| 2 | `src/App.tsx` | 五个标签页的路由（今天 / 历史 / 月报 / 数据 / 设置） |
| 3 | `src/pages/TodayPage.tsx` | 最核心的页面：三条录入路径 + 确认闸门（490 行，最大的文件） |
| 4 | `src/lib/distill.ts` | 月报怎么被调度出来的：切段 → 子代理并行蒸馏 → 汇总 |
| 5 | `src/prompts/monthSummary.ts` | 「四层月报」到底怎么定义的（行为 / 待办 / 认知 / 指导） |

---

## 三、目录地图

```
src/
  types.ts          所有数据结构的定义（先看这个）
  App.tsx           页面路由
  pages/            五个页面
  components/       可复用组件（字段卡片、确认弹窗、基础控件）
  lib/              业务逻辑
    llm.ts          调 LLM 的地方（含「测试连接」）
    distill.ts      月报蒸馏调度
    reports.ts      月报 / 年报的生成与存取
    metrics.ts      9 个行为指标的统计
    entries.ts      日记条目的增删改查
    planner.ts      切段规则（哪几天归第几段）
  prompts/          6 个提示词，每个都带版本号
  knowledge/        月报导出到知识库（本地文件夹 / ima 两种适配器）
  db/               数据库表定义（Dexie）
```

---

## 四、常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器，改代码自动刷新 |
| `npm run build` | 构建生产版本，产物在 `dist/` |
| `npm test` | 跑单元测试 |
| `npm run preview` | 预览构建产物 |

依赖已装好（`node_modules` 在），**不用重新 `npm install`**。除非换了机器或误删了 `node_modules`。

---

## 五、几个必须知道的事

1. **数据存在浏览器里**，不在文件夹里。日记和设置都存 IndexedDB（浏览器的本地数据库）。换浏览器、清浏览器数据 = 数据没了。
2. **本机环境实测可用**：Node v24.18.0 + npm 11.16.0，路径 `D:\Program Files\nodejs`。不用装别的东西。
3. **代码只有一个 git 提交**（`cd2a5bc`）。`vite.config.ts` 有一次未提交的改动——那是为了能发布上线加的 `host` 和 `allowedHosts` 配置。
4. **`.build-check.log` 是构建日志残留**，可以直接删，不影响运行。
5. **API Key 只存在本机浏览器的 IndexedDB 里**，不会上传到任何地方。
