import '../vendor/peerjs.min.js';
import { newInvite, readInvite, makeProof, verifyProof } from './invite-auth.js';
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] };

class ChannelAdapter {
  constructor(connection) {
    this.connection = connection;
    connection.on('data', data => this.onmessage?.({ data }));
    connection.on('close', () => this.onclose?.());
    connection.on('error', () => this.onerror?.());
    connection.dataChannel.addEventListener('bufferedamountlow', () => this.onbufferedamountlow?.());
  }
  get readyState() { return this.connection.open ? 'open' : 'closed'; }
  get bufferedAmount() { return this.connection.dataChannel.bufferedAmount; }
  set bufferedAmountLowThreshold(value) { this.connection.dataChannel.bufferedAmountLowThreshold = value; }
  send(data) { this.connection.send(data); }
  close() { this.connection.close(); }
}

export class QuickInvite extends EventTarget {
  constructor(peer) { super(); this.peer = peer; this.generation = 0; }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async open(id) {
    const generation = this.generation;
    const client = new window.Peer(id, { host: '0.peerjs.com', port: 443, secure: true, key: 'peerjs', config: ICE, debug: 0 });
    this.client = client;
    client.on('error', error => {
      if (generation !== this.generation) return;
      const message = error.type === 'peer-unavailable' ? '邀请已经失效，或对方离开了页面。请让 TA 重新分享邀请。' : '暂时联系不上连接服务。请重试，或展开备用连接方式。';
      this.emit('error', { message });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接服务没有响应，请重试或使用备用连接。')), 18000);
      client.once('open', () => { clearTimeout(timer); generation === this.generation ? resolve() : reject(new Error('邀请已取消。')); });
      client.once('error', () => { clearTimeout(timer); reject(new Error('暂时联系不上连接服务，请重试或使用备用连接。')); });
    });
    return client;
  }
  async host(name, base) {
    this.close(); const generation = this.generation;
    const invite = newInvite(base); this.invite = invite;
    const client = await this.open(invite.peerId);
    if (generation !== this.generation) throw new Error('邀请已取消。');
    client.on('connection', connection => {
      if (generation !== this.generation || this.active || connection.metadata?.session !== invite.session || connection.serialization !== 'raw') { connection.close(); return; }
      this.active = connection;
      this.authenticate(connection, invite, name, 'host', generation);
    });
    this.expiry = setTimeout(() => { if (!this.peer.ready && generation === this.generation) { this.close(); this.emit('error', { message: '邀请已过期，请重新邀请一次。' }); } }, 600000);
    return invite.url;
  }
  async join(link, name) {
    const invite = readInvite(link);
    this.close(); const generation = this.generation;
    this.invite = invite;
    const client = await this.open(`miyo-guest-${crypto.randomUUID()}`);
    if (generation !== this.generation) throw new Error('邀请已取消。');
    const connection = client.connect(invite.peerId, { reliable: true, serialization: 'raw', metadata: { session: invite.session } });
    this.active = connection;
    this.authenticate(connection, invite, name, 'guest', generation);
    this.expiry = setTimeout(() => { if (!this.peer.ready && generation === this.generation) { this.close(); this.emit('error', { message: '暂时没连上。请确认对方仍在页面，或使用备用连接。' }); } }, 45000);
  }
  authenticate(connection, invite, name, role, generation) {
    let sent = false; let verified = false; let activated = false; let proofSeen = false; const backlog = [];
    const current = () => generation === this.generation && this.active === connection;
    const fail = () => { if (!current() || activated) return; clearTimeout(timer); connection.close(); this.active = null; this.emit('error', { message: '邀请验证失败。请确认链接来自你的密友，并重新邀请。' }); };
    const activate = () => {
      if (!current() || activated || !sent || !verified) return;
      activated = true; clearTimeout(timer); clearTimeout(this.expiry);
      connection.off('data', receive);
      const channel = new ChannelAdapter(connection);
      this.peer.adopt(channel, connection.peerConnection, invite.session, name);
      for (const data of backlog) channel.onmessage?.({ data });
      this.client.disconnect();
      this.emit('authenticated', {});
    };
    const receive = async data => {
      if (!current() || activated) return;
      if (typeof data !== 'string' || data.length > 60000) { fail(); return; }
      let frame; try { frame = JSON.parse(data); } catch { fail(); return; }
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) { fail(); return; }
      if (frame.type !== 'miyo-auth') {
        if (backlog.length < 4 && frame.v === 1 && frame.session === invite.session && ['hello', 'verified', 'ping', 'pong'].includes(frame.type)) backlog.push(data);
        else fail();
        return;
      }
      if (proofSeen || data.length > 1024 || frame.session !== invite.session || frame.role !== (role === 'host' ? 'guest' : 'host')) { fail(); return; }
      proofSeen = true;
      const pc = connection.peerConnection;
      verified = await verifyProof(frame.proof, invite.key, invite.session, pc.localDescription.sdp, pc.remoteDescription.sdp, role === 'host' ? 'guest' : 'host');
      if (!verified) { fail(); return; }
      activate();
    };
    connection.on('data', receive);
    const timer = setTimeout(fail, 20000);
    connection.on('error', fail);
    connection.on('open', async () => {
      try {
        if (!current()) return;
        const pc = connection.peerConnection;
        const proof = await makeProof(invite.key, invite.session, pc.localDescription.sdp, pc.remoteDescription.sdp, role);
        if (!current()) return;
        connection.send(JSON.stringify({ type: 'miyo-auth', session: invite.session, role, proof }));
        sent = true; activate();
      } catch { fail(); }
    });
  }
  close() {
    this.generation++; clearTimeout(this.expiry); this.client?.destroy();
    this.client = null; this.active = null; this.invite = null;
  }
}
