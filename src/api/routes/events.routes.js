// src/api/routes/events.routes.js
const express = require("express");
const {
  getEventById,
  getEventsByPlatform,
  getUpcomingEvents,
  queryEvents,
  searchEvents,
} = require("../../services/event-query.service");
const { sendError, sendSuccess } = require("../response");

const router = express.Router();

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOrder(value) {
  return String(value || "").toLowerCase() === "asc" ? "asc" : "desc";
}

function parsePagination(query = {}) {
  return {
    page: parsePositiveInt(query.page),
    limit: parsePositiveInt(query.limit),
    sortBy: query.sortBy ? String(query.sortBy).trim() : undefined,
    order: parseOrder(query.order),
  };
}

router.get("/events", async (req, res, next) => {
  try {
    const result = await queryEvents({
      ...parsePagination(req.query),
      includeExpired: false,
    });

    sendSuccess(res, result.data, result.meta);
  } catch (error) {
    next(error);
  }
});

router.get("/events/upcoming", async (req, res, next) => {
  try {
    const result = await getUpcomingEvents(parsePagination(req.query));
    sendSuccess(res, result.data, result.meta);
  } catch (error) {
    next(error);
  }
});

router.get("/events/search", async (req, res, next) => {
  try {
    const keyword = String(req.query.q || "").trim();

    if (!keyword) {
      sendError(res, 400, "Query parameter q is required");
      return;
    }

    const result = await searchEvents(keyword, parsePagination(req.query));
    sendSuccess(res, result.data, result.meta);
  } catch (error) {
    next(error);
  }
});

router.get("/events/platform/:platform", async (req, res, next) => {
  try {
    const result = await getEventsByPlatform(req.params.platform, {
      ...parsePagination(req.query),
      includeExpired: false,
    });

    sendSuccess(res, result.data, result.meta);
  } catch (error) {
    next(error);
  }
});

router.get("/events/:id", async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);

    if (!event) {
      sendError(res, 404, "Event not found");
      return;
    }

    sendSuccess(res, event);
  } catch (error) {
    next(error);
  }
});

module.exports = router;