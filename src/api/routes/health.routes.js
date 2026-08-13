// src/api/routes/health.routes.js
const express = require("express");
const botService = require("../../services/bot.service");
const { sendSuccess } = require("../response");

const router = express.Router();

router.get("/health", async (req, res, next) => {
  try {
    const botStatus = botService.getStatus();

    sendSuccess(
      res,
      {
        status:
          botStatus.isRunning || botStatus.lastScrapeAt ? "ok" : "starting",
        uptime: process.uptime(),
        lastScrapeAt: botStatus.lastScrapeAt,
      },
      {
        bot: botStatus,
      },
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;