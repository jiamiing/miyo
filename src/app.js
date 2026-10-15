import { MiyoPeer } from './peer.js';
import { codePointCount } from './protocol.js';

const $ = id => document.getElementById(id);
const peer = new MiyoPeer();
let composing = false;
let activityTimer;
let toastTimer;
let busy = false;
let state = 'idle';
let generation = 0;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800); }
function status(message, error = false) { $('dialog-status').textContent = message; $('dialog-status').dataset.error = String(error); }
function setTab(host) {
  $('host-tab').setAttribute('aria-selected', String(host)); $('join-tab').setAttribute('aria-selected', String(!host));
  $('host-panel').hidden = !host; $('join-panel').hidden = host;
}
function clearSignalFields() { for (const id of ['invite-output', 'answer-output', 'answer-input', 'invite-input']) $(id).value = ''; }
function resetUi() {
  generation++;
  clearTimeout(activityTimer); composing = false; busy = false;
  $('editor').value = ''; $('editor').disabled = true; $('clear-button').disabled = true;
  $('peer-text').replaceChildren();
  const note = document.createElement('span'); note.className = 'empty-note'; note.textContent = '等连接好了，对方写下的每一个字，都会出现在这里。'; $('peer-text').append(note);
  $('peer-name').textContent = '你的密友'; $('peer-status').textContent = '等一个人，来这里';
  $('self-count').textContent = '0 / 6000'; $('peer-count').textContent = '0 字';
  $('peer-activity').textContent = '不用等待「对方正在输入」'; $('sync-status').textContent = '没有发送键，也不用按回车。';
  $('self-status').textContent = '你的文字，会直接出现在 TA 那边';
  $('connection-detail').textContent = '两个人 · 同一刻'; $('security-label').textContent = '连接后加密传输';
  $('verify-panel').hidden = true; $('host-codes').hidden = true; $('join-codes').hidden = true;
  $('host-tab').disabled = false; $('join-tab').disabled = false; $('strict-mode').disabled = false; $('nickname').disabled = false;
  $('create-button').disabled = false; $('join-button').disabled = false; $('accept-button').disabled = false;
  $('verify-button').disabled = false; $('verify-button').textContent = '码一致，开始交流';
  clearSignalFields(); setTab(true); $('safety-code').textContent = '';
}
function setState(next, message) {
  state = next;
  $('status').dataset.state = next;
  $('status-label').textContent = ({ idle: '还未连接', connecting: '正在连接', verifying: '核对安全码', connected: '彼此在线', disconnected: '连接已断开' })[next];
  $('connect-button').textContent = next === 'connected' ? '查看连接 ↗' : next === 'verifying' ? '核对安全码 ↗' : next === 'connecting' ? '继续连接 ↗' : '连接一位密友 ↗';
  $('disconnect-button').hidden = ['idle', 'disconnected'].includes(next);
  if (next === 'disconnected') { resetUi(); status(message || '连接已结束。', true); toast(message || '连接已结束'); }
}
async function operation(action, progress) {
  if (busy) return;
  busy = true; const token = generation; status(progress);
  for (const id of ['create-button', 'join-button', 'accept-button']) $(id).disabled = true;
  try { await action(); }
  catch (error) {
    if (token !== generation) return;
    if (state !== 'connected') { peer.close(); setState('disconnected', error.message || '操作失败，请重新连接。'); }
    status(error.message || '操作失败，请重新连接。', true);
  } finally {
    if (token === generation) { busy = false; for (const id of ['create-button', 'join-button', 'accept-button']) $(id).disabled = false; }
  }
}
function freezeSetup() { $('nickname').disabled = true; $('strict-mode').disabled = true; $('host-tab').disabled = true; $('join-tab').disabled = true; }
function update() {
  $('self-count').textContent = `${$('editor').value.length} / 6000`;
  peer.update($('editor').value, $('editor').selectionStart, composing);
  if (peer.ready) $('sync-status').textContent = '正在同步…';
}

