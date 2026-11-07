# 裕和堂 Taro 小程序与 H5

Taro 4 + React 18 + TypeScript，同一套源码编译微信小程序和 H5。管理后台和 Java API 分别在 [admin](https://github.com/Ghostisme/yuhetang-miniprogram-admin)、[backend](https://github.com/Ghostisme/yuhetang-miniprogram-backend) 仓库，互不参与本仓库构建。

## 常用命令

需要 Node.js 20.19+ 或 22.12+，在本仓库执行：

```powershell
npm ci
npm run dev:weapp    # 连接线上 Java 与线上管理后台，持续编译
npm run dev:weapp:server # 同上，真实微信登录并检查线上接口
npm run dev:weapp:local # 本地 Java 就绪后，模拟器联调与开发登录
npm run build:weapp  # 微信小程序正式构建
npm run dev:h5       # H5 开发，http://127.0.0.1:5182
npm run build:h5     # H5 静态构建
npm run check:mini   # TypeScript + 单元测试
```

微信开发者工具导入仓库根目录，`project.config.json` 已指向 `dist/weapp/`，AppID 为 `wxce054e18303efb8a`。先运行微信编译命令，再用开发者工具预览、真机调试和上传。H5 发布目录为 `dist/h5/`。

已运行开发监听时，可用 `TARO_APP_OUTPUT_ROOT` 指定另外的构建目录（例如 `dist/verify-weapp`），避免正式构建覆盖正在联调的产物；不设置时仍使用上述默认目录。

## 源码结构

```text
config/index.ts          Taro 编译、H5 代理和环境配置
src/
  app.tsx                应用入口
  app.config.ts          页面和底部导航
  app.scss               全局样式入口
  styles/common.scss     公用布局、组件与主题
  pages/
    home/                首页
    catalog/             养护项目
    stores/              门店
    orders/              我的预约
    booking/             四步预约
    chat/                在线咨询
  components/            公用组件、微信原生客服按钮
  services/              API、登录、订阅消息及配置缓存
  types.ts               业务类型
  assets/                导航图标
tests/                  单元测试
```

每个页面使用 `index.tsx`、`index.scss`、`index.config.ts`，业务修改直接编辑 `src/`。`dist/` 是生成产物，不直接修改；旧原生 `app.js/pages/*.wxml` 结构已从本仓库移除。

## 接口与本地联调

微信小程序开发和正式编译默认 API 为 `https://mp-admin.hetuonian.cn`，与当前线上管理后台 `/admin` 使用同一套 Java 和数据库。可用构建环境变量 `TARO_APP_API_BASE` 指定接口地址；变量是公开客户端配置，禁止放 AppSecret、Token 或 AESKey。`booking.hetuonian.cn` 当前仅提供微信原生客服回调，不能用作完整业务 API。

测试线上“在线咨询”时运行 `npm run dev:weapp`，然后在模拟器进入咨询页并发一条消息，在 `https://mp-admin.hetuonian.cn/admin` 的“客户沟通”查看“在线客服”会话。该命令先检查线上 Java、数据库和微信登录配置，并关闭模拟登录。微信后台的 request 合法域名需包含 `https://mp-admin.hetuonian.cn`；真机验证仍受该配置约束。模拟器切换接口或登录模式后，会自动丢弃上一环境的客户登录，不再携带本地模拟身份访问线上。

本地 H5 通过代理访问独立 Java API：

```powershell
$env:API_PROXY_TARGET='http://127.0.0.1:8790'
$env:TARO_APP_API_BASE=''
$env:TARO_APP_DEV_LOGIN='true'
npm run dev:h5
```

模拟登录须显式开启且后端为 local 模式，正式构建始终禁用。生产 H5 当前支持公开内容浏览；客户登录、预约和咨询的生产验收使用微信小程序。若要正式 H5 也能操作客户资料，需要补接 H5 登录，不会自动使用模拟身份。

微信模拟器本地联调按以下顺序执行，Java、管理后台和小程序仍各自运行：

```powershell
# 终端一：独立 Java 仓库
cd 'D:\github_code\裕和堂相关项目\yuhetang-miniprogram-backend'
.\tools\start-local.ps1

# 终端二：本小程序仓库
cd 'D:\github_code\裕和堂相关项目\yuhetang-miniprogram'
npm run dev:weapp:local
```

该命令先检查 `http://127.0.0.1:8790/api/health`，接口未启动时会直接提示；只接受 local 后端。它启用本地模拟登录，并在不入库的 `project.private.config.json` 中关闭域名校验。本地咨询应到本地管理后台接待；普通 `dev:weapp` 则连接线上。正式 `build:weapp` 禁用模拟登录，并拒绝将 localhost 编入正式包。

微信开发者工具打开本仓库根目录 `D:\github_code\裕和堂相关项目\yuhetang-miniprogram`，确认“小程序目录”为 `dist/weapp/`。不要打开旧的 `D:\BaiduNetdiskDownload\照片\yuwatang-reservation\miniprogram`；若仍出现旧 WXML、`8098/api/public/bootstrap` 或旧样式报错，先切回本仓库，再“清缓存 → 全部清除”并重新编译。页面源码只修改 `src/`，不复制旧原生模板到 `dist/`。

手机不能用电脑的 `127.0.0.1`；真机局域网联调需启动 Java 的 `-Lan` 选项，并将 `TARO_APP_API_BASE` 设为电脑局域网地址。正式版仍需配置合法域名、HTTPS、隐私指引并完成真机验证。

## 业务与消息

预约按“门店 → 本店项目 → 日期时段与人数 → 联系资料”提交，提交后等待门店确认。我的预约支持查询、取消、改约。微信原生客服使用 Taro `Button openType="contact"`，附公开门店来源，直接进入微信客服；独立“在线咨询”通过现有 Java 接口与后台收发。

预约处理和到店提醒模板 ID 从 `/api/runtime` 读取。订阅申请在用户点击时发起，拒绝订阅不阻断预约；真实发送由后端完成。品牌、门店、本店项目及规则通过 API 更新，站点与运行配置缓存 60 秒，首页下拉可强制刷新。

本地 TypeScript、单元测试、微信/H5 编译及 H5 预约客服联调不替代真实微信登录、订阅消息送达或提审。接入要求见 [微信说明](docs/微信接入说明.md)，后续内容更新见 [接口约定](docs/小程序接口更新约定.md)。
