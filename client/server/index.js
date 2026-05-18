import http from "http";
import app from "./server.js";

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 5002;

function startServer(port) {
  const server = http.createServer(app);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use.`);
      if (port === DEFAULT_PORT) {
        const fallback = port + 1;
        console.log(`Trying fallback port ${fallback}...`);
        startServer(fallback);
      } else {
        console.error("Fallback port also in use. Exiting.");
        process.exit(1);
      }
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
