const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const assessmentRoutes = require("./routes/assessments");
const lessonRoutes = require("./routes/lessons");
const progressRoutes = require("./routes/progress");
const scheduleRoutes = require("./routes/schedules");
const speechRoutes = require("./routes/speech");
const studentPracticeRoutes = require("./routes/studentPracticeRoutes");
const studentRoutes = require("./routes/students");
const userRoutes = require("./routes/users");
const readingRoutes = require("./routes/reading");

const app = express();
app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://192.168.1.107:8081"
];

const isAllowedDevOrigin = (origin) => {
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
  } catch (error) {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS policy: Origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 204
}));

app.options("*", cors());

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

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.message ? err.message : err);
  if (err && err.message && err.message.includes("CORS")) {
    return res.status(403).json({ error: "CORS error: origin not allowed" });
  }
  res.status(err?.status || 500).json({ error: err?.message || "Internal Server Error" });
});

module.exports = app;
