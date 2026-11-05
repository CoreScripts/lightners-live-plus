const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isPackRequest(request) {
  if (request.method !== 'GET') return false;
  const path = new URL(request.url).pathname;
  return path === '/index.pck' || path.endsWith('/index.pck');
}

function isWorkletScript(request) {
  return new URL(request.url).pathname.endsWith('.worklet.js');
}

async function collectParts(request) {
  const base = new URL(request.url).pathname.replace(/index\.pck$/, '');
  const parts = [];
  for (let i = 1; i <= 999; i++) {
    const name = `${base}index.pck.part${String(i).padStart(2, '0')}`;
    const response = await fetch(name, { cache: 'no-store' });
    if (!response.ok) break;
    parts.push(response);
  }
  return parts;
}

function concatenate(parts) {
  let index = 0;
  let reader = null;
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        if (!reader) {
          if (index >= parts.length) {
            controller.close();
            return;
          }
          reader = parts[index++].body.getReader();
        }
        const { done, value } = await reader.read();
        if (done) {
          reader = null;
          continue;
        }
        controller.enqueue(value);
        return;
      }
    },
    cancel() {
      if (reader) reader.cancel();
    },
  });
}

async function servePack(request) {
  const parts = await collectParts(request);
  if (parts.length === 0) {
    return fetch(request);
  }
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  return new Response(concatenate(parts), { status: 200, headers });
}

async function withIsolationHeaders(request) {
  const response = await fetch(request);
  if (!response.body) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ISOLATION_HEADERS)) {
    headers.set(name, value);
  }
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (isPackRequest(request)) {
    event.respondWith(servePack(request));
    return;
  }
  const sameOrigin = new URL(request.url).origin === self.location.origin;
  if (sameOrigin && (request.mode === 'navigate' || request.destination === 'worker' || isWorkletScript(request))) {
    event.respondWith(withIsolationHeaders(request));
  }
});
