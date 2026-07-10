// src/api/server.js
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");
const { CONFIG } = require("../config");
const apiKeyMiddleware = require("./middleware/apiKey.middleware");
const errorMiddleware = require("./middleware/error.middleware");
const notFoundMiddleware = require("./middleware/notFound.middleware");
const healthRoutes = require("./routes/health.routes");
const eventsRoutes = require("./routes/events.routes");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(apiKeyMiddleware);
app.use("/api", healthRoutes);
app.use("/api", eventsRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

app.start = function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(CONFIG.port, () => {
      logger.info({ port: CONFIG.port }, "api server started");
      resolve(server);
    });
  });
};

module.exports = app;