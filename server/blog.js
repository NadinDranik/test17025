const BLOG_SEED = [
  {
    id: 'gost-17025-overview',
    title: 'ГОСТ ISO/IEC 17025-2019: что изменилось для лабораторий',
    excerpt: 'Краткий обзор ключевых требований стандарта и того, на что обращают внимание эксперты при оценке соответствия.',
    date: '2026-06-10',
    tags: ['стандарт', 'аккредитация'],
    body: [
      'ГОСТ ISO/IEC 17025-2019 устанавливает общие требования к компетентности испытательных и калибровочных лабораторий. В отличие от предыдущей редакции, стандарт сильнее акцентирует управление рисками, участие руководства и объективность результатов.',
      'При подготовке к аккредитации или подтверждению компетентности важно не только наличие документов, но и демонстрация их практического применения: записи, доказательства выполнения процедур, результаты мониторинга.',
      'Наиболее частые вопросы на проверках касаются прослеживаемости измерений, компетентности персонала, управления оборудованием и корректирующих действий. Рекомендуем заранее проверить, что процедуры СМК соответствуют фактической практике лаборатории.'
    ],
    coverImage: null,
    files: [],
    published: true
  },
  {
    id: 'internal-audit-tips',
    title: 'Внутренний аудит: как подготовиться без лишней бюрократии',
    excerpt: 'Практические советы по планированию внутренних проверок и оформлению результатов для аккредитованной лаборатории.',
    date: '2026-06-05',
    tags: ['СМК', 'аудит'],
    body: [
      'Внутренний аудит — инструмент подтверждения результативности системы менеджмента. План должен охватывать все элементы стандарта в течение цикла, но не обязан быть формальным ради формальности.',
      'Перед проверкой определите критерии, область и компетентность аудиторов. Фиксируйте как соответствия, так и возможности улучшения. Несоответствия оформляйте с чёткой привязкой к пункту стандарта или процедуры.',
      'Результаты внутреннего аудита рассматривает руководство. Важно показать, что выявленные замечания доведены до ответственных лиц и по ним приняты решения — корректирующие действия или обоснованное принятие риска.'
    ],
    coverImage: null,
    files: [],
    published: true
  },
  {
    id: 'measurement-uncertainty',
    title: 'Неопределённость измерений: с чего начать расчёт',
    excerpt: 'Базовые шаги оценки неопределённости для методик испытаний в аккредитованной области.',
    date: '2026-05-28',
    tags: ['метрология', 'ВЛК'],
    body: [
      'Оценка неопределённости измерений требуется, когда она влияет на достоверность результата или заявление о соответствии. Начните с идентификации источников — повторяемость, воспроизводимость, стандартные образцы, калибровка, влияние условий.',
      'Для многих методик достаточно модели на основе типа A и B по GUM, но лаборатория должна обосновать выбранный подход и периодически пересматривать оценку при изменении оборудования или условий.',
      'В протоколе указывайте неопределённость в соответствии с правилами, принятыми в лаборатории и требованиями заказчика. Храните расчёты и исходные данные — они понадобятся при разборе замечаний экспертной группы.'
    ],
    coverImage: null,
    files: [],
    published: true
  }
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    if (typeof tags === 'string') {
      return tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
    }
    return [];
  }
  return tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10);
}

function normalizeBody(body) {
  if (Array.isArray(body)) {
    return body.map(p => String(p).trim()).filter(Boolean);
  }
  if (typeof body === 'string') {
    return body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  return [];
}

function normalizeFileRef(file) {
  if (!file || !file.id) return null;
  return {
    id: String(file.id).replace(/[^a-zA-Z0-9_-]/g, ''),
    name: String(file.name || 'file').slice(0, 200),
    size: Number(file.size) || 0,
    type: String(file.type || '').slice(0, 100)
  };
}

function sortPosts(posts) {
  return (posts || []).slice().sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
}

function ensureBlogPosts(store) {
  if (!store.blogPosts) store.blogPosts = [];
  if (store.blogPosts.length === 0) {
    const now = new Date().toISOString();
    store.blogPosts = BLOG_SEED.map(p => ({
      ...p,
      createdAt: now,
      updatedAt: now
    }));
    return true;
  }
  return false;
}

function collectBlogFileIds(storeData) {
  const ids = new Set();
  (storeData.blogPosts || []).forEach(post => {
    if (post.coverImage?.id) ids.add(post.coverImage.id);
    (post.files || []).forEach(f => { if (f?.id) ids.add(f.id); });
  });
  return ids;
}

function isFileInBlog(fileId, storeData) {
  return collectBlogFileIds(storeData).has(fileId);
}

function sanitizePostForPublic(post) {
  if (!post || post.published === false) return null;
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    date: post.date,
    tags: post.tags || [],
    body: post.body || [],
    coverImage: post.coverImage || null,
    files: post.files || [],
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
}

module.exports = {
  BLOG_SEED,
  uid,
  normalizeTags,
  normalizeBody,
  normalizeFileRef,
  sortPosts,
  ensureBlogPosts,
  collectBlogFileIds,
  isFileInBlog,
  sanitizePostForPublic
};
