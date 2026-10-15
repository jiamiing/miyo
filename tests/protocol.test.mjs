import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSignal, decodeSignal, safetyCode, readFrame, codePointCount } from '../src/protocol.js';
const session = 'b931c05a-df2c-481f-8084-fb79b0b63fe9';
const fpA = Array(32).fill('AA').join(':');
const fpB = Array(32).fill('BB').join(':');
const sdp = fp => `v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 ${fp}\r\n`;
const invite = { type: 'offer', session, sdp: sdp(fpA), strict: true };
const frame = body => JSON.stringify({ v: 1, session, ...body });

test('connection code survives whitespace and preserves strict mode', () => {
  const code = encodeSignal(invite);
  assert.match(code, /^MIYO1\.[\w-]+$/);
  assert.deepEqual(decodeSignal(' \n' + code + '\n', 'offer'), { v: 1, ...invite });
});
test('rejects malformed signals, wrong role, oversized and missing fingerprints', () => {
  for (const code of ['hello', 'MIYO1.%%%bad', 'x'.repeat(50000), 'MIYO1.' + btoa('{}')]) assert.throws(() => decodeSignal(code, 'offer'));
  assert.throws(() => decodeSignal(encodeSignal(invite), 'answer'));
  assert.throws(() => encodeSignal({ ...invite, sdp: 'v=0\r\n' }));
  assert.throws(() => encodeSignal({ ...invite, strict: 'true' }));
});
test('safety code is symmetric and bound to both fingerprints and session', async () => {
  const first = await safetyCode(sdp(fpA), sdp(fpB), session);
  assert.match(first, /^[\dA-F]{4} [\dA-F]{4} [\dA-F]{4}$/);
  assert.equal(first, await safetyCode(sdp(fpB), sdp(fpA), session));
  assert.notEqual(first, await safetyCode(sdp(fpA), sdp(fpA), session));
  assert.notEqual(first, await safetyCode(sdp(fpA), sdp(fpB), session.replace('b931', 'b932')));
});
test('accepts Unicode, line breaks, empty snapshot and composition', () => {
  const text = '你好👩‍💻\nこんにちは';
  const packet = { type: 'snapshot', seq: 4, text, cursor: text.length, composing: true };
  assert.deepEqual(readFrame(frame(packet), session), { v: 1, session, ...packet });
  assert.ok(readFrame(frame({ ...packet, text: '', cursor: 0 }), session));
  assert.equal(codePointCount('你好😀'), 3);
});
test('rejects cross-session, replay metadata, oversized text and invalid frames', () => {
  const packet = { type: 'snapshot', seq: 1, text: 'x', cursor: 1, composing: false };
  for (const body of [{...packet, seq: -1}, {...packet, text: 'x'.repeat(6001)}, {...packet, cursor: 7}, {...packet, composing: 'true'}, {type: 'unknown'}, {type: 'hello', name: 'x'.repeat(25)}]) assert.equal(readFrame(frame(body), session), null);
  assert.equal(readFrame(frame(packet), 'other'), null);
  assert.equal(readFrame('null', session), null);
  assert.equal(readFrame(new ArrayBuffer(4), session), null);
  assert.equal(readFrame('x'.repeat(60001), session), null);
});
