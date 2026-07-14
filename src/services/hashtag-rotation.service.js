// src/services/hashtag-rotation.service.js
const fs = require("fs/promises");
const crypto = require("crypto");
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

async function readState() {
  try {
    const raw = await fs.readFile(CONFIG.hashtagRotationStatePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      instagram: {
        queue: Array.isArray(parsed?.instagram?.queue)
          ? parsed.instagram.queue
          : [],
        lastPicked: Array.isArray(parsed?.instagram?.lastPicked)
          ? parsed.instagram.lastPicked
          : [],
      },
      tiktok: {
        queue: Array.isArray(parsed?.tiktok?.queue)
          ? parsed.tiktok.queue
          : [],
        lastPicked: Array.isArray(parsed?.tiktok?.lastPicked)
          ? parsed.tiktok.lastPicked
          : [],
      },
    };
  } catch {
    return {
      instagram: { queue: [], lastPicked: [] },
      tiktok: { queue: [], lastPicked: [] },
    };
  }
}

async function writeState(state) {
  await fs.writeFile(
    CONFIG.hashtagRotationStatePath,
    JSON.stringify(state, null, 2),
    "utf8",
  );
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

async function selectCycleHashtags() {
  const state = await readState();
  const mode = CONFIG.hashtagSelectionMode;
  const count = CONFIG.hashtagsPerCycle;

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
      state.instagram.lastPicked,
    );
    tiktok = pickRandom(
      CONFIG.tiktokHashtags,
      count,
      state.tiktok.lastPicked,
    );

    state.instagram = { queue: [], lastPicked: instagram };
    state.tiktok = { queue: [], lastPicked: tiktok };
    await writeState(state);
  } else {
    const instagramSelection = pickFromQueue(
      CONFIG.instagramHashtags,
      count,
      state.instagram,
    );
    const tiktokSelection = pickFromQueue(
      CONFIG.tiktokHashtags,
      count,
      state.tiktok,
    );

    instagram = instagramSelection.picked;
    tiktok = tiktokSelection.picked;

    state.instagram = instagramSelection.nextState;
    state.tiktok = tiktokSelection.nextState;
    await writeState(state);
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