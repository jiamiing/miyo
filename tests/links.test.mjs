import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSignalLink, readSignalLink } from '../src/links.js';
import { encodeSignal, decodeSignal } from '../src/protocol.js';
const signal = { type: 'offer', session: 'b931c05a-df2c-481f-8084-fb79b0b63fe9', strict: false,
  sdp: `v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 ${Array(32).fill('AB').join(':')}\r\n` + 'a=candidate:1 1 udp 2113937151 example.local 55555 typ host\r\n'.repeat(6) };
test('links compress repetitive SDP and keep all connection data in the fragment', async () => {
  const code = encodeSignal(signal);
  const link = await makeSignalLink(code, 'offer');
  assert.ok(link.length < code.length / 2);
  assert.equal(new URL(link).search, '');
  assert.equal(new URL(link).pathname, '/miyo/');
  assert.deepEqual(decodeSignal(await readSignalLink(link, 'offer'), 'offer'), { v: 1, ...signal });
});
test('rejects wrong direction, corrupt data, repeated keys and oversized payloads', async () => {
  const link = await makeSignalLink(encodeSignal(signal), 'offer');
  await assert.rejects(readSignalLink(link, 'answer'));
  await assert.rejects(readSignalLink('#invite=zbad', 'offer'));
  await assert.rejects(readSignalLink(link + '&invite=uAA', 'offer'));
  await assert.rejects(readSignalLink('x'.repeat(48001), 'offer'));
});
test('supports old codes, raw fallback and confirmation links', async () => {
  const code = encodeSignal({ ...signal, type: 'answer' });
  assert.equal(await readSignalLink(code, 'answer'), code);
  const link = await makeSignalLink(code, 'answer');
  assert.equal(await readSignalLink(link, 'answer'), code);
  const raw = btoa(JSON.stringify([signal.session, signal.sdp, 0])).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  assert.equal(await readSignalLink('#invite=u' + raw, 'offer'), encodeSignal(signal));
});
test('limits decompression to prevent oversized invitations', async () => {
  const blob = new Blob(['x'.repeat(100000)]);
  const bytes = new Uint8Array(await new Response(blob.stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const value = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  await assert.rejects(readSignalLink('#invite=z' + value, 'offer'));
});
