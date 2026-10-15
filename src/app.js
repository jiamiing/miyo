import { MiyoPeer } from './peer.js';
import { QuickInvite } from './quick.js';
import { readInvite } from './invite-auth.js';
import { codePointCount, decodeSignal } from './protocol.js';
import { makeSignalLink, readSignalLink, PUBLIC_URL } from './links.js';

const $ = id => document.getElementById(id);
const peer = new MiyoPeer();
const quick = new QuickInvite(peer);
const actionIds = ['quick-create', 'quick-join', 'quick-import', 'create-button', 'join-button', 'accept-button'];
let composing = false, activityTimer, toastTimer, busy = false, state = 'idle', generation = 0, incomingLink = '';
const handoff = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('miyo-manual-invite-v1') : null;
const baseURL = /^https?:$/.test(location.protocol) ? new URL('./', location.href).href : PUBLIC_URL;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200); }
function status(message, error = false) { $('dialog-status').textContent = message; $('dialog-status').dataset.error = String(error); }
function flow(id) { for (const name of ['quick-start', 'quick-waiting', 'quick-incoming', 'quick-progress', 'quick-connected']) $(name).hidden = name !== id; document.querySelector('.quick-settings').hidden = !['quick-start', 'quick-incoming', 'manual'].includes(id); }
function setTab(host) {
  $('host-tab').setAttribute('aria-selected', String(host)); $('join-tab').setAttribute('aria-selected', String(!host));
  $('host-panel').hidden = !host; $('join-panel').hidden = host;
}
function clearSignalFields() { for (const id of ['invite-output', 'answer-output', 'answer-input', 'invite-input', 'quick-output', 'quick-input']) $(id).value = ''; }
function clearFragment() { if (location.hash) history.replaceState(null, '', location.pathname + location.search); }
function resetUi() {
  generation++; clearTimeout(activityTimer); composing = false; busy = false;
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
  for (const id of actionIds) $(id).disabled = false;
  $('verify-button').disabled = false; $('verify-button').textContent = '码一致，开始交流';
  $('quick-output').hidden = true; $('manual-options').hidden = false;
  $('connection-subtitle').textContent = '发一个链接，对方点开就能加入。';
  clearSignalFields(); setTab(true); flow('quick-start'); $('safety-code').textContent = '';
}
function setState(next, message) {
  state = next; $('status').dataset.state = next;
  $('status-label').textContent = ({ idle: '还未连接', connecting: '正在连接', verifying: '正在验证邀请', connected: '彼此在线', disconnected: '连接已断开' })[next];
  $('connect-button').textContent = next === 'connected' ? '查看连接 ↗' : next === 'verifying' ? '正在连接 ↗' : next === 'connecting' ? '查看邀请 ↗' : '邀请密友 ↗';
  $('disconnect-button').hidden = ['idle', 'disconnected'].includes(next);
  if (next === 'disconnected') { resetUi(); incomingLink = ''; clearFragment(); status(message || '连接已结束。', true); toast(message || '连接已结束'); }
}
async function operation(action, progress) {
  if (busy) return; busy = true; const token = generation; status(progress);
  for (const id of actionIds) $(id).disabled = true;
  try { await action(); }
  catch (error) {
    if (token !== generation) return;
    peer.close(); quick.close(); setState('disconnected', /[\u4e00-\u9fff]/.test(error.message || '') ? error.message : '连接暂时没准备好，请重新邀请或使用备用方式。');
  } finally {
    if (token === generation) { busy = false; for (const id of actionIds) $(id).disabled = false; }
  }
}
function freezeSetup() { $('nickname').disabled = true; $('strict-mode').disabled = true; $('host-tab').disabled = true; $('join-tab').disabled = true; $('self-name').textContent = $('nickname').value.trim() || '我'; }
function update() { $('self-count').textContent = `${$('editor').value.length} / 6000`; peer.update($('editor').value, $('editor').selectionStart, composing); if (peer.ready) $('sync-status').textContent = '正在同步…'; }
function createQuick() { return operation(async () => {
  freezeSetup(); peer.close(); setState('connecting'); flow('quick-progress');
  const url = await quick.host($('nickname').value, baseURL);
  $('quick-output').value = url; flow('quick-waiting'); status('邀请准备好了，发给 TA 就可以。');
}, '正在准备邀请…'); }
function joinQuick() { return operation(async () => {
  freezeSetup(); flow('quick-progress'); setState('connecting');
  await quick.join(incomingLink, $('nickname').value); clearFragment(); status('已找到邀请，正在自动连接…');
}, '正在和密友连接…'); }
function showIncoming(link) {
  readInvite(link); incomingLink = link; flow('quick-incoming'); $('manual-options').hidden = true;
  $('connection-subtitle').textContent = '打开邀请，和 TA 一起开始打字。'; status('');
  if (!$('connection-dialog').open) $('connection-dialog').showModal();
}

