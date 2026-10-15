import { VERSION, MAX_TEXT, decodeSignal, encodeSignal, safetyCode, readFrame } from './protocol.js';

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const HIGH_WATER = 64000;

export class MiyoPeer extends EventTarget {
  constructor() { super(); this.generation = 0; this.resetState(); }
  resetState() {
    this.authenticatedInvite = false;
    this.localVerified = false; this.remoteVerified = false; this.ready = false;
    this.seq = 0; this.remoteSeq = -1; this.pending = null; this.lastSeen = 0;
  }
  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  start(session, strict, name) {
    this.close();
    this.session = session; this.strict = strict; this.name = name.trim().slice(0, 24) || '密友';
    const generation = this.generation;
    const pc = new RTCPeerConnection({ iceServers: strict ? [] : STUN, bundlePolicy: 'max-bundle' });
    this.pc = pc;
    pc.ondatachannel = ({ channel }) => { if (this.pc === pc && !this.channel) this.attach(channel); else channel.close(); };
    pc.onconnectionstatechange = () => {
      if (generation !== this.generation) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        this.fail('连接已中断。请重新交换连接码；移动网络或防火墙可能阻止直连。');
      }
    };
    this.connectTimer = setTimeout(() => { if (!this.channel || this.channel.readyState !== 'open') this.fail('连接超时。请检查两人是否在线，或尝试同一 Wi-Fi；此版本没有 TURN 中继。'); }, 90000);
    this.emit('state', { state: 'connecting' });
    return pc;
  }
  async create(name, strict) {
    const pc = this.start(crypto.randomUUID(), strict, name);
    this.attach(pc.createDataChannel('miyo-v1', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await this.gather(pc);
    this.assertCurrent(pc);
    return encodeSignal({ ...pc.localDescription.toJSON(), session: this.session, strict });
  }
  adopt(channel, connection, session, name) {
    this.close();
    this.pc = connection; this.session = session; this.strict = false;
    this.name = name.trim().slice(0, 24) || '密友';
    this.authenticatedInvite = true;
    const generation = this.generation;
    connection.addEventListener('connectionstatechange', () => {
      if (generation === this.generation && ['failed', 'disconnected', 'closed'].includes(connection.connectionState)) this.fail('连接中断了，请重新分享邀请链接。');
    });
    this.attach(channel);
    queueMicrotask(() => { if (generation === this.generation) channel.onopen?.(); });
  }
  async join(code, name) {
    const signal = decodeSignal(code, 'offer');
    const pc = this.start(signal.session, signal.strict, name);
    await pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await this.gather(pc);
    this.assertCurrent(pc);
    return encodeSignal({ ...pc.localDescription.toJSON(), session: this.session, strict: this.strict });
  }
  async accept(code) {
    const signal = decodeSignal(code, 'answer');
    if (!this.pc || this.pc.signalingState !== 'have-local-offer') throw new Error('请先生成新的邀请连接码。');
    if (signal.session !== this.session || signal.strict !== this.strict) throw new Error('这不是本次邀请的回应码，请重新核对。');
    await this.pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
  }
  assertCurrent(pc) { if (pc !== this.pc || pc.signalingState === 'closed') throw new Error('本次连接已结束，请重新生成连接码。'); }
  gather(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', listener); pc.removeEventListener('connectionstatechange', closed);
        error ? reject(error) : resolve();
      };
      const listener = () => { if (pc.iceGatheringState === 'complete') finish(); };
      const closed = () => { if (pc.connectionState === 'closed') finish(new Error('连接已取消。')); };
      const timer = setTimeout(() => finish(pc.localDescription?.sdp.includes('a=candidate:') ? undefined : new Error('收集网络地址超时，请切换网络，或尝试严格模式。')), 22000);
      pc.addEventListener('icegatheringstatechange', listener); pc.addEventListener('connectionstatechange', closed);
    });
  }
  attach(channel) {
    this.channel = channel;
    const generation = this.generation;
    channel.bufferedAmountLowThreshold = 16000;
    channel.onbufferedamountlow = () => this.flush();
    channel.onopen = async () => {
      try {
        clearTimeout(this.connectTimer);
        const pc = this.pc;
        const code = await safetyCode(pc.localDescription.sdp, pc.remoteDescription.sdp, this.session);
        if (generation !== this.generation) return;
        this.lastSeen = Date.now();
        this.send('hello', { name: this.name });
        this.emit('state', { state: 'verifying' });
        if (this.authenticatedInvite) this.verify();
        else this.emit('verify', { code });
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastSeen > 35000) { this.fail('密友暂时离线了。请保持应用在前台，再重新连接。'); return; }
          this.send('ping', { time: Date.now() });
        }, 5000);
      } catch { if (generation === this.generation) this.fail('无法验证此连接，请重新交换连接码。'); }
    };
    channel.onmessage = ({ data }) => {
      if (generation !== this.generation) return;
      const frame = readFrame(data, this.session);
      if (!frame) return;
      this.lastSeen = Date.now();
      switch (frame.type) {
        case 'hello': this.emit('name', { name: frame.name || '密友' }); break;
        case 'verified': this.remoteVerified = true; this.checkReady(); break;
        case 'snapshot':
          if (!this.ready || frame.seq <= this.remoteSeq) return;
          this.remoteSeq = frame.seq; this.emit('text', frame); break;
        case 'ping': this.send('pong', { time: frame.time }); break;
        case 'pong': this.emit('latency', { ms: Math.max(0, Date.now() - frame.time) }); break;
      }
    };
    channel.onclose = () => { if (generation === this.generation) this.fail('连接已结束。重新见面时，再交换一组连接码。'); };
    channel.onerror = () => { if (generation === this.generation) this.fail('数据通道出现问题，请重新连接。'); };
  }
  verify() {
    if (this.channel?.readyState !== 'open') throw new Error('连接已断开，请重新连接。');
    this.localVerified = true; this.send('verified'); this.checkReady();
  }
  checkReady() {
    if (this.ready || !this.localVerified || !this.remoteVerified) return;
    this.ready = true; this.emit('state', { state: 'connected' });
  }
  send(type, body = {}) {
    if (this.channel?.readyState !== 'open') return false;
    try { this.channel.send(JSON.stringify({ v: VERSION, session: this.session, type, ...body })); return true; }
    catch { this.fail('文字传输已停止，请重新连接。'); return false; }
  }
  update(text, cursor, composing) {
    if (!this.ready || typeof text !== 'string' || text.length > MAX_TEXT) return;
    this.pending = { text, cursor, composing, seq: ++this.seq };
    if (!this.flushTimer) this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush(); }, 45);
  }
  flush() {
    if (!this.pending || !this.ready || this.channel?.readyState !== 'open') return;
    if (this.channel.bufferedAmount > HIGH_WATER) return;
    const frame = this.pending; this.pending = null;
    if (this.send('snapshot', frame)) this.emit('synced');
  }
  fail(message) { this.close(); this.emit('state', { state: 'disconnected', message }); }
  close() {
    this.generation++;
    clearTimeout(this.connectTimer); clearTimeout(this.flushTimer); clearInterval(this.heartbeat);
    this.flushTimer = null;
    if (this.channel) { this.channel.onclose = null; this.channel.onerror = null; this.channel.onmessage = null; this.channel.onopen = null; this.channel.onbufferedamountlow = null; this.channel.close(); }
    if (this.pc) { this.pc.onconnectionstatechange = null; this.pc.ondatachannel = null; this.pc.close(); }
    this.pc = null; this.channel = null; this.session = null; this.resetState();
  }
}
