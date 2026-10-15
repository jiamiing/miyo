import test from 'node:test';
import assert from 'node:assert/strict';
import { newInvite, readInvite, makeProof, verifyProof } from '../src/invite-auth.js';
const sdp = byte => `v=0\r\na=fingerprint:sha-256 ${Array(32).fill(byte).join(':')}\r\n`;
test('short invitation carries an unguessable room and independent secret only in fragment', () => {
  const a = newInvite(), b = newInvite();
  assert.ok(a.url.length < 100);
  assert.notEqual(a.key, b.key); assert.notEqual(a.session, b.session);
  assert.equal(new URL(a.url).search, '');
  assert.equal(readInvite(a.url).session, a.session);
  assert.ok(!a.peerId.includes(a.key));
  for (const value of ['bad', 'https://example.com/#j=x', a.url + '&j=bad']) assert.throws(() => readInvite(value));
});
test('invitation proof authenticates certificates, role, session and secret', async () => {
  const invite = newInvite(); const a = sdp('AA'), b = sdp('BB');
  const proof = await makeProof(invite.key, invite.session, a, b, 'host');
  assert.equal(await verifyProof(proof, invite.key, invite.session, b, a, 'host'), true);
  assert.equal(await verifyProof(proof, invite.key, invite.session, a, b, 'guest'), false);
  assert.equal(await verifyProof(proof, newInvite().key, invite.session, a, b, 'host'), false);
  assert.equal(await verifyProof(proof, invite.key, newInvite().session, a, b, 'host'), false);
  assert.equal(await verifyProof(proof, invite.key, invite.session, a, sdp('CC'), 'host'), false);
});