$('connect-button').onclick = () => { if (!$('connection-dialog').open) $('connection-dialog').showModal(); if (['idle', 'disconnected'].includes(state) && !incomingLink) createQuick(); };
$('quick-create').onclick = createQuick; $('quick-join').onclick = joinQuick;
$('paste-link').onclick = () => { $('quick-paste').hidden = false; $('quick-input').focus(); };
$('quick-import').onclick = () => { try { showIncoming($('quick-input').value.trim()); } catch (error) { status(error.message, true); } };
$('close-dialog').onclick = () => $('connection-dialog').close(); $('back-to-chat').onclick = () => $('connection-dialog').close();
$('help-button').onclick = () => $('help-dialog').showModal(); $('close-help').onclick = () => $('help-dialog').close();
$('host-tab').onclick = () => setTab(true); $('join-tab').onclick = () => setTab(false);
for (const [id, host] of [['host-tab', true], ['join-tab', false]]) $(id).onkeydown = event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? true : event.key === 'End' ? false : !host; setTab(next); $(next ? 'host-tab' : 'join-tab').focus(); }
};
$('create-button').onclick = () => operation(async () => {
  quick.close(); freezeSetup(); flow('manual');
  const code = await peer.create($('nickname').value, $('strict-mode').checked);
  $('invite-output').value = await makeSignalLink(code, 'offer', baseURL); $('host-codes').hidden = false;
  status('把这条备用邀请链接发给密友，保留这个页面等待对方的确认链接。');
}, '正在准备备用邀请…');
$('join-button').onclick = () => operation(async () => {
  const invite = await readSignalLink($('invite-input').value, 'offer');
  quick.close(); const code = await peer.join(invite, $('nickname').value);
  freezeSetup(); flow('manual'); $('answer-output').value = await makeSignalLink(code, 'answer', baseURL); $('join-codes').hidden = false;
  status('把确认链接发回密友，等 TA 打开后即可核对连接。');
}, '正在生成确认链接…');
async function acceptManual(input) { const code = await readSignalLink(input, 'answer'); await peer.accept(code); status('已收到确认，正在直连…'); }
$('accept-button').onclick = () => operation(() => acceptManual($('answer-input').value), '正在连接…');

