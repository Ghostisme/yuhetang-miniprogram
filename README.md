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

客户登录入口位于“我的预约”：未登录时为整屏门店实景图、品牌文案和白色“登录”按钮，协议默认不勾选。勾选后点击按钮直接发起微信登录，不额外弹出自定义授权面板。协议及隐私说明可分别阅读，不会因打开文档而自动同意。

预约最后一步和在线咨询使用同一个底部授权面板：上方为深绿品牌与门店实景，下方为协议、立即登录和仅浏览。面板直接覆盖当前页面，不跳走；关闭、点击遮罩或选择“仅浏览”均保留当前门店、时段和表单草稿。登录成功只恢复客户身份，预约仍需再次点击提交。单独打开 `/pages/login/index` 也提供同样的大图直接登录入口。

登录照片来自本项目已收录的裕和堂官网门店实景（`space-07-full.webp`、`store-02-alt.webp`），裁切后作为本地 JPEG 随包发布；不依赖外部图片地址。界面没有使用 Panorobo 的品牌和机器人素材。

客户主动同意后，Taro `login` 获取一次性 code，交由原有 `/api/auth/wechat` 换取客户登录态；不会自动获取头像、昵称或手机号。登录成功后在原页面继续操作，预约表单保留，仍需客户再次确认提交。旧版未确认协议的静默登录态会在升级后失效一次；使用同一微信重新登录仍对应原客户，服务器预约与咨询记录不删除。

“我的预约”支持退出登录。退出或接口返回 401 后，个人预约和在线咨询内容会隐藏，不会偷偷重新登录；晚到的旧请求也不能把旧账号内容写回页面。登录面板关闭或登录页离开后，未完成的登录结果不会再写入本机。订阅消息需先登录，再由客户主动点击触发微信原生订阅窗口，与登录协议分开处理。

登录验收：`npm run check:mini` 检查会话、真实 SDK 适配器和订阅逻辑；`npm run build:h5` 后运行 `npm run verify:login`，使用隔离接口与 Edge 检查游客入口、协议、预约草稿返回、退出和过期登录，截图与结果位于 `backups/login-verification/`，覆盖 320、375、390 像素屏幕、大图直接登录、面板关闭/协议跳转和预约草稿保留。SDK 测试使用假 code，浏览器用模拟数据，不发送微信消息、不连接线上客户数据；真实微信身份登录需在开发者工具或手机上验收。

另可在开发构建中验证登录成功与取消的页面行为：将 `NODE_ENV=development`、`TARO_APP_DEV_LOGIN=true`、`TARO_APP_API_BASE=https://mp-admin.hetuonian.cn`、`TARO_APP_OUTPUT_ROOT=backups/login-fixture-h5` 作为本次构建的环境变量运行 `npm run build:h5`，再运行 `node tools/verify-login.mjs --development-fixture`。该脚本拦截全部接口，仅在隔离开发包里提供测试身份，检查预约草稿保留、咨询只建立一次，以及关闭/离开后丢弃迟到的登录结果。测试包位于忽略目录，不能用作正式发布；正式 H5 校验继续确认它无法模拟微信身份。

预约按“门店 → 本店项目 → 日期时段与人数 → 联系资料”提交，提交后等待门店确认。我的预约支持查询、取消、改约。微信原生客服使用 Taro `Button openType="contact"`，附公开门店来源，直接进入微信客服；独立“在线咨询”通过现有 Java 接口与后台收发。

四步预约采用固定标题、步骤条和底部操作区的布局，只让中间的门店、项目、时段或联系资料滚动；切换步骤从内容顶部开始，返回时保留已选内容与填写草稿。微信页面关闭整屏滚动，提交后的回执使用独立滚动区，小屏幕仍可查看全部信息。构建 H5 后运行 `npm run verify:booking`，用隔离接口检查 320、390、414 像素宽度下的真实滚动、步骤返回、草稿保留和回执可达性，截图与结果位于 `backups/booking-scroll/`。该验证不访问线上接口、不写入真实预约或发送微信消息。

客服会话按“待接入 → 接待中 → 已结束”流转。后台员工先接入后回复，每次会话只属于当前接待人；结束后客户在线咨询页保留聊天历史并显示“发起新咨询”，不会因刷新继续向旧会话发送。新咨询使用新会话编号，需重新排队接入。微信原生客服由服务器在收到新的客户消息后创建新会话，原生微信窗口和微信官方客服人员绑定仍由微信管理。

预约处理和到店提醒模板 ID 从 `/api/runtime` 读取。订阅申请在用户点击时发起，拒绝订阅不阻断预约；真实发送由后端完成。品牌、门店、本店项目及规则通过 API 更新，站点与运行配置缓存 60 秒，首页下拉可强制刷新。

登录后的“我的预约”增加客户资料卡：客户填写姓名或称呼，并单独点击微信原生按钮授权手机号。首次和最近登录时间由 Java 记录；同号既有客户、会员资料及点评来源按手机号关联，会员状态由后台维护。H5 可保存称呼，手机号授权仅在微信小程序执行，不会从 `wx.login` 伪造手机号。预约确认页预填已授权资料，保留客户自行填写的本次联系人。新资料入口为 `/pages/profile/index`，仅在已登录状态读取个人数据。

构建 H5 后可执行 `node tools/verify-customer-profiles.mjs`，使用隔离接口检查称呼保存、资料用途同意、会员展示、资料恢复及预约预填，截图和结果位于 `backups/customer-profiles/`。后端升级至支持 `/api/me/profile` 的版本后会通过 `/api/runtime.customerProfiles` 开启资料卡；已有客户端无需因为后台维护会员或修改来源标签而再次发布。

本地 TypeScript、单元测试、微信/H5 编译及 H5 预约客服联调不替代真实微信登录、手机号授权、订阅消息送达或提审。接入要求见 [微信说明](docs/微信接入说明.md)，后续内容更新见 [接口约定](docs/小程序接口更新约定.md)。
