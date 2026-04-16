/**
 * Dev proxy that adds COOP/COEP headers required by expo-sqlite on web.
 * SharedArrayBuffer (used by wa-sqlite) needs these headers on ALL responses,
 * including the HTML page. Expo's dev server only applies metro.config.js
 * enhanceMiddleware to JS bundles, not the HTML page.
 *
 * Usage: node scripts/dev-proxy.js [proxyPort] [expoPort]
 */
const http = require('http');
const net = require('net');

const PROXY_PORT = parseInt(process.argv[2] || '8082', 10);
const EXPO_PORT = parseInt(process.argv[3] || '19006', 10);

const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

const server = http.createServer((clientReq, clientRes) => {
  const proxyReq = http.request(
    {
      hostname: 'localhost',
      port: EXPO_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: clientReq.headers,
    },
    (proxyRes) => {
      for (const [k, v] of Object.entries(HEADERS)) {
        proxyRes.headers[k.toLowerCase()] = v;
      }
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );

  proxyReq.on('error', () => {
    clientRes.writeHead(502);
    clientRes.end('Expo dev server not ready');
  });

  clientReq.pipe(proxyReq);
});

// WebSocket proxy (HMR)
server.on('upgrade', (req, socket, head) => {
  const proxySocket = net.connect(EXPO_PORT, 'localhost', () => {
    const reqLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    const hdrs = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');
    proxySocket.write(reqLine + hdrs + '\r\n\r\n');
    if (head.length) proxySocket.write(head);
    socket.pipe(proxySocket).pipe(socket);
  });
  proxySocket.on('error', () => socket.end());
  socket.on('error', () => proxySocket.end());
});

server.listen(PROXY_PORT, () => {
  console.log(`[proxy] COOP/COEP proxy :${PROXY_PORT} → Expo :${EXPO_PORT}`);
});
