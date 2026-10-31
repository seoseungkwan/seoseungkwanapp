// Local fake Supabase (auth + rest) for screenshots only. Scenario comes from the JWT payload "sub".
import http from 'node:http'
const PORT = 54399
const users = {
  'u-admin':    { email: 'manager@example.com', hospital: 'approved', admin: true },
  'u-approved': { email: 'staff@example.com', hospital: 'approved', admin: false },
  'u-pending':  { email: 'wait@example.com', hospital: 'pending', admin: false },
  'u-rejected': { email: 'no@example.com', hospital: 'rejected', admin: false },
  'u-new':      { email: 'newcomer@example.com', hospital: null, admin: false },
}
const hospitalRow = (sub) => ({ id: 'h-' + sub, name: '예시정형외과의원', applicant_name: '홍길동', phone: '0212345678', email: users[sub].email, status: users[sub].hospital, created_at: '2026-10-27T01:00:00Z' })
const apps = [
  ['a1','바른마디정형외과의원','김민수','01012345678','barun@example.com','pending','2026-10-29T02:00:00Z'],
  ['a2','하늘척추의원','이서연','0311234567','sky@example.com','pending','2026-10-28T05:00:00Z'],
  ['a3','튼튼재활의학과의원','박준호',null,'teun@example.com','pending','2026-10-27T03:00:00Z'],
  ['a4','예시정형외과의원','홍길동','0212345678','manager@example.com','approved','2026-10-20T01:00:00Z'],
  ['a5','한빛통증의원','최지우','01098765432','hanbit@example.com','rejected','2026-10-18T01:00:00Z'],
].map(([id,name,applicant_name,phone,email,status,created_at]) => ({ id, name, applicant_name, phone, email, status, created_at }))
function sub(req) {
  const m = /Bearer\s+([^\s]+)/.exec(req.headers.authorization || '')
  if (!m) return null
  try { return JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString()).sub } catch { return null }
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Expose-Headers': '*' }
http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(body === undefined ? '' : JSON.stringify(body)) }
  if (req.method === 'OPTIONS') return send(204)
  const url = new URL(req.url, 'http://x')
  const s = sub(req)
  const u = s && users[s]
  if (url.pathname === '/auth/v1/user') {
    if (!u) return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid' })
    return send(200, { id: s, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-10-27T00:00:00Z' })
  }
  if (url.pathname === '/auth/v1/logout') return send(204)
  if (url.pathname === '/rest/v1/admins') return send(200, u && u.admin ? [{ user_id: s }] : [])
  if (url.pathname === '/rest/v1/hospitals') {
    if (url.searchParams.has('owner_id')) return send(200, u && u.hospital ? [hospitalRow(s)] : [])
    return send(200, u && u.admin ? apps : [])
  }
  send(404, { message: 'stub: not found ' + url.pathname })
}).listen(PORT, '127.0.0.1', () => console.log('stub on', PORT))
