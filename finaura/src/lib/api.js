export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status; this.code = body?.code; this.details = body?.details; this.issues = body?.issues;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'x-finaura': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: "Can't reach the server. Check your connection.", code: 'network' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'unauthenticated') onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: p => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p, b) => request('DELETE', p, b),
};

/** Turn an ApiError into a friendly one-liner (first validation issue wins). */
export function errorMessage(e) {
  if (e?.issues?.length) return e.issues[0].message;
  if (e?.details?.length) return `Row ${e.details[0].row}: ${e.details[0].message}`;
  return e?.message || 'Something went wrong';
}
