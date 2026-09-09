const TOKEN_KEY = 'sgeo_token';
const USER_KEY = 'sgeo_user';

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  set(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
};

async function req(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(session.token ? { authorization: 'Bearer ' + session.token } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    session.clear();
    location.hash = '#/login';
    throw new Error('Sesión expirada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  login: (username, password) => req('POST', '/auth/login', { username, password }),
  me: () => req('GET', '/auth/me'),
  structure: () => req('GET', '/structure'),
  users: () => req('GET', '/users'),
  companies: () => req('GET', '/companies'),
  createCompany: (c) => req('POST', '/companies', c),
  audits: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    return req('GET', '/audits' + (q ? '?' + q : ''));
  },
  audit: (id) => req('GET', '/audits/' + id),
  createAudit: (a) => req('POST', '/audits', a),
  setScope: (id, scope) => req('PATCH', `/audits/${id}/scope`, { scope }),
  setItems: (id, items) => req('PATCH', `/audits/${id}/items`, { items }),
  close: (id, forzar = false) => req('POST', `/audits/${id}/close`, { forzar }),
  reopen: (id) => req('POST', `/audits/${id}/reopen`),
  remove: (id) => req('DELETE', '/audits/' + id),
  compare: (ids) => req('GET', '/compare?ids=' + ids.join(',')),
};
