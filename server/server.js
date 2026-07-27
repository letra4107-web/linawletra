import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import assessmentRoutes from "./routes/assessments.js";
import lessonRoutes from "./routes/lessons.js";
import progressRoutes from "./routes/progress.js";
import scheduleRoutes from "./routes/schedules.js";
import speechRoutes from "./routes/speech.js";
import studentPracticeRoutes from "./routes/studentPracticeRoutes.js";
import studentRoutes from "./routes/students.js";
import userRoutes from "./routes/users.js";
import readingRoutes from "./routes/reading.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [
        "https://linawletra.com",
        "https://www.linawletra.com",
      ]
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:8081",
        "http://192.168.1.107:8081",
      ];

const isAllowedDevOrigin = (origin) => {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const { protocol, hostname } = new URL(origin);
    const isHttp = protocol === "http:" || protocol === "https:";
    const isLocalHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1";
    const isPrivateLan =
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    return isHttp && (isLocalHost || isPrivateLan);
  } catch {
    return false;
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS policy: Origin not allowed - " + origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV, timestamp: new Date().toISOString() });
});

app.options("*", cors(corsOptions));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/speech", speechRoutes);
app.use("/api/reading", readingRoutes);
app.use("/api/students", studentPracticeRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/users", userRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

if (process.env.NODE_ENV === "production") {
  const clientBuildPath = path.resolve(__dirname, "../client/client/build");
  app.use(express.static(clientBuildPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.message ? err.message : err);
  if (err && err.message && err.message.includes("CORS")) {
    return res.status(403).json({ error: "CORS error: origin not allowed" });
  }
  res.status(err?.status || 500).json({ error: err?.message || "Internal Server Error" });
});

export default app;

