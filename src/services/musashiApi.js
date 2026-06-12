import { StorageService } from './storage';

const API_BASE = '/api';

// ─── 请求辅助函数，自动附加 Authorization header ───
async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem('acg_auth_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `API error ${res.status}`);
  }
  return res.json();
}

// ─── 武藏也创作者平台 Service ───
export const MusashiService = {

  // ── 作品 CRUD ──

  async getWorks({ type, sort, page, limit, search } = {}) {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (sort) params.set('sort', sort);
    if (page) params.set('page', page);
    if (limit) params.set('limit', limit);
    if (search) params.set('search', search);
    const qs = params.toString();
    return apiFetch(`/works${qs ? `?${qs}` : ''}`);
  },

  async getWork(id) {
    return apiFetch(`/works/${id}`);
  },

  async createWork(data) {
    return apiFetch('/works', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateWork(id, data) {
    return apiFetch(`/works/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteWork(id) {
    return apiFetch(`/works/${id}`, {
      method: 'DELETE',
    });
  },

  async getMyWorks() {
    return apiFetch('/works/my');
  },

  // ── 互动 ──

  async toggleLike(id) {
    return apiFetch(`/works/${id}/like`, {
      method: 'POST',
    });
  },

  async toggleFavorite(id) {
    return apiFetch(`/works/${id}/favorite`, {
      method: 'POST',
    });
  },

  async recordView(id) {
    return apiFetch(`/works/${id}/view`, {
      method: 'POST',
    });
  },

  async getComments(id) {
    return apiFetch(`/works/${id}/comments`);
  },

  async addComment(id, content) {
    return apiFetch(`/works/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  async reportWork(id, reason) {
    return apiFetch(`/works/${id}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // ── 小说章节 ──

  async getChapters(workId) {
    return apiFetch(`/works/${workId}/chapters`);
  },

  async getChapter(workId, chapterId) {
    return apiFetch(`/works/${workId}/chapters/${chapterId}`);
  },

  async addChapter(workId, data) {
    return apiFetch(`/works/${workId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateChapter(workId, chapterId, data) {
    return apiFetch(`/works/${workId}/chapters/${chapterId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteChapter(workId, chapterId) {
    return apiFetch(`/works/${workId}/chapters/${chapterId}`, {
      method: 'DELETE',
    });
  },

  async reorderChapters(workId, order) {
    return apiFetch(`/works/${workId}/chapters/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    });
  },

  // ── 漫画画数 ──

  async getMangaChapters(workId) {
    return apiFetch(`/works/${workId}/manga-chapters`);
  },

  async addMangaChapter(workId, data) {
    return apiFetch(`/works/${workId}/manga-chapters`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteMangaChapter(workId, chapterId) {
    return apiFetch(`/works/${workId}/manga-chapters/${chapterId}`, {
      method: 'DELETE',
    });
  },

  async addMangaPage(workId, chapterId, data) {
    return apiFetch(`/works/${workId}/manga-chapters/${chapterId}/pages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteMangaPage(workId, pageId) {
    return apiFetch(`/works/${workId}/manga-pages/${pageId}`, {
      method: 'DELETE',
    });
  },

  // ── Galgame ──

  async addDownload(workId, data) {
    return apiFetch(`/works/${workId}/downloads`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateDownload(workId, downloadId, data) {
    return apiFetch(`/works/${workId}/downloads/${downloadId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteDownload(workId, downloadId) {
    return apiFetch(`/works/${workId}/downloads/${downloadId}`, {
      method: 'DELETE',
    });
  },

  async addPreview(workId, data) {
    return apiFetch(`/works/${workId}/previews`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deletePreview(workId, previewId) {
    return apiFetch(`/works/${workId}/previews/${previewId}`, {
      method: 'DELETE',
    });
  },

  // ── 阅读进度 ──

  async getAllProgress() {
    return apiFetch('/reading-progress');
  },

  async getProgress(workId) {
    return apiFetch(`/reading-progress/${workId}`);
  },

  async updateProgress(workId, data) {
    return apiFetch(`/reading-progress/${workId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

export default MusashiService;
