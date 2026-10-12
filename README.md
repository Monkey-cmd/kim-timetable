# Kim课表

一个适合不同学校使用的安卓课表 Demo。应用名「Kim课表」，包名 `com.kim.timetable`，版本 0.3.0。

在 [版本下载页](https://github.com/Monkey-cmd/kim-timetable/releases/tag/v0.3.0-demo) 下载 `kim-timetable-0.3.0-demo.apk`。仓库公开，其他人可以查看源码、下载安装包。

## 安装与使用

将 APK 保存到安卓手机，用文件管理器打开；按系统提示允许该文件管理器安装应用。支持 Android 7.0 以上，Android System WebView / Chrome 需要版本 110 以上。过旧的组件会显示更新提示。这是体验版，使用 debug 签名；暂未做安卓真机测试。

先在设置中填写学校、学期、第 1 周的星期一和作息，再手动添加课程或导入 PDF。支持周课表、今日课程、指定周次、单双周、冲突提示、课程管理、备忘录和 JSON 备份。

PDF 在手机本地解析，支持文字版 PDF。目前表格识别支持特定的 12 节横向布局；也支持同一行包含课程名称、星期和节次的文字条目。不同学校的 PDF 格式可能无法自动识别，请检查候选结果，必要时手动添加。扫描图片 PDF 暂不支持。学校账号登录同步和手机通知暂未实现。

课程、备忘录和 PDF 解析资源随安装包保存，日常使用可离线。文件导入使用系统文件选择器，JSON 导出使用系统「另存为」，不申请全盘文件访问权限。

## 从旧版迁移

Kim课表使用新的应用标识，会与旧版并存。请先在旧版的「设置 → 导出 JSON」保存备份，再在 Kim课表的「导入」中选择备份、检查并确认。旧备份可恢复课程、备忘录、学期和作息；迁移成功后再自行卸载旧版。

网页版和安卓 App 分别保存数据，也可用 JSON 备份迁移。卸载或清除 App 数据会移除保存内容，建议定期导出备份。个人 PDF、实际课程数据和学校账号信息不包含在此仓库中。

## 生成 APK

需要 Node.js 22+、Java 21、Android SDK（API 36、Build Tools 35 或以上）。使用 SDK 前需自行阅读并接受 Google Android SDK 许可。构建脚本不会自动接受许可。

    npm ci
    npm run sync:android
    powershell -NoProfile -File scripts/build-apk.ps1 -JavaHome "JDK21目录" -AndroidSdkRoot "SDK目录"

成功输出 `build-output/kim-timetable-0.3.0-demo.apk`。构建脚本在临时 ASCII 路径编译，避免 Windows 中文目录兼容问题，并校验 APK 签名。首次构建生成本地 debug 签名文件，后续构建复用它；正式商店发布需要正式签名。

如果桌面执行环境出现 Java `Unable to establish loopback connection`，可给构建脚本增加 `-TcpLoopbackWorkaround`，仅调整本次 Java 进程的 socket 临时目录，使 JDK 使用 TCP 回退。

## 项目结构

- `web-source`：独立的网页源码及离线 PDF 资源。
- `native`：安卓存储、返回键与 JSON 导出适配。
- `android`：安卓工程。
- `scripts/sync-web.mjs`：准备网页资源，加入安卓适配；`npm test` 检查课程、PDF 解析与备忘录逻辑。

依赖缓存、SDK、签名文件与构建结果不纳入源码。PDF.js 及其字体、CMap、WASM 资源的许可证随 `web-source/vendor` 保留。

技术文档：[Android SDK](https://developer.android.com/studio#command-tools)、[Capacitor Android](https://capacitorjs.com/docs/android)、[Preferences](https://capacitorjs.com/docs/apis/preferences)、[System Bars](https://capacitorjs.com/docs/apis/system-bars)。