async function copy(output, label) {
  try { await navigator.clipboard.writeText($(output).value); toast(label); }
  catch { $(output).hidden = false; $(output).focus(); $(output).select(); toast('请长按或使用复制快捷键，复制已选中的链接'); }
}
for (const [button, output] of [['copy-invite', 'invite-output'], ['copy-answer', 'answer-output'], ['copy-quick', 'quick-output']]) $(button).onclick = () => copy(output, '链接已复制，发给密友即可');
$('share-quick').onclick = async () => {
  const url = $('quick-output').value;
  if (navigator.share) {
    try { await navigator.share({ title: '来密友，和我一起打字', text: '点开邀请，就能看见彼此写下的字。', url }); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  await copy('quick-output', '邀请链接已复制，发给密友即可');
};
$('verify-button').onclick = () => { try { peer.verify(); $('verify-button').disabled = true; $('verify-button').textContent = '已确认，等密友…'; status('双方确认后，就可以开始打字。'); } catch (error) { status(error.message, true); } };
function endConnection() { peer.close(); quick.close(); setState('disconnected', '这次连接已结束，页面中的文字已清空。'); }
$('disconnect-button').onclick = endConnection; $('reject-button').onclick = endConnection;
$('clear-button').onclick = () => { $('editor').value = ''; update(); $('editor').focus(); };
$('editor').addEventListener('input', update);
$('editor').addEventListener('compositionstart', () => { composing = true; update(); });
$('editor').addEventListener('compositionupdate', update);
$('editor').addEventListener('compositionend', () => { composing = false; update(); });

quick.addEventListener('error', ({ detail }) => { peer.close(); quick.close(); setState('disconnected', detail.message); });
peer.addEventListener('state', ({ detail }) => {
  setState(detail.state, detail.message);
  if (detail.state === 'disconnected') quick.close();
  if (detail.state === 'connected') {
    $('editor').disabled = false; $('clear-button').disabled = false; $('editor').placeholder = '想说什么，就从这里开始。';
    $('peer-text').replaceChildren(); $('peer-status').textContent = '在线，就在另一边';
    $('self-status').textContent = '写下即共享 · 删改也会同步'; $('connection-detail').textContent = peer.strict ? '设备直连 · 严格模式' : '设备直连 · WebRTC';
    $('security-label').textContent = peer.authenticatedInvite ? '端到端加密 · 邀请已验证' : '端到端加密 · 已核对';
    $('sync-status').textContent = '已连接，写下的字会直接共享。';
    $('verify-panel').hidden = true; $('manual-options').hidden = true; flow('quick-connected'); $('connection-subtitle').textContent = '就在这里，写给彼此。'; status('已连接，可以直接开始打字。');
    clearSignalFields(); clearFragment(); incomingLink = ''; $('connection-dialog').close(); $('editor').focus();
  }
});
peer.addEventListener('verify', ({ detail }) => {
  flow('manual'); $('manual-options').hidden = true; $('verify-panel').hidden = false; $('safety-code').textContent = detail.code;
  $('connection-subtitle').textContent = '备用连接需要双方核对安全码。'; status('请和密友核对相同的安全码。');
  if (!$('connection-dialog').open) $('connection-dialog').showModal();
});
peer.addEventListener('name', ({ detail }) => { $('peer-name').textContent = detail.name; });
peer.addEventListener('text', ({ detail }) => {
  const area = $('peer-text'); const follow = area.scrollHeight - area.scrollTop - area.clientHeight < 70;
  area.textContent = detail.text; if (follow) area.scrollTop = area.scrollHeight;
  $('peer-count').textContent = `${codePointCount(detail.text)} 字`; $('peer-status').textContent = detail.composing ? '正在斟酌下一个字…' : '正在写给你';
  $('peer-activity').textContent = detail.composing ? '正在使用输入法' : '刚刚更新';
  clearTimeout(activityTimer); activityTimer = setTimeout(() => { $('peer-status').textContent = '在线，就在另一边'; $('peer-activity').textContent = '文字已同步'; }, 1600);
});
peer.addEventListener('synced', () => { $('sync-status').textContent = '已交给加密通道'; });
peer.addEventListener('latency', ({ detail }) => { $('connection-detail').textContent = `设备直连 · ${detail.ms} ms`; });
window.addEventListener('pagehide', () => { peer.close(); quick.close(); handoff?.close(); resetUi(); setState('idle'); });
window.addEventListener('offline', () => { if (['connecting', 'verifying', 'connected'].includes(state)) { peer.close(); quick.close(); setState('disconnected', '网络已断开，请恢复后重新邀请。'); } });
document.addEventListener('visibilitychange', () => { if (state === 'connected') $('self-status').textContent = document.hidden ? '应用已切到后台，系统可能暂停连接' : '写下即共享 · 删改也会同步'; });

async function handleLink() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('j')) { try { showIncoming(location.href); } catch (error) { status(error.message, true); $('connection-dialog').showModal(); } }
  else if (hash.has('invite')) {
    resetUi(); flow('manual'); $('manual-options').open = true; setTab(false); $('invite-input').value = location.href;
    $('connection-dialog').showModal(); status('这是备用邀请。点「生成确认链接」，把它发回给密友。');
  } else if (hash.has('reply')) {
    $('connection-dialog').showModal(); flow('manual');
    if (peer.pc?.signalingState === 'have-local-offer') operation(() => acceptManual(location.href), '正在接收确认…');
    else {
      handoff?.postMessage({ type: 'reply', link: location.href });
      status('请保持原邀请页面打开。如果它还在同一个浏览器中，确认链接会自动交给它。也可以把此链接粘贴到原页面。');
    }
    clearFragment();
  }
}
if (handoff) handoff.onmessage = event => {
  if (event.data?.type === 'reply' && typeof event.data.link === 'string' && event.data.link.length <= 48000 && peer.pc?.signalingState === 'have-local-offer' && !busy) readSignalLink(event.data.link, 'answer').then(code => { if (decodeSignal(code, 'answer').session === peer.session && !busy) operation(() => peer.accept(code), '已收到密友的确认链接…'); }).catch(() => {});
};
window.addEventListener('hashchange', handleLink);
if (!window.RTCPeerConnection || !window.crypto?.subtle) { $('connect-button').disabled = true; $('status-label').textContent = '请使用 HTTPS 或本机 localhost'; }
else handleLink();
