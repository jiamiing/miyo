# 密友 Miyo

两个人的实时打字空间。上面是对方，下面是自己，没有发送键。输入、删除和换行通过加密的 WebRTC DataChannel 同步。

**版本：0.1.0 原型。** 提供网页版和 Capacitor 8 的 iOS、Android 工程；没有账号系统、聊天后端、数据库、广告或分析追踪。不是已上架的商店应用。

## 在线使用网页版

项目地址：[打开密友 Miyo](https://jiamiing.github.io/miyo/)。两人分别打开这个网址，再按下方步骤交换连接码。无需在本地启动程序。

发布使用本仓库的 `.github/workflows/pages.yml`，只上传 `dist/` 静态网页到项目路径 `/miyo/`。网页相关代码提交到 `main` 后自动更新，不配置自定义域名，不修改其他仓库或用户主站。GitHub Pages 只分发程序，不接收聊天正文。

## 本地开发网页版

需要 Node.js 22+。网页运行不依赖 npm 包，直接执行：

```sh
npm run dev
```

打开终端显示的 `http://127.0.0.1:4173`。如端口占用，执行 `PORT=4187 npm run dev`。可在两个页面中验证连接；该地址只供本机访问。

```sh
npm ci
npm test
npm run build
```

`dist/` 是可部署到任意 HTTPS 静态托管的网页版。两人可分别打开同一个 HTTPS 地址；静态托管只分发程序，不接收打字内容。请勿用普通局域网 HTTP 地址替代 HTTPS，安全 API 可能不可用。项目已配置独立的 GitHub Pages 自动发布工作流。

## iOS 和 Android

```sh
npm ci
npm run sync
npm run ios
# 或
npm run android
```

- `ios/App/App.xcodeproj`：在完整 Xcode 中选择自己的开发团队、连接 iPhone 后运行。Capacitor 8 需要 Xcode 26+，默认使用 Swift Package Manager。签名、TestFlight 和 App Store 发布需要相应 Apple 开发者配置。
- `android/`：在 Android Studio 中打开，安装工程要求的 Android SDK，使用 JDK 21+ 构建。本工程 compile/target SDK 36，min SDK 24，以锁定依赖的实际要求为准。
- Android 调试包：同步后运行 `cd android && ./gradlew assembleDebug`，输出在 `app/build/outputs/apk/debug/`。商店发布还需要自己的签名密钥。
- 原生工程内置相同网页资源，不需要托管服务器才能打开。iOS 已声明局域网用途，Android 已启用网络权限与键盘尺寸调整。没有申请相机、麦克风或通讯录权限。
- 修改网页后必须重新执行 `npm run sync`。应用标识暂为 `app.miyo.chat`，正式发布前应改成自己拥有的标识，并做真机测试。

仓库含 GitHub Actions：提交后运行网页检查，并尝试构建 Android 调试 APK 与未签名 iOS 模拟器应用。构建成功时可在相应运行的 Artifacts 下载；iOS 模拟器包不能安装到 iPhone。真机 iOS 仍需 Apple 签名。云构建是否通过以 Actions 实际结果为准。

参考：[Capacitor 安装](https://capacitorjs.com/docs/getting-started)、[环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)。

## 两个人怎么连接

1. 发起者打开「连接一位密友」，填名字，生成邀请连接码。
2. 通过已有的可信渠道把邀请连接码交给对方。
3. 加入者切换「我来加入」，粘贴邀请，生成回应码，交还给发起者。
4. 发起者粘贴回应码，点击「完成连接」。
5. 通过当面或可信通话核对两端显示的 12 位十六进制安全码，双方都确认后才开放输入。
6. 直接打字。回车只换行；删改和清空也会同步。任意一方结束连接后，两端应用会清除当前会话文字。

连接码并非短房间号，包含 SDP、临时网络候选地址和加密证书指纹。只交给密友，不应公开发布。默认不把码放进 URL，也不自动读取剪贴板；复制后系统剪贴板中的内容不由应用自动清除。

## 「无需服务器」的边界

| 模式 | 依赖 | 实际限制 |
| --- | --- | --- |
| 默认直连 | 无自建后端；公共 Google / Cloudflare STUN 辅助发现网络地址 | STUN 不承载聊天正文；某些 NAT、防火墙或移动网络会导致直连失败 |
| 严格无服务器 | 发起时勾选，使用 `iceServers: []`；手动交换连接码 | 适合可相互访问的网络，不能保证局域网或跨网成功；浏览器隐私策略与网络隔离也会影响连接 |
| 提高跨网成功率 | 后续加入 TURN 中继 | 需要服务器或第三方服务；聊天仍由两端的 DTLS 加密，中继不能解密正文 |

「任意网络稳定连接」「手机后台始终在线」「不借助任何服务器」不能在此架构中同时承诺。网页还需要静态资源来源；原生安装包可内置资源。当前没有 TURN、推送、后台常驻、自动信令服务或断线自动重连。

参考：[WebRTC 连接与 STUN/TURN](https://webrtc.org/getting-started/peer-connections)、[WebRTC DataChannel](https://webrtc.org/getting-started/data-channels)。

## 安全与隐私

- WebRTC DataChannel 使用浏览器实现的 DTLS 加密。安全码是会话 ID 与双方 SHA-256 证书指纹的散列摘要；双方核对并确认后才处理或发送文字快照。应通过可信渠道交换连接码，并认真核对安全码。
- 当前会话文字只存在于应用页面内存，未写入 localStorage、IndexedDB 或后端。结束连接、页面离开时清空 UI；不承诺擦除系统内存、剪贴板、输入法记录、截图或对方保存的副本。
- 对方可看到删改过程。网络很快时采用约 45 ms 合并最新快照，可能合并极短暂的中间变化；不是按键录像。输入法内部候选词无法读取，只同步系统提供的组合与输入事件。
- 单边最多 6000 个 UTF-16 单元，以原生 textarea 的长度限制为准，某些 emoji 占多个单元。数据包有长度和字段校验，忽略旧序号，拥塞时只保留最新待发快照。
- 姓名与聊天均以纯文本显示，不解析 HTML。程序没有聊天内容日志。STUN 提供者与对端可能获知网络地址。
- 刷新、锁屏、切换应用或网络可能断线。没有离线消息、账号找回、设备身份持久化或通讯录。重新连接需交换新码。
- 此原型未经独立安全审计。网页托管者控制客户端代码，安装来源与设备安全仍是信任基础。

## 代码

```text
src/protocol.js   连接码、帧校验、安全码
src/peer.js       WebRTC、确认门控、背压、心跳与生命周期
src/app.js        分屏交互、输入法事件、连接界面
index.html       页面
styles.css       桌面与窄屏布局
ios/             iOS 原生工程
android/         Android 原生工程
tests/           协议和会话安全边界测试
scripts/         静态构建、本地预览
```

验证范围见 [VALIDATION.md](./VALIDATION.md)。代码及工程以仓库提交为准；无发布许可证，当前默认保留权利。
