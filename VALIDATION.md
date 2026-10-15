# 0.2.0 验证记录

验证日期：2026-10-15（Asia/Tokyo）。

- 14 项自动测试通过：原协议门控、输入边界、背压、压缩链接、解压大小限制，以及邀请密钥/会话/证书/主客角色绑定。
- 新自动模式在两个独立浏览器页面真实建立连接，接收者仅需打开邀请并点击加入；没有回应码或手动安全码步骤。
- 中文与 emoji 双向实时同步通过。
- 实际篡改链接密钥后，双方均拒绝连接，输入始终禁用。
- 完全关闭辅助服务的备用邀请仍可通过两条压缩链接建立连接；确认链接可自动交回原页面，安全码一致。
- `npm run sync` 通过，iOS/Android 静态资源同步成功；更新后的原生包是否编译通过以该提交对应的 GitHub Actions 为准。
- 公共信令使用固定版本 PeerJS 1.5.5，自带本地脚本与 MIT 许可证，不从 CDN 动态加载。CSP 只额外允许其 `0.peerjs.com` HTTPS/WSS。
- 没有 TURN、中继聊天、离线消息或推送；此版本仍未经过手机真机或独立安全审计。

## 0.1.0 既有验证


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
- 默认 STUN 模式也在两个页面中成功交换连接码、核对安全码并同步文字；不代表跨设备或跨网络验证。
- GitHub Actions 网页检查通过，`npm audit` 为 0 个已知漏洞；开发工具 xcode 的 uuid 间接依赖已固定为修复版本。
- [原生云构建](https://github.com/jiamiing/miyo/actions/runs/38710283722)成功：Android `assembleDebug` 产出调试 APK（作业 2 分 34 秒），iOS `xcodebuild` 产出未签名模拟器 App（作业 48 秒）。不是 iPhone 真机 IPA。

## 待真实设备验证

- iPhone / Android 实际运行、系统输入法候选内容的暴露范围、软键盘与前后台生命周期。
- 不同设备、跨 Wi-Fi、移动网络与复杂 NAT 的连接成功率。
- 当前主机只有 Xcode Command Line Tools，没有完整 Xcode；没有 Android SDK，因此本地未编译 IPA / APK，也未验证签名或商店提交。

## 产品边界

没有 TURN、离线消息、推送、自动重连或服务器信令。断线需交换新码。原型未经独立安全审计。
