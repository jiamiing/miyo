import { fingerprint } from './protocol.js';
import { PUBLIC_URL } from './links.js';
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const bytes = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));

export function newInvite(base = PUBLIC_URL) {
  const id = crypto.getRandomValues(new Uint8Array(16));
  id[6] = (id[6] & 15) | 64; id[8] = (id[8] & 63) | 128;
  const key = base64(crypto.getRandomValues(new Uint8Array(16)));
  const url = new URL(base); url.hash = `j=${base64(id)}.${key}`; url.search = '';
  return { ...readInvite(url.href), url: url.href };
}

export function readInvite(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('请打开完整的密友邀请链接。'); }
  if (input.length > 1000) throw new Error('邀请链接格式不正确。');
  const params = new URLSearchParams(url.hash.slice(1));
  const value = params.get('j');
  if (!value || params.getAll('j').length !== 1 || !/^[\w-]{22}\.[\w-]{22}$/.test(value)) throw new Error('邀请链接不完整，请让密友重新分享。');
  const [room, key] = value.split('.');
  const id = bytes(room); const secret = bytes(key);
  if (id.length !== 16 || secret.length !== 16 || base64(id) !== room || base64(secret) !== key) throw new Error('邀请链接格式不正确。');
  const hex = Array.from(id, n => n.toString(16).padStart(2, '0')).join('');
  const session = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  return { session, key, peerId: `miyo-${room}`, room };
}

function proofInput(session, local, remote, role) {
  const fingerprints = [fingerprint(local), fingerprint(remote)];
  if (fingerprints.some(x => !x) || !['host', 'guest'].includes(role)) throw new Error('连接无法验证。');
  return new TextEncoder().encode(JSON.stringify(['miyo-invite-v1', session, fingerprints.sort(), role]));
}
async function hmacKey(key) { return crypto.subtle.importKey('raw', bytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function makeProof(key, session, local, remote, role) {
  return base64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key), proofInput(session, local, remote, role))));
}
export async function verifyProof(proof, key, session, local, remote, role) {
  if (typeof proof !== 'string' || !/^[\w-]{43}$/.test(proof)) return false;
  try { return await crypto.subtle.verify('HMAC', await hmacKey(key), bytes(proof), proofInput(session, local, remote, role)); }
  catch { return false; }
}
