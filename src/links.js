import { decodeSignal, encodeSignal } from './protocol.js';

const LIMIT = 48000;
export const PUBLIC_URL = 'https://jiamiing.github.io/miyo/';
const toBase64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function fromBase64(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('邀请链接不完整，请重新复制。');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), x => x.charCodeAt(0));
}

async function readLimited(stream) {
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new Error('邀请内容过大，请重新生成。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function makeSignalLink(code, type, base = PUBLIC_URL) {
  const signal = decodeSignal(code, type);
  const bytes = new TextEncoder().encode(JSON.stringify([signal.session, signal.sdp, signal.strict ? 1 : 0]));
  let packed = bytes; let format = 'u';
  if (typeof CompressionStream !== 'undefined') {
    const compressed = await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')));
    if (compressed.length < bytes.length) { packed = compressed; format = 'z'; }
  }
  const url = new URL(base); url.search = ''; url.hash = '';
  url.hash = `${type === 'offer' ? 'invite' : 'reply'}=${format}${toBase64(packed)}`;
  return url.href;
}

export async function readSignalLink(input, type) {
  if (typeof input !== 'string' || input.length > LIMIT) throw new Error('链接太长或格式不正确。');
  const text = input.trim();
  if (text.startsWith('MIYO1.')) { decodeSignal(text, type); return text; }
  let hash;
  try { hash = new URL(text).hash; } catch { hash = text.startsWith('#') ? text : ''; }
  const params = new URLSearchParams(hash.slice(1));
  const key = type === 'offer' ? 'invite' : 'reply';
  const value = params.get(key);
  if (!value) throw new Error(type === 'offer' ? '请使用密友发给你的邀请链接。' : '请使用对方发回的确认链接。');
  if (params.getAll(key).length !== 1) throw new Error('链接包含重复内容，请重新生成。');
  try {
    let bytes = fromBase64(value.slice(1));
    if (value[0] === 'z') {
      if (typeof DecompressionStream === 'undefined') throw new Error('请升级浏览器后打开此邀请链接。');
      bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')));
    } else if (value[0] !== 'u') throw new Error('链接版本无法识别。');
    const [session, sdp, strict] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (strict !== 0 && strict !== 1) throw new Error('连接方式无法识别。');
    return encodeSignal({ session, sdp, strict: strict === 1, type });
  } catch (error) {
    if (error.message?.includes('升级浏览器')) throw error;
    throw new Error('邀请链接无法读取，请让密友重新分享。');
  }
}
