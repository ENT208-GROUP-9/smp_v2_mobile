# Smart Campus Map / 智慧校园地图

Smart Campus Map 是一个面向西浦太仓校区的校园活动地图应用。它把公共活动、校园地点、个人提醒、打卡反馈、邮件提取和管理端发布整合到同一个地图界面中，帮助学生快速理解“在哪里、什么时候、适合谁、我需要做什么”。

Smart Campus Map is a campus event map for the XJTLU Taicang campus. It combines public events, campus places, personal reminders, check-ins, feedback, email extraction, and an admin publishing workflow into one map-based experience.

## 在线访问 / Live Site

线上页面 / Live site:

https://ENT208-GROUP-9.github.io/smp_v2_mobile/

手机端入口 / Mobile entry:

https://ent208-group-9.github.io/smp_v2_mobile/#mobile/map

手机端微信扫码入口二维码 / WeChat QR code for the mobile site:

<img src="public/mobile-qr.png" alt="手机端微信扫码入口二维码 / Mobile QR code" width="240" />

## 主要入口 / Main Entries

- 学生端：默认打开的公共地图与个人空间体验。
- 手机端：通过 `/mobile` 或 `#mobile/map` 打开的 iOS 优先网页体验，使用独立底部导航。
- 管理端：通过 `#admin` 访问，用于维护地点和公共活动。

- Student view: the default public map and Personal Space experience.
- Mobile view: an iOS-first mobile web app available through `/mobile` or `#mobile/map`, with independent bottom navigation.
- Admin view: available through `#admin` for maintaining locations and public events.

## 功能概览 / Features

- 公共校园地图：展示地点、公共活动、主题 marker、当前位置和路线提示。
- 活动筛选与搜索：支持日期、范围、主题、地点、组织者和关键词搜索。
- 独立手机端：Map、Events、Personal、Agent 四个页面，点击活动或地点后进入全屏详情。
- Personal Space：学生可保存私人事项、邮件提取任务、提醒、打卡和反馈。
- SMART Agent：支持 Ask、Brief、Near、Scope、Route、Mine 等移动端能力。
- Admin 控制台：支持创建、编辑、发布活动，以及维护校园地点。

- Public campus map: shows places, public events, themed markers, current position, and route hints.
- Event filters and search: supports date, scope, theme, place, organizer, and keyword search.
- Dedicated mobile UI: Map, Events, Personal, and Agent pages, with full-screen detail pages.
- Personal Space: students can save private tasks, extract tasks from email text, set reminders, check in, and leave feedback.
- SMART Agent: supports Ask, Brief, Near, Scope, Route, and Mine workflows on mobile.
- Admin console: supports creating, editing, and publishing events, plus maintaining campus locations.

## 数据边界 / Data Boundaries

- Admin 发布的是公共活动，所有学生可见。
- 学生添加的是个人事项，只保存在当前浏览器本地。
- 公共数据和个人数据分离：个人提醒、打卡和反馈不会污染 Admin 发布内容。
- 当前版本不接入后端数据库，主要依赖 `localStorage` 保存演示数据和个人数据。

- Admin publishes public events that are visible to all students.
- Student-created items are private personal tasks stored in the current browser.
- Public data and personal data are separated: reminders, check-ins, and feedback do not modify Admin content.
- The current version has no backend database and mainly uses `localStorage` for demo and personal data.

## 技术结构 / Tech Stack

- React：构建学生端、手机端、Personal Space、SMART Agent 和 Admin 控制台。
- Vite：本地开发、构建和 GitHub Pages 部署。
- localStorage：保存本地演示数据、个人事项、提醒与打卡状态。
- GitHub Pages：静态网页托管。
- 可选 Agent API：如果部署环境提供 `/api/agent-search`，SMART Agent 可调用后端模型；否则使用本地规则兜底。

- React: powers the student app, mobile app, Personal Space, SMART Agent, and Admin console.
- Vite: used for local development, production builds, and GitHub Pages deployment.
- localStorage: stores demo data, personal tasks, reminders, and check-in state.
- GitHub Pages: hosts the static web app.
- Optional Agent API: if `/api/agent-search` is available, SMART Agent can call a backend model; otherwise it falls back to local rules.

## 本地运行 / Local Development

```bash
npm install
npm run dev
```

本地默认地址 / Default local URLs:

```text
http://127.0.0.1:5173/
http://127.0.0.1:5173/#mobile/map
```

常用检查命令 / Common checks:

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
```

## 部署 / Deployment

GitHub Pages 构建时应设置：

The GitHub Pages build should use:

```bash
VITE_BASE_PATH=/smp_v2_mobile/
```

静态托管环境支持 `#mobile/map` 作为稳定手机入口。直接访问 `/mobile` 时，项目内置的 `404.html` 会回到单页应用并自动进入手机端地图。

Static hosting supports `#mobile/map` as the stable mobile entry. When users directly open `/mobile`, the included `404.html` redirects back to the single-page app and enters the mobile map.

## Admin

默认演示密码 / Default demo password:

```text
tc-admin-demo
```

生产部署时建议通过环境变量设置密码：

For production deployment, set the password through an environment variable:

```text
VITE_ADMIN_PASSWORD=your-password
```

Admin 可用于新建、编辑、发布公共活动，维护地点信息，拖动 marker 校准地图坐标，并查看数据健康状态。

Admin can create, edit, and publish public events, maintain place information, drag markers to calibrate map coordinates, and inspect data health.

## 典型流程 / Typical Workflows

- 学生查找活动：打开地图，选择范围和主题，点击 marker 或活动卡片查看详情。
- 学生记录个人事项：进入 Personal，粘贴邮件或通知文本，提取并保存为私人任务。
- 学生参加活动后打卡：打开活动详情，设置提醒、Check in，并填写反馈。
- 管理员发布活动：进入 Admin，输入密码，新建活动，选择范围和地点后发布。

- Find an event: open the map, choose a scope and theme, then tap a marker or event card to view details.
- Save a personal task: open Personal, paste email or notification text, extract a draft, and save it privately.
- Check in after an event: open event details, set a reminder, check in, and leave feedback.
- Publish an event: open Admin, enter the password, create an event, choose scope and location, then publish.

## 后续方向 / Future Improvements

- 接入真实用户登录和云端个人数据同步。
- 接入真实邮件解析、大模型服务和日历提醒。
- 增加 Admin 多角色权限、活动审核流和反馈统计。
- 扩展校园路线导航和课程表自动提醒。

- Add real user login and cloud sync for personal data.
- Integrate real email parsing, LLM services, and calendar reminders.
- Add Admin roles, event review workflows, and feedback analytics.
- Extend campus routing and timetable-based reminders.
