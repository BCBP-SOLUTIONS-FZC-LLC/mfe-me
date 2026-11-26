// DEV ONLY (npm run dev:mock-iam): the fake IAM (dev/mock-iam/core.ts, the one the e2e tests and the harness use)
// as a plain HTTP server on :5090, so web-shell can run against it: start web-shell with
// DEV_API_URL=http://localhost:5090. It answers the three IAM services' routes `mfe-me` calls (User Profile,
// Delegation, Org & Membership read-only) and the signature bucket's PUT on /__bucket/. No authentication:
// whoever calls is "Ada". State is in memory and lost on restart.
import { createServer } from 'node:http'
import { createFakeIamServer } from './core.ts'

const PORT = Number(process.env.MOCK_IAM_PORT ?? 5090)
const iam = createFakeIamServer()

createServer(async (req, res) => {
  const origin = `http://localhost:${PORT}`
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const answer = await iam.fetch(new Request(`${origin}${req.url}`, { method: req.method, headers, ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}) }))
  res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' })
  res.end(Buffer.from(await answer.arrayBuffer()))
}).listen(PORT, () => console.log(`mock IAM for mfe-me on http://localhost:${PORT}`))
