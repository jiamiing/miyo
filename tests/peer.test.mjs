import test from 'node:test';
import assert from 'node:assert/strict';
import { MiyoPeer } from '../src/peer.js';
const session = 'b931c05a-df2c-481f-8084-fb79b0b63fe9';
class Channel {
  readyState = 'open'; bufferedAmount = 0; sent = [];
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 'closed'; }
}
function setup() {
  const peer = new MiyoPeer(); peer.session = session;
  const channel = new Channel(); peer.attach(channel);
  const receive = frame => channel.onmessage({ data: JSON.stringify({ v: 1, session, ...frame }) });
  return { peer, channel, receive };
}
test('no text leaves or enters until both endpoints verify', () => {
  const { peer, channel, receive } = setup();
  const received = []; peer.addEventListener('text', e => received.push(e.detail.text));
  peer.update('private draft', 3, false); peer.flush();
  receive({ type: 'snapshot', seq: 1, text: 'too soon', cursor: 0, composing: false });
  assert.equal(channel.sent.length, 0); assert.equal(received.length, 0);
  peer.verify(); assert.equal(peer.ready, false);
  receive({ type: 'verified' }); assert.equal(peer.ready, true);
  peer.update('ready', 5, false); peer.flush();
  assert.equal(channel.sent.at(-1).text, 'ready');
  receive({ type: 'snapshot', seq: 2, text: 'hello', cursor: 5, composing: false });
  assert.deepEqual(received, ['hello']); peer.close();
});
test('ignores stale snapshots and malformed frames, renders latest ordered state', () => {
  const { peer, receive } = setup(); peer.verify(); receive({ type: 'verified' });
  const texts = []; peer.addEventListener('text', e => texts.push(e.detail.text));
  const packet = { type: 'snapshot', cursor: 0, composing: false };
  receive({ ...packet, seq: 4, text: 'new' }); receive({ ...packet, seq: 3, text: 'old' });
  receive({ ...packet, seq: 4, text: 'duplicate' }); receive({ ...packet, seq: 5, text: '', cursor: -1 });
  receive({ ...packet, seq: 5, text: '' });
  assert.deepEqual(texts, ['new', '']); peer.close();
});
test('backpressure coalesces drafts and ending clears pending text', () => {
  const { peer, channel, receive } = setup(); peer.verify(); receive({ type: 'verified' });
  channel.bufferedAmount = 100000;
  peer.update('a', 1, false); peer.flush(); peer.update('latest', 6, false); peer.flush();
  assert.equal(channel.sent.filter(x => x.type === 'snapshot').length, 0);
  channel.bufferedAmount = 0; channel.onbufferedamountlow();
  assert.equal(channel.sent.at(-1).text, 'latest');
  peer.update('must disappear', 0, false); peer.close();
  assert.equal(peer.pending, null); assert.equal(peer.ready, false); assert.equal(channel.readyState, 'closed');
});
