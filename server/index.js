const http = require("http");
const app = require("./server");

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 5002;
const MAX_PORT_ATTEMPTS = 20;

function startServer(port, attempts = 0) {
  const server = http.createServer(app);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use.`);
      if (attempts >= MAX_PORT_ATTEMPTS) {
        console.error(`No available port found between ${DEFAULT_PORT} and ${port}. Exiting.`);
        process.exit(1);
      }

      const fallback = port + 1;
      console.log(`Trying fallback port ${fallback}...`);
      startServer(fallback, attempts + 1);
    } else {
      console.error("Server error:", err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer(DEFAULT_PORT);
