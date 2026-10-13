// Server kecil tanpa dependensi (Node 18+). Jalankan: node server.js
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getProfile(u) {
  const r = await fetch('https://www.tiktok.com/@' + u, {
    headers: { 'user-agent': UA, 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' }
  });
  if (r.status === 404) throw new Error('Akun tidak ditemukan');
  if (!r.ok) throw new Error('TikTok membalas HTTP ' + r.status + ' (kemungkinan diblokir sementara)');
  const html = await r.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Data profil tidak ditemukan (TikTok meminta verifikasi / memblokir server ini)');
  const d = JSON.parse(m[1]);
  const ui = d['__DEFAULT_SCOPE__'] && d['__DEFAULT_SCOPE__']['webapp.user-detail'] && d['__DEFAULT_SCOPE__']['webapp.user-detail'].userInfo;
  if (!ui || !ui.user) throw new Error('Akun tidak ditemukan atau tidak bisa dibaca');
  return ui;
}

const cache = new Map();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/tiktok') {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    const u = (url.searchParams.get('u') || '').replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_.]{2,24}$/.test(u)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Username tidak valid' })); }
    const hit = cache.get(u);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return res.end(JSON.stringify(hit.v));
    try {
      const ui = await getProfile(u), s = ui.stats || {}, us = ui.user;
      const out = {
        username: us.uniqueId, nickname: us.nickname, bio: us.signature || '', bioLink: (us.bioLink && us.bioLink.link) || '',
        verified: !!us.verified, avatar: !!us.avatarLarger,
        followers: s.followerCount || 0, following: s.followingCount || 0,
        likesTotal: s.heartCount || 0, videos: s.videoCount || 0,
        avgLikes: s.videoCount ? Math.round((s.heartCount || 0) / s.videoCount) : 0
      };
      cache.set(u, { t: Date.now(), v: out });
      res.end(JSON.stringify(out));
    } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  const f = path.join(__dirname, 'public', 'index.html');
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(f));
});
server.listen(PORT, () => console.log('Buka http://localhost:' + PORT));
