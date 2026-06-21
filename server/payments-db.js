const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'gost17025.db');

let db;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function initPaymentsDb(existingDb) {
  db = existingDb || new Database(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'rub',
      days INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT NOT NULL DEFAULT 'prodamus',
      provider_order_id TEXT,
      provider_order_num TEXT,
      payment_url TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      webhook_id TEXT UNIQUE,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider_order_num);

    CREATE TABLE IF NOT EXISTS payment_webhooks (
      id TEXT PRIMARY KEY,
      payment_id TEXT,
      provider TEXT NOT NULL DEFAULT 'prodamus',
      payload TEXT NOT NULL,
      signature_valid INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_webhooks_payment ON payment_webhooks(payment_id);
  `);
  return db;
}

function createPayment({ userId, planId, amount, currency, days, paymentUrl, metadata }) {
  const id = uid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO payments (id, user_id, plan_id, amount, currency, days, status, payment_url, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    id,
    userId,
    planId,
    amount,
    currency || 'rub',
    days || 30,
    paymentUrl || null,
    now,
    metadata ? JSON.stringify(metadata) : null
  );
  return getPaymentById(id);
}

function getPaymentById(id) {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  return row ? mapPayment(row) : null;
}

function getPaymentByOrderNum(orderNum) {
  const row = db.prepare('SELECT * FROM payments WHERE id = ? OR provider_order_num = ?').get(orderNum, orderNum);
  return row ? mapPayment(row) : null;
}

function updatePayment(id, patch) {
  const fields = [];
  const values = [];
  Object.entries(patch).forEach(([k, v]) => {
    fields.push(`${k} = ?`);
    values.push(v);
  });
  if (!fields.length) return getPaymentById(id);
  values.push(id);
  db.prepare(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getPaymentById(id);
}

function markPaymentPaid(id, { providerOrderId, providerOrderNum, webhookId, paidAt }) {
  const payment = getPaymentById(id);
  if (!payment) return null;
  if (payment.status === 'paid') return payment;

  return updatePayment(id, {
    status: 'paid',
    provider_order_id: providerOrderId || payment.providerOrderId,
    provider_order_num: providerOrderNum || payment.providerOrderNum || id,
    webhook_id: webhookId,
    paid_at: paidAt || new Date().toISOString()
  });
}

function listPaymentsByUser(userId, limit = 20) {
  const rows = db.prepare(`
    SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
  return rows.map(mapPayment);
}

function listAllPayments(limit = 100) {
  const rows = db.prepare(`
    SELECT * FROM payments ORDER BY created_at DESC LIMIT ?
  `).all(limit);
  return rows.map(mapPayment);
}

function logWebhook({ paymentId, provider, payload, signatureValid, processed, error }) {
  const id = uid();
  db.prepare(`
    INSERT INTO payment_webhooks (id, payment_id, provider, payload, signature_valid, processed, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    paymentId || null,
    provider || 'prodamus',
    JSON.stringify(payload),
    signatureValid ? 1 : 0,
    processed ? 1 : 0,
    error || null,
    new Date().toISOString()
  );
  return id;
}

function isWebhookProcessed(webhookId) {
  if (!webhookId) return false;
  const row = db.prepare('SELECT processed FROM payment_webhooks WHERE id = ?').get(webhookId);
  return row?.processed === 1;
}

function mapPayment(row) {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    amount: row.amount,
    currency: row.currency,
    days: row.days,
    status: row.status,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    providerOrderNum: row.provider_order_num,
    paymentUrl: row.payment_url,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    webhookId: row.webhook_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  };
}

module.exports = {
  initPaymentsDb,
  createPayment,
  getPaymentById,
  getPaymentByOrderNum,
  updatePayment,
  markPaymentPaid,
  listPaymentsByUser,
  listAllPayments,
  logWebhook,
  isWebhookProcessed
};
