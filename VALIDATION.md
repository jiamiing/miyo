# 0.1.0 验证记录

验证日期：2026-10-15（Asia/Tokyo）。

## 已通过

- `npm test`：8 项测试，覆盖连接码解析、字段/长度/会话边界、安全码对称性及会话绑定、未双边确认前禁止共享、旧快照处理、背压下只保留最新内容和关闭后清除待发文字。
- `node --check src/app.js` 和 `node --check src/peer.js`。
- `npm run build` 与 `npx cap sync`：静态构建与双平台资源同步成功。
- iOS Info.plist 通过 `plutil -lint`。
- 桌面浏览器两个独立页面真实建立 WebRTC DataChannel；开启严格模式，无 STUN/TURN。
- 双端安全码相同；双方确认前输入禁用，只有一端确认后仍禁用。
- 双向同步中文、emoji 和多行文本；编辑替换与清空可同步。
- 刷新一端后另一端显示断开，并清空会话文字。
- 在宽 390、高 844 的 iframe 中验证窄屏布局，实际 `innerWidth` 与 `scrollWidth` 均为 390，无横向溢出；这不等同于手机 WebView 真机测试。

## 待真实设备验证

- iPhone / Android 实际运行、系统输入法候选内容的暴露范围、软键盘与前后台生命周期。
- 不同设备、跨 Wi-Fi、移动网络与复杂 NAT 的连接成功率。
- 当前主机只有 Xcode Command Line Tools，没有完整 Xcode；没有 Android SDK，因此本地未编译 IPA / APK，也未验证签名或商店提交。

## 产品边界

没有 TURN、离线消息、推送、自动重连或服务器信令。断线需交换新码。原型未经独立安全审计。
