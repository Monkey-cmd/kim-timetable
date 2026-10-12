# 上大课表 · 安卓体验版

上海大学课表 Android Demo，应用名「上大课表」，包名 `cn.shu.pocket.timetable`，版本 0.2.0。

在 [版本下载页](https://github.com/Monkey-cmd/shu-pocket-timetable/releases/tag/v0.2.0-demo) 下载 `shu-timetable-0.2.0-demo.apk`。仓库为私有，需登录有权限的 GitHub 账号。

安装：将 APK 发送到自己的安卓手机，用文件管理器打开；如果系统提示，允许该文件管理器安装应用，然后继续安装。支持 Android 7.0 以上，浏览器组件 Android System WebView / Chrome 需要版本 110 以上。过旧的组件会显示更新提示。

验证：17 项课表、PDF 表格解析及备忘录检查通过；Android 编译与 APK 签名校验通过；安装包中的 211 个网页及 PDF 资源与准备的应用完全一致。尚未在安卓手机上做真机测试。

网页版体验地址：https://shu-pocket-timetable.alightharp64.chatgpt.site

保留周课表、今日课程、PDF 导入、课程管理、备忘录及 JSON 备份。页面和 PDF.js 资源都打包到 App 内；不依赖已发布的网站打开，不需要学校账号密码。学校账号自动同步和手机通知暂未实现。

安卓已适配：

- 系统文件选择器导入 PDF / JSON，系统「另存为」保存备份。
- 原生 Preferences 保存课程和备忘录，写入成功后才显示保存成功。
- 手机返回键优先关闭弹窗，再回到课表；主页最小化 App。
- 竖屏、横屏避让系统栏与屏幕边缘，保留上大课表图标。
- 不申请全盘文件访问权限。学校外链在系统浏览器打开。

原网页版和 App 分别保存数据。安装后可以重新导入学校 PDF，也可以先在网页导出 JSON，再在 App 导入，迁移课表与备忘录。卸载或清除 App 数据会清除保存内容。

## 生成 APK

需要 Node.js 22+、Java 21、Android SDK（API 36、Build Tools 35）。Google SDK 许可必须由用户明确同意后才能安装和使用；本工程和构建脚本不会自动接受许可。本次构建已由用户明确同意许可并安装工具。

    npm ci
    npm run sync:android
    powershell -NoProfile -File scripts/build-apk.ps1 -JavaHome "JDK21目录" -AndroidSdkRoot "SDK目录"

构建脚本会在临时 ASCII 路径编译，避免 Windows 中文目录兼容问题，并校验 APK 签名。成功输出：`build-output/shu-timetable-0.2.0-demo.apk`。体验版使用本地 debug 签名，适合直接安装试用；Google Play 发布需要另行准备正式签名。

如果桌面执行环境出现 Java `Unable to establish loopback connection`，可给构建脚本增加 `-TcpLoopbackWorkaround`。它只调整本次 Java 进程的 socket 临时目录，让 JDK 使用 TCP 回退，不修改系统或手机配置；本次构建使用了此选项。

## 源码同步

`scripts/sync-web.mjs` 仅复制相邻 `shu-schedule/dist` 的公开资源（独立源码 ZIP 使用 `web-source` 快照），增加安卓存储/返回键/导出适配，不更改网页原工程，不复制 Sites 身份、原 PDF、截图或浏览器个人数据。`npm test` 验证打包到 App 的课程、PDF 表格解析及备忘录数据模型。

工具链、依赖缓存、SDK、签名文件与构建结果不纳入项目源码。许可及技术依据：

- https://developer.android.com/studio#command-tools
- https://capacitorjs.com/docs/android
- https://capacitorjs.com/docs/apis/preferences
- https://capacitorjs.com/docs/apis/system-bars
