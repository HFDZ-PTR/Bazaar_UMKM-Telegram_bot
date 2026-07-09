const storage = require("../utils/storage.service");
const { createFingerprint } = require("../utils/fingerprint");
const { parseEventDateString, isExpiredEventDate } = require("../utils/date");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampPage(value) {
  const page = Number.parseInt(String(value || DEFAULT_PAGE), 10);
  return Number.isFinite(page) && page > 0 ? page : DEFAULT_PAGE;
}

function clampLimit(value) {
  const limit = Number.parseInt(String(value || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAX_LIMIT);
}

function normalizeLoadedEvent(event) {
  const parsedEventDate = parseEventDateString(event?.eventDate || null);

  return {
    ...event,
    id: event.id || createFingerprint(event.platform, event.postId),
    eventDate: parsedEventDate
      ? parsedEventDate.toISOString().slice(0, 10)
      : null,
  };
}

function toComparableDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function compareValues(left, right, order) {
  const leftIsNull = left === null || left === undefined || left === "";
  const rightIsNull = right === null || right === undefined || right === "";

  if (leftIsNull && rightIsNull) {
    return 0;
  }

  if (leftIsNull) {
    return 1;
  }

  if (rightIsNull) {
    return -1;
  }

  if (left === right) {
    return 0;
  }

  const direction = order === "desc" ? -1 : 1;
  return left < right ? -1 * direction : 1 * direction;
}

function compareEvents(left, right, sortBy, order) {
  if (
    sortBy === "eventDate" ||
    sortBy === "createdAt" ||
    sortBy === "scrapedAt"
  ) {
    const leftValue =
      sortBy === "eventDate"
        ? toComparableDate(
            left.eventDate ? `${left.eventDate}T00:00:00.000Z` : null,
          )
        : toComparableDate(left[sortBy]);
    const rightValue =
      sortBy === "eventDate"
        ? toComparableDate(
            right.eventDate ? `${right.eventDate}T00:00:00.000Z` : null,
          )
        : toComparableDate(right[sortBy]);

    return compareValues(leftValue, rightValue, order);
  }

  const leftValue = String(left[sortBy] || "").toLowerCase();
  const rightValue = String(right[sortBy] || "").toLowerCase();
  return compareValues(leftValue, rightValue, order);
}

function matchesSearch(event, query) {
  const haystack = [
    event.title,
    event.description,
    event.location,
    event.organizer,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

async function loadAllEvents() {
  const files = await storage.listEventFiles();
  const events = [];

  for (const filePath of files) {
    const fileEvents = await storage.readJSON(filePath, []);
    for (const event of fileEvents) {
      events.push(normalizeLoadedEvent(event));
    }
  }

  return events;
}

function filterExpiredEvents(events, includeExpired) {
  if (includeExpired) {
    return events;
  }

  return events.filter((event) => {
    if (!event.eventDate) {
      return true;
    }

    return !isExpiredEventDate(event.eventDate, 7);
  });
}

async function queryEvents(options = {}) {
  const page = clampPage(options.page);
  const limit = clampLimit(options.limit);
  const sortBy = options.sortBy || "eventDate";
  const order = options.order === "desc" ? "desc" : "asc";
  const platform = String(options.platform || "")
    .trim()
    .toLowerCase();
  const searchQuery = String(options.q || "").trim();

  let events = await loadAllEvents();

  if (platform) {
    events = events.filter(
      (event) => String(event.platform || "").toLowerCase() === platform,
    );
  }

  if (searchQuery) {
    events = events.filter((event) => matchesSearch(event, searchQuery));
  }

  events = filterExpiredEvents(events, Boolean(options.includeExpired));

  events.sort((left, right) => compareEvents(left, right, sortBy, order));

  const total = events.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * limit;
  const data = events.slice(offset, offset + limit);

  return {
    data,
    meta: {
      page: currentPage,
      limit,
      total,
      totalPages,
      sortBy,
      order,
    },
  };
}

async function getEventById(id) {
  const events = await loadAllEvents();
  return events.find((event) => event.id === id || event.postId === id) || null;
}

async function getEventsByPlatform(platform, options = {}) {
  return queryEvents({
    ...options,
    platform,
  });
}

async function getUpcomingEvents(options = {}) {
  return queryEvents({
    ...options,
    includeExpired: false,
    sortBy: options.sortBy || "eventDate",
    order: options.order || "asc",
  });
}

async function searchEvents(query, options = {}) {
  return queryEvents({
    ...options,
    q: query,
    includeExpired: false,
  });
}

module.exports = {
  loadAllEvents,
  queryEvents,
  getEventById,
  getEventsByPlatform,
  getUpcomingEvents,
  searchEvents,
};
