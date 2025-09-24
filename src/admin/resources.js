'use strict';

// HTML-эскейп
function h(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${h(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#111}
    a{color:#0a58ca;text-decoration:none} a:hover{text-decoration:underline}
    h1{margin:0 0 12px}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:14px 0}
    .card{display:flex;justify-content:space-between;align-items:center;border:1px solid #ddd;border-radius:12px;padding:12px 14px;background:#fafafa}
    .tbl{border-collapse:collapse;width:100%;background:#fff}
    .tbl th,.tbl td{border:1px solid #e5e5e5;padding:6px 8px;text-align:left;vertical-align:top}
    .tbl thead{background:#f7f7f7}
    input,select,button{padding:6px 8px;border:1px solid #ccc;border-radius:8px}
    button{cursor:pointer;background:#111;color:#fff}
    form{margin:0}
  </style>
</head>
<body>
  <nav style="margin-bottom:12px">
    <a href="/admin">Dashboard</a> ·
    <a href="/admin/users">Users</a> ·
    <a href="/admin/categories">Categories</a> ·
    <a href="/admin/posts">Posts</a> ·
    <a href="/admin/comments">Comments</a>
  </nav>
  ${body}
</body>
</html>`;
}

module.exports = { h, layout };
