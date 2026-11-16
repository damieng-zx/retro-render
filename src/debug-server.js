const http = require("http")
const fs = require("fs")
const path = require("path")

var server = http.createServer(function (req, res) {
  try {
    let message = `${req.method} ${req.url}`

    const mimeType = mimeTypes[path.extname(req.url)] ?? "application/octet-stream"

    const filename = mimeType == "text/html" ? path.join(__dirname, req.url) : path.join(__dirname, "..", req.url)
    const body = fs.readFileSync(filename)

    res.writeHead(200, {
      "Content-Length": body.length,
      "Content-Type": mimeType,
    })

    console.log(message + ` ${mimeType} ${body.length} 200 OK`)

    res.end(body)
  } catch (e) {
    res.writeHead(500)
    res.end(e.message)
  }
})

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
}

server.listen(3939)
console.log("Server is running on port 3939")
