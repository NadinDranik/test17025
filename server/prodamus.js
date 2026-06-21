const crypto = require('crypto');

/**
 * Алгоритм подписи Prodamus (Hmac.php / Hmac.js):
 * 1. Рекурсивная сортировка ключей
 * 2. Все значения → строки
 * 3. JSON.stringify с экранированием /
 * 4. HMAC-SHA256 hex
 */
function sortForSignature(data) {
  if (Array.isArray(data)) {
    return data.map(item =>
      item !== null && typeof item === 'object' ? sortForSignature(item) : String(item)
    );
  }
  if (data !== null && typeof data === 'object') {
    const sorted = {};
    Object.keys(data).sort().forEach(key => {
      sorted[key] = sortForSignature(data[key]);
    });
    return sorted;
  }
  return String(data);
}

function createSignature(data, secretKey) {
  const sorted = sortForSignature(data);
  const json = JSON.stringify(sorted).replace(/\//g, '\\/');
  return crypto.createHmac('sha256', secretKey).update(json).digest('hex');
}

function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifySignature(data, secretKey, sign) {
  if (!data || !secretKey || !sign) return false;
  const expected = createSignature(data, secretKey);
  return timingSafeEqual(expected, sign);
}

function parseNestedBody(body) {
  if (!body || typeof body !== 'object') return body;
  const result = { ...body };
  if (typeof result.submit === 'string') {
    try {
      result.submit = JSON.parse(result.submit);
    } catch (_) { /* keep as string */ }
  }
  if (typeof result.products === 'string') {
    try {
      result.products = JSON.parse(result.products);
    } catch (_) { /* keep */ }
  }
  return result;
}

function verifyWebhookBody(body, secretKey, signHeader) {
  const parsed = parseNestedBody(body);
  const sign = signHeader || parsed.sign || parsed.signature;

  if (parsed.submit && typeof parsed.submit === 'object') {
    if (verifySignature(parsed.submit, secretKey, sign)) return { ok: true, data: parsed };
  }

  const forVerify = { ...parsed };
  delete forVerify.sign;
  delete forVerify.signature;
  if (verifySignature(forVerify, secretKey, sign)) return { ok: true, data: parsed };

  return { ok: false, data: parsed };
}

function flattenParams(data, prefix = '') {
  const pairs = [];
  Object.keys(data).forEach(key => {
    const value = data[key];
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      pairs.push(...flattenParams(value, fullKey));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          pairs.push(...flattenParams(item, `${fullKey}[${i}]`));
        } else {
          pairs.push([`${fullKey}[${i}]`, String(item)]);
        }
      });
    } else if (value !== undefined && value !== null) {
      pairs.push([fullKey, String(value)]);
    }
  });
  return pairs;
}

function buildSignedQuery(data, secretKey) {
  const signature = createSignature(data, secretKey);
  const withSign = { ...data, signature };
  return flattenParams(withSign)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function createPaymentLink(payformUrl, data, secretKey) {
  const signed = { ...data, signature: createSignature(data, secretKey) };
  const body = flattenParams(signed)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = payformUrl.replace(/\/$/, '') + '/';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body
  });

  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(text || `Prodamus HTTP ${res.status}`);
  }
  if (text.startsWith('http')) return text;
  throw new Error(text || 'Не удалось получить ссылку на оплату');
}

function isPaymentSuccessful(payload) {
  const status = String(payload.payment_status || '').toLowerCase();
  if (status === 'success' || status === 'paid' || status === '1') return true;
  const desc = String(payload.payment_status_description || '').toLowerCase();
  return desc.includes('успеш') || desc.includes('success') || desc.includes('оплачен');
}

module.exports = {
  createSignature,
  verifySignature,
  verifyWebhookBody,
  buildSignedQuery,
  createPaymentLink,
  isPaymentSuccessful,
  parseNestedBody
};
