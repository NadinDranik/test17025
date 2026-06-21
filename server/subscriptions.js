const { appendProHistory } = require('./account');
const { isProActive } = require('./roles');

const PRO_MONTHLY_PRICE = Number(process.env.PRO_MONTHLY_PRICE) || 1000;
const PRO_MONTHLY_DAYS = Number(process.env.PRO_MONTHLY_DAYS) || 30;

const PLANS = {
  free: {
    id: 'free',
    title: 'Free',
    price: 0,
    days: 0,
    description: 'Общий чат и личный диалог с администратором'
  },
  pro_monthly: {
    id: 'pro_monthly',
    title: 'PRO',
    price: PRO_MONTHLY_PRICE,
    days: PRO_MONTHLY_DAYS,
    description: `PRO-доступ на ${PRO_MONTHLY_DAYS} дней — закрытые чаты и разделы`
  }
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getPlan(planId) {
  return PLANS[planId] || null;
}

function getPublicPlans() {
  return Object.values(PLANS).filter(p => p.price > 0);
}

/**
 * Активация или продление PRO-подписки (используется webhook и админкой).
 */
function activateProSubscription(store, userId, days, options = {}) {
  const user = store.users.find(u => u.id === userId);
  if (!user || user.role === 'admin') return { ok: false, error: 'Пользователь не найден' };

  const d = Number(days) || PRO_MONTHLY_DAYS;
  const now = new Date();
  const nowIso = now.toISOString();
  const hadActive = isProActive(user);

  let base;
  if (hadActive && user.proExpiresAt) {
    base = new Date(user.proExpiresAt);
  } else {
    base = new Date();
  }
  base.setDate(base.getDate() + d);
  user.proPaidAt = nowIso;
  user.proExpiresAt = base.toISOString();

  const historyType = options.historyType || (hadActive ? 'extend' : 'grant');
  appendProHistory(store, userId, {
    type: historyType,
    days: d,
    proPaidAt: user.proPaidAt,
    proExpiresAt: user.proExpiresAt,
    note: options.note || (hadActive
      ? `PRO продлён на ${d} дн. (${options.source || 'система'})`
      : `PRO активирован на ${d} дн. (${options.source || 'система'})`)
  });

  store.proRequests?.forEach(r => {
    if (r.userId === userId && r.status === 'pending') {
      r.status = 'processed';
      r.processedAt = nowIso;
    }
  });

  store.notifications.unshift({
    id: uid(),
    userId,
    text: hadActive
      ? 'PRO-подписка продлена до ' + base.toLocaleDateString('ru-RU')
      : 'PRO-доступ активирован до ' + base.toLocaleDateString('ru-RU'),
    type: 'info',
    refId: options.paymentId || null,
    read: false,
    createdAt: nowIso
  });

  return { ok: true, user, extended: hadActive };
}

/**
 * Проверка истёкших подписок и запись в журнал (один раз на период).
 */
function processExpiredSubscriptions(store) {
  const now = new Date();
  let changed = false;

  (store.users || []).forEach(u => {
    if (u.role === 'admin' || !u.proExpiresAt) return;
    const expiresAt = new Date(u.proExpiresAt);
    if (expiresAt > now) return;

    const alreadyLogged = (store.proHistory || []).some(h =>
      h.userId === u.id &&
      h.type === 'expire' &&
      h.proExpiresAt === u.proExpiresAt
    );

    if (!alreadyLogged) {
      if (!store.proHistory) store.proHistory = [];
      appendProHistory(store, u.id, {
        type: 'expire',
        days: null,
        proPaidAt: u.proPaidAt,
        proExpiresAt: u.proExpiresAt,
        note: 'Подписка истекла — доступ к PRO-разделам заблокирован'
      });

      store.notifications.unshift({
        id: uid(),
        userId: u.id,
        text: 'Срок PRO-подписки истёк. Продлите доступ для входа в PRO-чаты.',
        type: 'warning',
        refId: null,
        read: false,
        createdAt: now.toISOString()
      });
      changed = true;
    }
  });

  return changed;
}

function getSubscriptionInfo(user) {
  const plan = isProActive(user) ? 'pro' : 'free';
  return {
    plan,
    status: isProActive(user) ? 'active' : (user?.proExpiresAt ? 'expired' : 'none'),
    proPaidAt: user?.proPaidAt || null,
    proExpiresAt: user?.proExpiresAt || null,
    active: isProActive(user)
  };
}

module.exports = {
  PLANS,
  getPlan,
  getPublicPlans,
  activateProSubscription,
  processExpiredSubscriptions,
  getSubscriptionInfo,
  PRO_MONTHLY_PRICE,
  PRO_MONTHLY_DAYS
};
