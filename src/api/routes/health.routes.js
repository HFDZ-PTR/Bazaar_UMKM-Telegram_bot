// src/api/routes/health.routes.js
const express = require("express");
const botService = require("../../services/bot.service");
const { sendSuccess } = require("../response");

const router = express.Router();

router.get("/health", async (req, res, next) => {
  try {
    const status = botService.getStatus();

    return sendSuccess(
      res,
      {
        status: status.isRunning || status.lastScrapeAt ? "ok" : "starting",
        uptime: process.uptime(),
        lastScrapeAt: status.lastScrapeAt,
      },
      {
        bot: status,
      },
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = router;