$('connect-button').onclick = () => { if (!$('connection-dialog').open) $('connection-dialog').showModal(); };
$('close-dialog').onclick = () => $('connection-dialog').close();
$('help-button').onclick = () => $('help-dialog').showModal();
$('close-help').onclick = () => $('help-dialog').close();
$('host-tab').onclick = () => setTab(true); $('join-tab').onclick = () => setTab(false);
for (const [id, host] of [['host-tab', true], ['join-tab', false]]) $(id).onkeydown = event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? true : event.key === 'End' ? false : !host; setTab(next); $(next ? 'host-tab' : 'join-tab').focus(); }
};
$('strict-mode').onchange = () => { $('network-note').textContent = $('strict-mode').checked ? '本次连接不请求 STUN 或 TURN。仅靠两台设备可达的网络地址建立连接，跨网络经常无法成功。' : '默认借助公共 STUN 寻找直连地址，不传输聊天内容。没有 TURN 中继，部分网络可能连接失败。'; };
$('create-button').onclick = () => operation(async () => {
  freezeSetup();
  const code = await peer.create($('nickname').value, $('strict-mode').checked);
  $('invite-output').value = code; $('host-codes').hidden = false;
  $('self-name').textContent = $('nickname').value.trim() || '我';
  status('邀请已准备好。交给密友后，把对方的回应码粘贴回来。');
}, '正在收集连接地址，通常需要几秒…');
$('join-button').onclick = () => operation(async () => {
  const code = await peer.join($('invite-input').value, $('nickname').value);
  freezeSetup(); $('answer-output').value = code; $('join-codes').hidden = false;
  $('self-name').textContent = $('nickname').value.trim() || '我';
  status('回应码已准备好。交还给密友，然后等待双方连接。');
}, '正在准备回应码…');
$('accept-button').onclick = () => operation(async () => { await peer.accept($('answer-input').value); status('回应码已接收，正在尝试直连…'); }, '正在核对回应码…');
for (const [button, output] of [['copy-invite', 'invite-output'], ['copy-answer', 'answer-output']]) $(button).onclick = async () => {
  try { await navigator.clipboard.writeText($(output).value); toast('连接码已复制'); }
  catch { $(output).focus(); $(output).select(); toast('请长按或按复制快捷键，复制已选中的连接码'); }
};
$('verify-button').onclick = () => {
  try { peer.verify(); $('verify-button').disabled = true; $('verify-button').textContent = '已确认，等待密友…'; status('你已确认。双方确认后，就可以开始打字。'); }
  catch (error) { status(error.message, true); }
};
function endConnection() { peer.close(); setState('disconnected', '这次连接已结束，页面中的文字已清空。'); }
$('disconnect-button').onclick = endConnection; $('reject-button').onclick = endConnection;
$('clear-button').onclick = () => { $('editor').value = ''; update(); $('editor').focus(); };
$('editor').addEventListener('input', update);
$('editor').addEventListener('compositionstart', () => { composing = true; update(); });
$('editor').addEventListener('compositionupdate', update);
$('editor').addEventListener('compositionend', () => { composing = false; update(); });

peer.addEventListener('state', ({ detail }) => {
  setState(detail.state, detail.message);
  if (detail.state === 'connected') {
    $('editor').disabled = false; $('clear-button').disabled = false;
    $('editor').placeholder = '想说什么，就从这里开始。';
    $('peer-text').replaceChildren(); $('peer-status').textContent = '在线，就在另一边';
    $('self-status').textContent = '写下即共享 · 删改也会同步'; $('connection-detail').textContent = peer.strict ? '设备直连 · 严格模式' : '设备直连 · WebRTC';
    $('security-label').textContent = '端到端加密 · 已核对'; $('sync-status').textContent = '已连接，写下的字会直接共享。';
    clearSignalFields(); $('connection-dialog').close(); $('editor').focus();
  }
});
peer.addEventListener('verify', ({ detail }) => {
  $('host-panel').hidden = true; $('join-panel').hidden = true; $('verify-panel').hidden = false;
  $('safety-code').textContent = detail.code;
  status('已建立加密通道。请与密友核对上面的安全码。');
  if (!$('connection-dialog').open) $('connection-dialog').showModal();
});
peer.addEventListener('name', ({ detail }) => { $('peer-name').textContent = detail.name; });
peer.addEventListener('text', ({ detail }) => {
  const area = $('peer-text'); const follow = area.scrollHeight - area.scrollTop - area.clientHeight < 70;
  area.textContent = detail.text;
  if (follow) area.scrollTop = area.scrollHeight;
  $('peer-count').textContent = `${codePointCount(detail.text)} 字`;
  $('peer-status').textContent = detail.composing ? '正在斟酌下一个字…' : '正在写给你';
  $('peer-activity').textContent = detail.composing ? '正在使用输入法' : '刚刚更新';
  clearTimeout(activityTimer); activityTimer = setTimeout(() => { $('peer-status').textContent = '在线，就在另一边'; $('peer-activity').textContent = '文字已同步'; }, 1600);
});
peer.addEventListener('synced', () => { $('sync-status').textContent = '已交给加密通道'; });
peer.addEventListener('latency', ({ detail }) => { $('connection-detail').textContent = `设备直连 · ${detail.ms} ms`; });
window.addEventListener('pagehide', () => { peer.close(); resetUi(); setState('idle'); });
window.addEventListener('offline', () => { if (['connecting', 'verifying', 'connected'].includes(state)) { peer.close(); setState('disconnected', '网络已断开，请恢复网络后重新连接。'); } });
document.addEventListener('visibilitychange', () => { if (state === 'connected') $('self-status').textContent = document.hidden ? '应用已切到后台，系统可能暂停连接' : '写下即共享 · 删改也会同步'; });
if (!window.RTCPeerConnection || !window.crypto?.subtle) { $('connect-button').disabled = true; $('status-label').textContent = '请使用 HTTPS 或本机 localhost'; }
