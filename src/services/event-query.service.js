// src/services/event-query.service.js
const db = require("./database.service");
const { createFingerprint } = require("../utils/fingerprint");
const { isExpiredEventDate } = require("../utils/date");
const { listKnownRegions } = require("../utils/region"); // <-- BARU
const logger = require("../utils/logger");

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
  region: "region", // <-- BARU
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

    date: row.date || null,
    eventDate: row.event_date || null,
    postedAt: row.posted_at || null,
    dateSource: row.date_source || null,

    location: row.location || "",
    region: row.region || "Lainnya",
    organizer: row.organizer || "",
    description: row.description || "",
    imageUrl: row.image_url || "",
    sourceUrl: row.source_url,
    sourceHashtag: row.source_hashtag || "",
    scrapedAt: row.scraped_at || null,
    createdAt: row.created_at || null,
  };
}

function buildWhereClause(options = {}) {
  const conditions = [];
  const params = {};

  const platform = String(options.platform || "")
    .trim()
    .toLowerCase();
  const region = String(options.region || "").trim(); // <-- BARU
  const keyword = String(options.q || "").trim();

  if (platform) {
    conditions.push("platform = @platform");
    params.platform = platform;
  }

  if (region) {
    conditions.push("region = @region"); // <-- BARU
    params.region = region;
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
    // Jika memiliki tanggal acara, gunakan tanggal acara.
    if (event.eventDate) {
      return !isExpiredEventDate(event.eventDate, 7);
    }

    // Jika tidak memiliki tanggal acara, gunakan tanggal upload.
    if (event.postedAt) {
      return !isExpiredEventDate(event.postedAt, 7);
    }

    // Jika eventDate dan postedAt sama-sama tidak ada,
    // gunakan createdAt sebagai fallback terakhir.
    if (event.createdAt) {
      return !isExpiredEventDate(event.createdAt, 7);
    }

    // Jika tidak ada referensi tanggal sama sekali, jangan tampilkan.
    return false;
  });
}

function fetchRows(
  whereSql,
  orderSql,
  params = {},
  limit = null,
  offset = null,
) {
  try {
    let sql = `
    SELECT
      id,
      platform,
      post_id,
      title,
      date,
      event_date,
      posted_at,
      date_source,
      location,
      region,
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
  `;

    const fullParams = { ...params };

    if (Number.isInteger(limit) && limit > 0) {
      sql += `\n    LIMIT @limit OFFSET @offset`;
      fullParams.limit = limit;
      fullParams.offset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    }

    return db.prepare(sql).all(fullParams);
  } catch (err) {
    logger.error(
      { err, whereSql, orderSql, params },
      "Failed to fetch rows from events",
    );
    throw err;
  }
}

function countRows(whereSql, params = {}) {
  try {
    const sql = `SELECT COUNT(*) as total FROM events ${whereSql}`;
    const row = db.prepare(sql).get(params);
    return Number(row && row.total ? row.total : 0);
  } catch (err) {
    logger.error({ err, whereSql, params }, "Failed to count rows in events");
    throw err;
  }
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

  try {
    const total = countRows(whereSql, params);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(page, totalPages);
    const rows = fetchRows(whereSql, orderSql, params, limit, offset);
    const mapped = rows.map(mapRowToEvent);
    const data = filterExpiredEvents(mapped, Boolean(options.includeExpired));

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
  } catch (err) {
    logger.error({ err, options }, "Failed to query events");
    throw err;
  }
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
      posted_at,
      date_source,
      location,
      region,
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

async function getEventsByRegion(region, options = {}) {
  // <-- BARU
  return queryEvents({ ...options, region });
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

/**
 * Daftar wilayah beserta jumlah event aktif (belum expired) di tiap wilayah.
 * Dipakai untuk populate dropdown/filter wilayah di dashboard.
 */
async function getRegionSummary() {
  const rows = db
    .prepare(
      `
    SELECT region, COUNT(*) as total
    FROM events
    GROUP BY region
    ORDER BY total DESC
  `,
    )
    .all();

  const knownRegions = listKnownRegions();
  const summaryMap = new Map(
    rows.map((row) => [row.region || "Lainnya", row.total]),
  );

  // Pastikan semua region yang dikenal tetap muncul walau count-nya 0,
  // supaya filter UI tidak "hilang" pilihan.
  return knownRegions.map((region) => ({
    region,
    total: summaryMap.get(region) || 0,
  }));
}

module.exports = {
  loadAllEvents,
  queryEvents,
  getEventById,
  getEventsByPlatform,
  getEventsByRegion, // <-- BARU
  getUpcomingEvents,
  searchEvents,
  getRegionSummary, // <-- BARU
};
