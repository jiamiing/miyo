export const VERSION = 1;
export const MAX_TEXT = 6000;
export const MAX_PACKET_BYTES = 60000;
const MAX_CODE = 48000;
const SESSION = /^[a-f0-9-]{36}$/i;

export function encodeSignal({ type, sdp, session, strict }) {
  const value = { v: VERSION, type, sdp, session, strict };
  validateSignal(value);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return 'MIYO1.' + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeSignal(code, expectedType) {
  if (typeof code !== 'string' || code.length > MAX_CODE) throw new Error('连接码太长或格式错误。');
  const compact = code.replace(/\s/g, '');
  if (!compact.startsWith('MIYO1.')) throw new Error('请粘贴完整的 MIYO1. 连接码。');
  let value;
  try {
    const raw = atob(compact.slice(6).replaceAll('-', '+').replaceAll('_', '/'));
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
  } catch { throw new Error('连接码无法读取，请让密友重新复制。'); }
  validateSignal(value);
  if (value.type !== expectedType) throw new Error(expectedType === 'offer' ? '这里需要邀请连接码，不是回应码。' : '这里需要回应码，不是邀请连接码。');
  return value;
}

function validateSignal(value) {
  if (!value || value.v !== VERSION || !['offer', 'answer'].includes(value.type) ||
      typeof value.sdp !== 'string' || value.sdp.length > 24000 || !value.sdp.startsWith('v=0\r\n') ||
      !value.sdp.includes('m=application ') || !fingerprint(value.sdp) ||
      typeof value.session !== 'string' || !SESSION.test(value.session) || typeof value.strict !== 'boolean') {
    throw new Error('连接码格式不受支持，请重新生成。');
  }
}

export function fingerprint(sdp) {
  const match = sdp.match(/^a=fingerprint:sha-256 ([A-Fa-f0-9:]+)\r?$/m);
  return match && /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(match[1]) ? match[1].toUpperCase() : null;
}

export async function safetyCode(localSdp, remoteSdp, session) {
  const fingerprints = [fingerprint(localSdp), fingerprint(remoteSdp)];
  if (fingerprints.some(x => !x)) throw new Error('缺少安全指纹，无法核对连接。');
  const input = new TextEncoder().encode(`miyo-v1|${session}|${fingerprints.sort().join('|')}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest).slice(0, 6), x => x.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{4}/g).join(' ');
}

export function readFrame(raw, session) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_PACKET_BYTES) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || data.v !== VERSION || data.session !== session) return null;
  switch (data.type) {
    case 'hello': return typeof data.name === 'string' && data.name.length <= 24 ? data : null;
    case 'verified': return data;
    case 'snapshot':
      return Number.isSafeInteger(data.seq) && data.seq >= 0 && typeof data.text === 'string' && data.text.length <= MAX_TEXT &&
        Number.isInteger(data.cursor) && data.cursor >= 0 && data.cursor <= data.text.length && typeof data.composing === 'boolean' ? data : null;
    case 'ping': case 'pong': return Number.isSafeInteger(data.time) && data.time >= 0 ? data : null;
    default: return null;
  }
}

export function codePointCount(text) { return Array.from(text).length; }
