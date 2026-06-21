const express = require('express');
const db = require('./db');
const paymentsDb = require('./payments-db');
const prodamus = require('./prodamus');
const { getPlan, getPublicPlans, activateProSubscription } = require('./subscriptions');
const { requireAuth, requireAdmin } = require('./middleware');
const { sanitizeUser } = require('./auth');

function getSiteUrl() {
  const url = (process.env.SITE_PUBLIC_URL || '').replace(/\/$/, '');
  if (url) return url;
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

function isPaymentsConfigured() {
  return !!(
    process.env.PAYMENTS_ENABLED !== 'false' &&
    process.env.PRODAMUS_PAYFORM_URL &&
    process.env.PRODAMUS_SECRET_KEY
  );
}

function buildProdamusPayload(payment, user, plan) {
  const siteUrl = getSiteUrl();
  const payload = {
    do: 'link',
    sys: process.env.PRODAMUS_SYS || 'gost17025',
    order_id: payment.id,
    customer_email: user.email,
    customer_extra: `PRO подписка: ${plan.title} (${user.nickname || user.email})`,
    callbackType: 'json',
    currency: 'rub',
    urlReturn: `${siteUrl}/pro-request.html`,
    urlSuccess: `${siteUrl}/payment-success.html?payment=${payment.id}`,
    urlNotification: `${siteUrl}/api/payments/webhook/prodamus`,
    products: [{
      name: plan.title,
      price: String(plan.price),
      quantity: '1',
      sku: plan.id
    }]
  };
  if (process.env.PRODAMUS_DEMO_MODE === '1') {
    payload.demo_mode = '1';
  }
  return payload;
}

async function handleSuccessfulPayment(payment, payload, broadcast) {
  if (payment.status === 'paid') {
    return { ok: true, alreadyProcessed: true, payment };
  }

  const webhookId = [
    payload.order_id || payload.order_num,
    payload.attempt || '1',
    payment.id
  ].join(':');

  const existing = paymentsDb.getPaymentById(payment.id);
  if (existing?.webhookId === webhookId) {
    return { ok: true, alreadyProcessed: true, payment: existing };
  }

  const plan = getPlan(payment.planId);
  const days = payment.days || plan?.days || 30;

  const { version, data } = db.updateStore(store => {
    activateProSubscription(store, payment.userId, days, {
      historyType: 'payment',
      source: 'оплата Prodamus',
      note: `Оплата PRO через Prodamus (${payment.amount} ₽, заказ ${payment.id})`,
      paymentId: payment.id
    });
    return store;
  });

  const updatedPayment = paymentsDb.markPaymentPaid(payment.id, {
    providerOrderId: payload.order_id || null,
    providerOrderNum: payload.order_num || payment.id,
    webhookId,
    paidAt: new Date().toISOString()
  });

  broadcast({ type: 'data-updated', version });

  const user = data.users.find(u => u.id === payment.userId);
  return { ok: true, payment: updatedPayment, user: user ? sanitizeUser(user) : null };
}

function registerPaymentRoutes(app, broadcast) {
  app.get('/api/payments/plans', (req, res) => {
    res.json({
      plans: getPublicPlans(),
      paymentsEnabled: isPaymentsConfigured(),
      provider: 'prodamus'
    });
  });

  app.post('/api/payments/create', requireAuth, async (req, res) => {
    try {
      const { planId, acceptOffer } = req.body || {};
      if (!acceptOffer) {
        return res.status(400).json({ error: 'Необходимо принять условия публичной оферты' });
      }

      if (!isPaymentsConfigured()) {
        return res.status(503).json({
          error: 'Оплата временно недоступна. Обратитесь к администратору.',
          paymentsEnabled: false
        });
      }

      const plan = getPlan(planId || 'pro_monthly');
      if (!plan || plan.price <= 0) {
        return res.status(400).json({ error: 'Неизвестный тариф' });
      }

      const payment = paymentsDb.createPayment({
        userId: req.user.id,
        planId: plan.id,
        amount: plan.price,
        currency: 'rub',
        days: plan.days,
        metadata: { email: req.user.email, nickname: req.user.nickname }
      });

      const prodamusData = buildProdamusPayload(payment, req.user, plan);
      const paymentUrl = await prodamus.createPaymentLink(
        process.env.PRODAMUS_PAYFORM_URL,
        prodamusData,
        process.env.PRODAMUS_SECRET_KEY
      );

      const updated = paymentsDb.updatePayment(payment.id, { payment_url: paymentUrl });

      res.json({
        ok: true,
        paymentId: updated.id,
        paymentUrl: updated.paymentUrl,
        amount: updated.amount,
        plan: { id: plan.id, title: plan.title, days: plan.days }
      });
    } catch (err) {
      console.error('Payment create error:', err);
      res.status(500).json({ error: err.message || 'Не удалось создать платёж' });
    }
  });

  app.get('/api/payments/history', requireAuth, (req, res) => {
    const payments = paymentsDb.listPaymentsByUser(req.user.id);
    res.json({ payments });
  });

  app.get('/api/payments/:id/status', requireAuth, (req, res) => {
    const payment = paymentsDb.getPaymentById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Платёж не найден' });
    if (payment.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const store = db.getStore();
    const user = store.data.users.find(u => u.id === payment.userId);

    res.json({
      payment,
      subscription: {
        active: require('./roles').isProActive(user),
        proExpiresAt: user?.proExpiresAt || null
      }
    });
  });

  app.post('/api/payments/webhook/prodamus', express.json({ limit: '2mb' }), async (req, res) => {
    const signHeader = req.headers.sign || req.headers.Sign;
    let webhookLogId = null;

    try {
      const body = prodamus.parseNestedBody(req.body);
      const secretKey = process.env.PRODAMUS_SECRET_KEY;

      if (!secretKey) {
        return res.status(503).send('payments not configured');
      }

      const verification = prodamus.verifyWebhookBody(body, secretKey, signHeader);
      webhookLogId = paymentsDb.logWebhook({
        paymentId: body.order_num || body.order_id || null,
        provider: 'prodamus',
        payload: body,
        signatureValid: verification.ok,
        processed: false,
        error: verification.ok ? null : 'invalid signature'
      });

      if (!verification.ok) {
        console.warn('Prodamus webhook: invalid signature');
        return res.status(403).send('invalid signature');
      }

      const payload = verification.data;
      if (!prodamus.isPaymentSuccessful(payload)) {
        paymentsDb.logWebhook({
          paymentId: payload.order_num || payload.order_id,
          provider: 'prodamus',
          payload,
          signatureValid: true,
          processed: true,
          error: 'payment not successful'
        });
        return res.status(200).send('ignored');
      }

      const orderNum = payload.order_num || payload.order_id;
      if (!orderNum) {
        return res.status(400).send('order_num missing');
      }

      const payment = paymentsDb.getPaymentByOrderNum(orderNum);
      if (!payment) {
        console.warn('Prodamus webhook: payment not found', orderNum);
        return res.status(404).send('payment not found');
      }

      const result = await handleSuccessfulPayment(payment, payload, broadcast);

      paymentsDb.logWebhook({
        paymentId: payment.id,
        provider: 'prodamus',
        payload,
        signatureValid: true,
        processed: true,
        error: result.alreadyProcessed ? 'already processed' : null
      });

      return res.status(200).send('success');
    } catch (err) {
      console.error('Prodamus webhook error:', err);
      if (webhookLogId) {
        paymentsDb.logWebhook({
          provider: 'prodamus',
          payload: req.body,
          signatureValid: false,
          processed: false,
          error: err.message
        });
      }
      return res.status(500).send('error');
    }
  });

  const adminRouter = express.Router();
  adminRouter.use(requireAdmin);

  adminRouter.get('/payments', (req, res) => {
    const payments = paymentsDb.listAllPayments(200);
    const store = db.getStore();
    const enriched = payments.map(p => {
      const user = store.data.users.find(u => u.id === p.userId);
      return {
        ...p,
        userEmail: user?.email || null,
        userNickname: user?.nickname || null
      };
    });
    res.json({ payments: enriched, paymentsEnabled: isPaymentsConfigured() });
  });

  app.use('/api/admin', adminRouter);
}

module.exports = {
  registerPaymentRoutes,
  isPaymentsConfigured,
  handleSuccessfulPayment
};
