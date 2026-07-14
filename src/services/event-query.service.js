// src/services/event-query.service.js
const db = require("./database.service");
const { createFingerprint } = require("../utils/fingerprint");
const { isExpiredEventDate } = require("../utils/date");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = new Set([
  "eventDate",
  "createdAt",
  "scrapedAt",
  "title",
  "location",
  "organizer",
  "platform",
]);

const SORT_FIELD_MAP = {
  eventDate: "event_date",
  createdAt: "created_at",
  scrapedAt: "scraped_at",
  title: "title",
  location: "location",
  organizer: "organizer",
  platform: "platform",
};

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

  const platform = String(options.platform || "").trim().toLowerCase();
  const searchQuery = String(options.q || "").trim();

  if (platform) {
    conditions.push("platform = @platform");
    params.platform = platform;
  }

  if (searchQuery) {
    params.search = `%${searchQuery}%`;
    conditions.push(`
      (
        title LIKE @search OR
        description LIKE @search OR
        location LIKE @search OR
        organizer LIKE @search
      )
    `);
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function buildOrderClause(sortBy = "eventDate", order = "asc") {
  const safeSortBy = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "eventDate";
  const safeOrder = order === "desc" ? "DESC" : "ASC";
  const column = SORT_FIELD_MAP[safeSortBy];

  return {
    sortBy: safeSortBy,
    order: safeOrder.toLowerCase(),
    orderSql: `ORDER BY ${column} ${safeOrder}, created_at DESC`,
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

async function loadAllEvents() {
  const rows = db.prepare(`
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
    ORDER BY created_at DESC
  `).all();

  return rows.map(mapRowToEvent);
}

async function queryEvents(options = {}) {
  const page = clampPage(options.page);
  const limit = clampLimit(options.limit);
  const offset = (page - 1) * limit;

  const { whereSql, params } = buildWhereClause(options);
  const { sortBy, order, orderSql } = buildOrderClause(
    options.sortBy,
    options.order,
  );

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM events
    ${whereSql}
  `).get(params);

  const rows = db.prepare(`
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
    LIMIT @limit OFFSET @offset
  `).all({
    ...params,
    limit,
    offset,
  });

  let data = rows.map(mapRowToEvent);
  data = filterExpiredEvents(data, Boolean(options.includeExpired));

  let total = countRow?.total || 0;

  if (!options.includeExpired) {
    const allFilteredRows = db.prepare(`
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
    `).all(params);

    total = filterExpiredEvents(
      allFilteredRows.map(mapRowToEvent),
      false,
    ).length;

    const pagedFilteredRows = allFilteredRows
      .map(mapRowToEvent)
      .filter((event) => {
        if (!event.eventDate) {
          return true;
        }

        return !isExpiredEventDate(event.eventDate, 7);
      })
      .slice(offset, offset + limit);

    data = pagedFilteredRows;
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);

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
  const row = db.prepare(`
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
  `).get(id, id);

  return mapRowToEvent(row);
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