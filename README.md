# 密友 Miyo

两个人的实时打字空间。上面是对方，下面是自己，没有发送键。输入、删除和换行通过加密的 WebRTC DataChannel 同步。

**版本：0.2.0 原型。** 提供网页版和 Capacitor 8 的 iOS、Android 工程；没有账号系统、聊天后端、数据库、广告或分析追踪。不是已上架的商店应用。

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

1. 发起者点「邀请密友」，分享自动生成的邀请链接，保留当前页面。
2. 密友打开链接，点「加入，开始见面」。
3. 自动验证邀请并连接，直接打字。无需注册、填写名字、交换回应码或手动核对安全码。

线上邀请链接为80 个字符（随域名/路径变化），房间标识与独立的随机密钥放在 URL 的 `#` 片段中，不会提交给 GitHub Pages 或信令服务。等待邀请的有效期为 10 分钟，发起者需要保持页面打开。双方连接后关闭信令连接，这个邀请不能再接受新成员。拿到完整链接的人可以加入，因此只能交给密友，不能公开发布。

连接方式使用 PeerJS 免费公共信令服务 `0.peerjs.com`，不需要购买服务器、注册第三方账号或配置密钥。公共服务只交换连接信息，聊天正文通过两端的 WebRTC DataChannel 传输。公共服务的价格与可用性由服务提供者决定，当前版本没有可用性保证。

参考：[PeerJS 免费公共信令说明](https://peerjs.com/client/faq)。

### 备用方式

自动连接不可用时，展开「备用连接方式 · 不使用信令服务」。发起者创建压缩邀请链接；加入者打开它并生成确认链接，发回给发起者；最后双方核对安全码。旧版 `MIYO1.` 码仍能粘贴使用。

确认链接在同一个浏览器中打开时，会尝试通过本机 BroadcastChannel 交回原邀请页面。原页面已关闭、换了浏览器或系统冻结了原页面时，需要重新邀请。此方式不会把连接信息交给信令服务，但链接比自动模式长。

## 「无需服务器」的边界

| 模式 | 依赖 | 实际限制 |
| --- | --- | --- |
| 自动邀请（默认） | 免费 PeerJS 公共信令，公共 STUN 辅助穿透；无需自建后端 | 公共服务需要可访问；部分 NAT、防火墙或移动网络阻止直连 |
| 备用压缩链接 | 无信令服务，手动互发两条链接；默认公共 STUN | 操作步骤更多，仍可能无法跨网直连 |
| 备用 + 完全关闭辅助服务 | `iceServers: []`，手动交换压缩链接 | 只适合网络地址相互可达的设备，局域网隔离和浏览器隐私策略也可能使连接失败 |

当前没有 TURN 中继、离线消息、推送、后台常驻或断线自动重连。网页仍由本仓库的 GitHub Pages 提供，原生安装包内置资源。两人需要同时在线。

参考：[WebRTC 连接与 STUN/TURN](https://webrtc.org/getting-started/peer-connections)。

## 安全与隐私

- WebRTC DataChannel 使用浏览器实现的 DTLS 加密。自动邀请携带独立的 128 位随机密钥，通过 HMAC-SHA-256 验证双方证书指纹、会话和主客角色。该密钥不经过信令服务；通过验证并收到对方确认前，不开放打字。链接须经可信渠道分享。备用方式仍由双方核对证书安全码。
- 当前会话文字只存在于应用页面内存，未写入 localStorage、IndexedDB 或后端。结束连接、页面离开时清空 UI；不承诺擦除系统内存、剪贴板、输入法记录、截图或对方保存的副本。
- 对方可看到删改过程。网络很快时采用约 45 ms 合并最新快照，可能合并极短暂的中间变化；不是按键录像。输入法内部候选词无法读取，只同步系统提供的组合与输入事件。
- 单边最多 6000 个 UTF-16 单元，以原生 textarea 的长度限制为准，某些 emoji 占多个单元。数据包有长度和字段校验，忽略旧序号，拥塞时只保留最新待发快照。
- 姓名与聊天均以纯文本显示，不解析 HTML。程序没有聊天内容日志。信令与 STUN 提供者可能获知网络地址、房间标识与连接元数据，对端可获知直连地址。
- 刷新、锁屏、切换应用或网络可能断线。没有离线消息、账号找回、设备身份持久化或通讯录。重新连接需分享新的邀请。
- 此原型未经独立安全审计。网页托管者控制客户端代码，安装来源与设备安全仍是信任基础。

## 代码

```text
src/protocol.js   连接码、帧校验、安全码
src/peer.js       WebRTC、确认门控、背压、心跳与生命周期
src/quick.js      免费公共信令配对与一次性邀请
src/invite-auth.js 邀请密钥与证书认证
src/links.js      备用链接压缩与解析
vendor/          本地固定版本的 PeerJS 与许可证
src/app.js        分屏交互、输入法事件、连接界面
index.html       页面
styles.css       桌面与窄屏布局
ios/             iOS 原生工程
android/         Android 原生工程
tests/           协议和会话安全边界测试
scripts/         静态构建、本地预览
```

验证范围见 [VALIDATION.md](./VALIDATION.md)。代码及工程以仓库提交为准；无发布许可证，当前默认保留权利。
