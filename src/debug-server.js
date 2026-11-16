const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const { URL } = require("node:url")

const host = "127.0.0.1"
const port = Number(process.env.PORT) || 3939
const srcDir = __dirname
const rootDir = path.join(__dirname, "..")

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
}

// The page lives in src/ while the bundle, SystemJS and the samples live in
// the repository root, so try src first and fall back to the root.
function findFile(pathname) {
  for (const base of [srcDir, rootDir]) {
    const file = path.join(base, pathname)
    if (file !== base && !file.startsWith(base + path.sep))
      continue
    if (fs.existsSync(file) && fs.statSync(file).isFile())
      return file
  }
  return null
}

function send(res, status, text, headers) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers })
  res.end(text)
}

const server = http.createServer(function (req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" })
    res.end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname)
  } catch {
    send(res, 400, "Bad request")
    return
  }

  if (pathname.endsWith("/"))
    pathname += "index.html"

  const file = findFile(pathname)
  if (!file) {
    console.log(`${req.method} ${req.url} 404 Not Found`)
    send(res, 404, `Not found: ${pathname}`)
    return
  }

  let body
  try {
    body = fs.readFileSync(file)
  } catch (e) {
    console.log(`${req.method} ${req.url} 500 ${e.message}`)
    send(res, 500, e.message)
    return
  }

  const mimeType = mimeTypes[path.extname(file).toLowerCase()] ?? "application/octet-stream"
  res.writeHead(200, {
    "Content-Length": body.length,
    "Content-Type": mimeType,
    "Cache-Control": "no-store",
  })
  console.log(`${req.method} ${req.url} ${mimeType} ${body.length} 200 OK`)
  res.end(body)
})

server.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}/`)
})
