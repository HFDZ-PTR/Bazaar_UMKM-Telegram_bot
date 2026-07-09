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

function parsePagination(query) {
  return {
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    order: query.order,
  };
}

router.get("/events", async (req, res, next) => {
  try {
    const result = await queryEvents({
      ...parsePagination(req.query),
      includeExpired: false,
    });

    return sendSuccess(res, result.data, result.meta);
  } catch (error) {
    return next(error);
  }
});

router.get("/events/upcoming", async (req, res, next) => {
  try {
    const result = await getUpcomingEvents(parsePagination(req.query));
    return sendSuccess(res, result.data, result.meta);
  } catch (error) {
    return next(error);
  }
});

router.get("/events/search", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) {
      return sendError(res, 400, "Query parameter q is required");
    }

    const result = await searchEvents(query, parsePagination(req.query));
    return sendSuccess(res, result.data, result.meta);
  } catch (error) {
    return next(error);
  }
});

router.get("/events/platform/:platform", async (req, res, next) => {
  try {
    const result = await getEventsByPlatform(req.params.platform, {
      ...parsePagination(req.query),
      includeExpired: false,
    });

    return sendSuccess(res, result.data, result.meta);
  } catch (error) {
    return next(error);
  }
});

router.get("/events/:id", async (req, res, next) => {
  try {
    const event = await getEventById(req.params.id);

    if (!event) {
      return sendError(res, 404, "Event not found");
    }

    return sendSuccess(res, event, {});
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
