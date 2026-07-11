const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const http = require("node:http");

const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const portArg = args.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] || process.env.PORT || 4173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Invalid port. Use --port=<1-65535>.");
  process.exit(1);
}

const distDir = path.resolve(process.cwd(), "dist");

if (!noBuild) {
  const build =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec || "cmd.exe",
          ["/d", "/s", "/c", "npm exec -- expo export --platform web"],
          { stdio: "inherit" },
        )
      : spawnSync(
          "npm",
          ["exec", "--", "expo", "export", "--platform", "web"],
          { stdio: "inherit" },
        );

  if (build.error) {
    console.error(`Failed to run web export: ${build.error.message}`);
    process.exit(1);
  }

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

if (!fs.existsSync(distDir)) {
  console.error("dist directory not found. Run without --no-build first.");
  process.exit(1);
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const safePath = requestPath.replace(/^\/+/, "");
  let filePath = path.join(distDir, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Failed to read file.");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      contentTypes[ext] || "application/octet-stream",
    );
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Web preview ready at http://localhost:${port}`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
