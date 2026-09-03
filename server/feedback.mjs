import { randomUUID } from 'node:crypto';

const CATEGORIES = new Set(['experience', 'generation', 'bug', 'idea', 'other']);

export function normalizeFeedback(payload = {}) {
  const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 1000) : '';
  if (message.length < 2) throw Object.assign(new Error('至少输入两个字'), { statusCode: 400, code: 'INVALID_FEEDBACK' });
  return {
    category: CATEGORIES.has(payload.category) ? payload.category : 'other',
    message,
    contact: typeof payload.contact === 'string' ? payload.contact.trim().slice(0, 120) : '',
  };
}

export class PostgresFeedbackStore {
  constructor(pool) { this.pool = pool; }
  async create(visitorId, payload) {
    const id = randomUUID();
    await this.pool.query(`insert into jh_feedback (feedback_id, visitor_id, category, message, contact)
      values ($1,$2,$3,$4,$5)`, [id, visitorId, payload.category, payload.message, payload.contact || null]);
    return id;
  }
}
