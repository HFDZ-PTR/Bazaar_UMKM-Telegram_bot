// src/services/hashtag-rotation.service.js
const crypto = require("crypto");
const db = require("./database.service");
const { CONFIG } = require("../config");
const logger = require("../utils/logger");

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function shuffle(items = []) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

const getStateStmt = db.prepare(`
  SELECT platform, queue_json, last_picked_json
  FROM hashtag_rotation_state
  WHERE platform = ?
  LIMIT 1
`);

const upsertStateStmt = db.prepare(`
  INSERT INTO hashtag_rotation_state (
    platform,
    queue_json,
    last_picked_json,
    updated_at
  ) VALUES (
    @platform,
    @queue_json,
    @last_picked_json,
    @updated_at
  )
  ON CONFLICT(platform) DO UPDATE SET
    queue_json = excluded.queue_json,
    last_picked_json = excluded.last_picked_json,
    updated_at = excluded.updated_at
`);

function readPlatformState(platform) {
  const row = getStateStmt.get(platform);

  if (!row) {
    return { queue: [], lastPicked: [] };
  }

  let queue = [];
  let lastPicked = [];

  try {
    queue = Array.isArray(JSON.parse(row.queue_json)) ? JSON.parse(row.queue_json) : [];
  } catch {
    queue = [];
  }

  try {
    lastPicked = Array.isArray(JSON.parse(row.last_picked_json))
      ? JSON.parse(row.last_picked_json)
      : [];
  } catch {
    lastPicked = [];
  }

  return { queue, lastPicked };
}

function writePlatformState(platform, state) {
  upsertStateStmt.run({
    platform,
    queue_json: JSON.stringify(Array.isArray(state.queue) ? state.queue : []),
    last_picked_json: JSON.stringify(
      Array.isArray(state.lastPicked) ? state.lastPicked : [],
    ),
    updated_at: new Date().toISOString(),
  });
}

function pickRandom(tags, count, lastPicked = []) {
  const pool = unique(tags);
  if (pool.length === 0) return [];

  const safeCount = Math.min(count, pool.length);
  const lastSet = new Set(lastPicked);
  const preferred = pool.filter((tag) => !lastSet.has(tag));
  const source = preferred.length >= safeCount ? preferred : pool;

  return shuffle(source).slice(0, safeCount);
}

function pickFromQueue(tags, count, platformState = {}) {
  const source = unique(tags);
  if (source.length === 0) {
    return {
      picked: [],
      nextState: { queue: [], lastPicked: [] },
    };
  }

  const safeCount = Math.min(count, source.length);
  let queue = Array.isArray(platformState.queue) ? [...platformState.queue] : [];
  const lastPicked = Array.isArray(platformState.lastPicked)
    ? platformState.lastPicked
    : [];
  const picked = [];

  while (picked.length < safeCount) {
    if (queue.length === 0) {
      queue = shuffle(source);

      if (
        picked.length === 0 &&
        lastPicked.length > 0 &&
        queue.length > 1 &&
        queue[0] === lastPicked[lastPicked.length - 1]
      ) {
        [queue[0], queue[1]] = [queue[1], queue[0]];
      }
    }

    const nextTag = queue.shift();
    if (!nextTag || picked.includes(nextTag)) {
      continue;
    }

    picked.push(nextTag);
  }

  return {
    picked,
    nextState: {
      queue,
      lastPicked: picked,
    },
  };
}

function ensureSeedRows() {
  const now = new Date().toISOString();
  const platforms = ["instagram", "tiktok"];

  const insertSeedStmt = db.prepare(`
    INSERT INTO hashtag_rotation_state (
      platform,
      queue_json,
      last_picked_json,
      updated_at
    ) VALUES (
      @platform,
      @queue_json,
      @last_picked_json,
      @updated_at
    )
    ON CONFLICT(platform) DO NOTHING
  `);

  for (const platform of platforms) {
    insertSeedStmt.run({
      platform,
      queue_json: JSON.stringify([]),
      last_picked_json: JSON.stringify([]),
      updated_at: now,
    });
  }
}

ensureSeedRows();

async function selectCycleHashtags() {
  const mode = CONFIG.hashtagSelectionMode;
  const count = CONFIG.hashtagsPerCycle;

  const instagramState = readPlatformState("instagram");
  const tiktokState = readPlatformState("tiktok");

  let instagram = [];
  let tiktok = [];

  if (mode === "all") {
    instagram = unique(CONFIG.instagramHashtags).slice(
      0,
      Math.min(count, unique(CONFIG.instagramHashtags).length),
    );
    tiktok = unique(CONFIG.tiktokHashtags).slice(
      0,
      Math.min(count, unique(CONFIG.tiktokHashtags).length),
    );
  } else if (mode === "random") {
    instagram = pickRandom(
      CONFIG.instagramHashtags,
      count,
      instagramState.lastPicked,
    );
    tiktok = pickRandom(
      CONFIG.tiktokHashtags,
      count,
      tiktokState.lastPicked,
    );

    writePlatformState("instagram", { queue: [], lastPicked: instagram });
    writePlatformState("tiktok", { queue: [], lastPicked: tiktok });
  } else {
    const instagramSelection = pickFromQueue(
      CONFIG.instagramHashtags,
      count,
      instagramState,
    );
    const tiktokSelection = pickFromQueue(
      CONFIG.tiktokHashtags,
      count,
      tiktokState,
    );

    instagram = instagramSelection.picked;
    tiktok = tiktokSelection.picked;

    writePlatformState("instagram", instagramSelection.nextState);
    writePlatformState("tiktok", tiktokSelection.nextState);
  }

  logger.info(
    {
      mode,
      hashtagsPerCycle: count,
      instagram,
      tiktok,
    },
    "selected hashtags for scrape cycle",
  );

  return {
    instagram,
    tiktok,
    mode,
    hashtagsPerCycle: count,
  };
}

module.exports = {
  selectCycleHashtags,
};