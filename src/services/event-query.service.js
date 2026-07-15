// src/services/event-query.service.js
const db = require("./database.service");
const { createFingerprint } = require("../utils/fingerprint");
const { isExpiredEventDate } = require("../utils/date");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SORT_FIELD_MAP = {
  eventDate: "event_date",
  createdAt: "created_at",
  scrapedAt: "scraped_at",
  title: "title",
  location: "location",
  organizer: "organizer",
  platform: "platform",
};

function parsePage(value) {
  const page = Number.parseInt(String(value || DEFAULT_PAGE), 10);
  return Number.isInteger(page) && page > 0 ? page : DEFAULT_PAGE;
}

function parseLimit(value) {
  const limit = Number.parseInt(String(value || DEFAULT_LIMIT), 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAX_LIMIT);
}

function mapRowToEvent(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id || createFingerprint(row.platform, row.post_id),
    platform: row.platform,
    postId: row.post_id,
    title: row.title,
    date: row.date,
    eventDate: row.event_date,
    location: row.location,
    organizer: row.organizer,
    description: row.description,
    imageUrl: row.image_url,
    sourceUrl: row.source_url,
    sourceHashtag: row.source_hashtag,
    scrapedAt: row.scraped_at,
    createdAt: row.created_at,
  };
}

function buildWhereClause(options = {}) {
  const conditions = [];
  const params = {};

  const platform = String(options.platform || "")
    .trim()
    .toLowerCase();
  const keyword = String(options.q || "").trim();

  if (platform) {
    conditions.push("platform = @platform");
    params.platform = platform;
  }

  if (keyword) {
    conditions.push(`
      (
        title LIKE @search OR
        description LIKE @search OR
        location LIKE @search OR
        organizer LIKE @search
      )
    `);
    params.search = `%${keyword}%`;
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function buildOrderClause(sortBy = "eventDate", order = "asc") {
  const column = SORT_FIELD_MAP[sortBy] || SORT_FIELD_MAP.eventDate;
  const direction = String(order).toLowerCase() === "desc" ? "DESC" : "ASC";

  return {
    sortBy: SORT_FIELD_MAP[sortBy] ? sortBy : "eventDate",
    order: direction.toLowerCase(),
    orderSql: `ORDER BY ${column} ${direction}, created_at DESC`,
  };
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

function fetchRows(whereSql, orderSql, params = {}) {
  return db
    .prepare(
      `
    SELECT
      id,
      platform,
      post_id,
      title,
      date,
      event_date,
      location,
      organizer,
      description,
      image_url,
      source_url,
      source_hashtag,
      scraped_at,
      created_at
    FROM events
    ${whereSql}
    ${orderSql}
  `,
    )
    .all(params);
}

async function loadAllEvents() {
  return fetchRows("", "ORDER BY created_at DESC").map(mapRowToEvent);
}

async function queryEvents(options = {}) {
  const page = parsePage(options.page);
  const limit = parseLimit(options.limit);
  const offset = (page - 1) * limit;

  const { whereSql, params } = buildWhereClause(options);
  const { sortBy, order, orderSql } = buildOrderClause(
    options.sortBy,
    options.order,
  );

  const allEvents = filterExpiredEvents(
    fetchRows(whereSql, orderSql, params).map(mapRowToEvent),
    Boolean(options.includeExpired),
  );

  const total = allEvents.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const data = allEvents.slice(offset, offset + limit);

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
  const row = db
    .prepare(
      `
    SELECT
      id,
      platform,
      post_id,
      title,
      date,
      event_date,
      location,
      organizer,
      description,
      image_url,
      source_url,
      source_hashtag,
      scraped_at,
      created_at
    FROM events
    WHERE id = ? OR post_id = ?
    LIMIT 1
  `,
    )
    .get(id, id);

  return mapRowToEvent(row);
}

async function getEventsByPlatform(platform, options = {}) {
  return queryEvents({ ...options, platform });
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
