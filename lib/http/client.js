import { showToast } from '@/components/Toast';
import { ApiError } from '@/lib/errors';

function buildUrl(path, params) {
  if (!params || Object.keys(params).length === 0) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '')
      search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

async function parseErrorBody(res) {
  try {
    const data = await res.json();
    if (data?.error) return { message: String(data.error), payload: data };
  } catch {
    /* ignore */
  }
  return {
    message: res.statusText || `Request failed (${res.status})`,
    payload: null,
  };
}

/**
 * @param {string} path
 * @param {{
 *   method?: string,
 *   body?: unknown,
 *   params?: Record<string, string | number | boolean | undefined>,
 *   schema?: import('zod').ZodType,
 *   silentFailure?: boolean,
 *   onStatus?: (status: number) => void,
 *   responseType?: 'json' | 'blob' | 'text',
 *   cache?: RequestCache,
 *   signal?: AbortSignal,
 *   headers?: Record<string, string>,
 * }} [options]
 */
export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    params,
    schema,
    silentFailure = false,
    suppressToastForStatus = [],
    onStatus,
    responseType = 'json',
    cache,
    signal,
    headers: extraHeaders = {},
  } = options;

  const url = buildUrl(path, params);
  const headers = { ...extraHeaders };
  let fetchBody = body;

  if (body !== null && body !== undefined) {
    if (body instanceof FormData) {
      // Let the browser set multipart boundary automatically — no Content-Type.
    } else if (body instanceof Blob || body instanceof ArrayBuffer) {
      // Caller supplies raw binary body (e.g. gzip). Honor any content-type the
      // caller set via extraHeaders; do NOT override with application/json.
      fetchBody = body;
    } else {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    }
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      cache,
      signal,
    });

    onStatus?.(res.status);

    if (!res.ok) {
      const { message, payload } = await parseErrorBody(res);
      throw new ApiError(res.status, message, payload);
    }

    let data;
    if (responseType === 'blob') {
      data = await res.blob();
    } else if (responseType === 'text') {
      data = await res.text();
    } else {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    }

    if (schema) {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw new ApiError(0, 'Schema mismatch', {
          issues: parsed.error.issues,
        });
      }
      return parsed.data;
    }

    return data;
  } catch (err) {
    if (silentFailure) {
      console.error(err);
      return null;
    }
    const suppress =
      err instanceof ApiError && suppressToastForStatus.includes(err.status);
    if (!suppress) {
      if (err instanceof ApiError && err.status > 0) {
        showToast(err.message, 'error');
      } else if (!(err instanceof ApiError)) {
        showToast(err?.message || 'Network error', 'error');
      } else {
        showToast(err.message || 'Request failed', 'error');
      }
    }
    throw err;
  }
}

export function get(path, options) {
  return request(path, { ...options, method: 'GET' });
}

export function post(path, body, options = {}) {
  return request(path, { ...options, method: 'POST', body });
}

export function patch(path, body, options = {}) {
  return request(path, { ...options, method: 'PATCH', body });
}

export function put(path, body, options = {}) {
  return request(path, { ...options, method: 'PUT', body });
}

export function del(path, options = {}) {
  return request(path, { ...options, method: 'DELETE' });
}
