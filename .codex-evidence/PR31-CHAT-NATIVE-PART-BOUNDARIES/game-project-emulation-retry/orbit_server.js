const http = require('http');
const fs = require('fs');
const path = require('path');

const root = 'C:\\Users\\viper\\VibeSpace-UnifiedChungus-Final\\.codex-evidence\\PR31-CHAT-NATIVE-PART-BOUNDARIES\\game-project-emulation-retry';

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/game.html';
  const p = path.join(root, url);
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(p);
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': t, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
}).listen(8123, '127.0.0.1', () => console.log('UP'));
