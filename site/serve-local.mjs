import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { ".html":"text/html",".js":"application/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg",".mp4":"video/mp4",".json":"application/json",".svg":"image/svg+xml",".ico":"image/x-icon",".webp":"image/webp" };
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent((req.url||"/").split("?")[0]);
  if (p==="/") p="/index.html";
  const file = path.normalize(path.join(root, p.replace(/^\//,"")));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("no"); }
  const st = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const type = mime[ext] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : Math.min(start + 1024*1024 - 1, st.size - 1);
    res.writeHead(206, { "Content-Type": type, "Content-Length": end-start+1, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges":"bytes" });
    fs.createReadStream(file,{start,end}).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges":"bytes" });
    fs.createReadStream(file).pipe(res);
  }
});
server.listen(5173, "127.0.0.1", ()=>console.log("listening 5173"));
