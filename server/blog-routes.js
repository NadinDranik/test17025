const db = require('./db');
const { requireAdmin } = require('./middleware');
const {
  uid,
  normalizeTags,
  normalizeBody,
  normalizeFileRef,
  sortPosts,
  ensureBlogPosts,
  isFileInBlog,
  sanitizePostForPublic
} = require('./blog');

function getStoreWithBlog() {
  const store = db.getStore();
  if (ensureBlogPosts(store.data)) {
    db.saveStore(store.data);
  }
  return store;
}

function registerBlogRoutes(app, broadcast) {
  app.get('/api/blog/posts', (req, res) => {
    const store = getStoreWithBlog();
    const posts = sortPosts(store.data.blogPosts)
      .map(sanitizePostForPublic)
      .filter(Boolean);
    res.json({ posts });
  });

  app.get('/api/blog/posts/:id', (req, res) => {
    const store = getStoreWithBlog();
    const post = (store.data.blogPosts || []).find(p => p.id === req.params.id);
    const publicPost = sanitizePostForPublic(post);
    if (!publicPost) return res.status(404).json({ error: 'Публикация не найдена' });
    res.json({ post: publicPost });
  });

  const router = require('express').Router();
  router.use(requireAdmin);

  function notifyAndSave(mutator) {
    const store = getStoreWithBlog();
    const data = mutator(store.data);
    const version = db.saveStore(data);
    broadcast({ type: 'data-updated', version });
    return data;
  }

  router.get('/posts', (req, res) => {
    const store = getStoreWithBlog();
    res.json({ posts: sortPosts(store.data.blogPosts) });
  });

  router.post('/posts', (req, res) => {
    const { title, excerpt, tags, body, date, coverImage, files, published } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'Заголовок обязателен' });
    if (!excerpt?.trim()) return res.status(400).json({ error: 'Краткое описание обязательно' });

    const now = new Date().toISOString();
    const post = {
      id: uid(),
      title: title.trim().slice(0, 300),
      excerpt: excerpt.trim().slice(0, 500),
      tags: normalizeTags(tags),
      body: normalizeBody(body),
      date: date || now.slice(0, 10),
      coverImage: normalizeFileRef(coverImage),
      files: (files || []).map(normalizeFileRef).filter(Boolean),
      published: published !== false,
      createdAt: now,
      updatedAt: now
    };

    const data = notifyAndSave(store => {
      if (!store.blogPosts) store.blogPosts = [];
      store.blogPosts.push(post);
      return store;
    });

    res.json({ ok: true, post, posts: sortPosts(data.blogPosts) });
  });

  router.patch('/posts/:id', (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};

    let updated = null;
    const data = notifyAndSave(store => {
      const idx = (store.blogPosts || []).findIndex(p => p.id === id);
      if (idx === -1) return store;

      const current = store.blogPosts[idx];
      const next = { ...current, updatedAt: new Date().toISOString() };

      if (patch.title !== undefined) next.title = String(patch.title).trim().slice(0, 300);
      if (patch.excerpt !== undefined) next.excerpt = String(patch.excerpt).trim().slice(0, 500);
      if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
      if (patch.body !== undefined) next.body = normalizeBody(patch.body);
      if (patch.date !== undefined) next.date = String(patch.date).slice(0, 10);
      if (patch.published !== undefined) next.published = !!patch.published;
      if (patch.coverImage !== undefined) next.coverImage = patch.coverImage ? normalizeFileRef(patch.coverImage) : null;
      if (patch.files !== undefined) next.files = (patch.files || []).map(normalizeFileRef).filter(Boolean);

      store.blogPosts[idx] = next;
      updated = next;
      return store;
    });

    if (!updated) return res.status(404).json({ error: 'Публикация не найдена' });
    res.json({ ok: true, post: updated, posts: sortPosts(data.blogPosts) });
  });

  router.delete('/posts/:id', (req, res) => {
    const { id } = req.params;
    let removed = null;

    notifyAndSave(store => {
      const post = (store.blogPosts || []).find(p => p.id === id);
      if (!post) return store;
      removed = post;
      store.blogPosts = store.blogPosts.filter(p => p.id !== id);
      const fileIds = [];
      if (post.coverImage?.id) fileIds.push(post.coverImage.id);
      (post.files || []).forEach(f => { if (f?.id) fileIds.push(f.id); });
      fileIds.forEach(fid => { try { db.deleteFile(fid); } catch { /* ignore */ } });
      return store;
    });

    if (!removed) return res.status(404).json({ error: 'Публикация не найдена' });
    res.json({ ok: true });
  });

  app.use('/api/admin/blog', router);
}

module.exports = { registerBlogRoutes, isFileInBlog };
