const axios = require("axios");

const {
  API_TOKEN,
  BUNNY_STORAGE_ZONE,
  BUNNY_STORAGE_API_KEY,
  BUNNY_CDN_BASE,
  BUNNY_PATH
} = process.env;

if (!API_TOKEN || !BUNNY_STORAGE_ZONE || !BUNNY_STORAGE_API_KEY || !BUNNY_CDN_BASE || !BUNNY_PATH) {
  console.error("Missing required environment variables in .env");
  process.exit(1);
}

const ratingMap = {
  G: "TVY",
  PG: "TVY7",
  "PG-13": "TV14",
  PG13: "TV14",
  R: "TVMA",
  "NC-17": "TVMA",
  NC17: "TVMA",
  UR: "NR"
};

const genreKeywords = {
  Kids: ["kids", "cartoon", "animation", "children", "family"],
  Sports: ["football", "soccer", "basketball", "tennis", "race"],
  Documentary: ["documentary", "history", "wildlife", "nature"],
  Travel: ["travel", "journey", "explore", "adventure"],
  Music: ["music", "song", "concert"],
  Food: ["food", "cooking", "recipe"],
  Educational: ["learn", "education", "tutorial"],
  Comedy: ["funny", "comedy", "laugh"],
  Drama: ["drama", "series", "emotional"],
  Horror: ["horror", "ghost", "scary"],
  Romance: ["love", "romance"],
  News: ["news", "headline", "report"]
};

function joinPaths(...parts) {
  return parts.map((p) => String(p).replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

function getGenresFromContent(videoData) {
  const text = (
    (videoData.title || "") +
    " " +
    (videoData.shortDescription || "") +
    " " +
    (videoData.longDescription || "")
  ).toLowerCase();

  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return [genre];
    }
  }

  return videoData.isLiveStream ? ["News"] : ["Action"];
}

function sanitizeDescriptions(videoData) {
  let shortDesc = videoData.shortDescription || "";
  let longDesc = videoData.longDescription || "";

  if (!shortDesc && !longDesc) {
    shortDesc = `Watch ${videoData.title || "this video"} now on Roku.`;
    longDesc = `${videoData.title || "This video"} is available to stream on Roku. Enjoy the content now!`;
  }

  if (!shortDesc) {
    shortDesc = longDesc.slice(0, 100) + (longDesc.length > 100 ? "…" : "");
  }

  if (!longDesc) {
    longDesc = shortDesc + " Full episode available on Roku.";
  }

  if (shortDesc === longDesc) {
    shortDesc = shortDesc.slice(0, Math.min(80, shortDesc.length)) + "...";
  }

  return { shortDesc, longDesc };
}

async function generateFeed(brandId) {
  const API_URL = `https://backend.castify.ai/api/brands/${brandId}/contents?limit=1000`;

  const resp = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    timeout: 30000
  });

  const data = resp.data.data;
  if (!Array.isArray(data)) throw new Error("Expected array of content");

  const assets = data.map((videoData) => {
    const advisoryRatings = [];
    if (videoData.ageRating && ratingMap[videoData.ageRating]) {
      advisoryRatings.push({ source: "USA_PR", value: ratingMap[videoData.ageRating] });
    }

    const genres = getGenresFromContent(videoData);
    const durationInSeconds = videoData.isLiveStream
      ? 7200
      : Math.floor(Math.random() * (1200 - 300 + 1)) + 300;

    const { shortDesc, longDesc } = sanitizeDescriptions(videoData);

    return {
      id: videoData._id || "",
      type: videoData.type || "movie",
      titles: [{ value: videoData.title || "", languages: ["en"] }],
      shortDescriptions: [{ value: shortDesc, languages: ["en"] }],
      longDescriptions: [{ value: longDesc, languages: ["en"] }],
      releaseDate: videoData.createdAt
        ? new Date(videoData.createdAt).toISOString().split("T")[0]
        : "",
      genres,
      advisoryRatings,
      images: videoData.landscapeThumbnail?.url
        ? [{ type: "main", url: videoData.landscapeThumbnail.url, languages: ["en"] }]
        : [],
      durationInSeconds,
      content: {
        playOptions: [
          {
            license: "free",
            quality: "hd",
            playId: videoData._id || "",
            availabilityStartTime: "2024-01-01T00:00:00Z",
            availabilityInfo: { country: ["us", "mx"] }
          }
        ]
      }
    };
  });

  return {
    version: "1",
    defaultLanguage: "en",
    defaultAvailabilityCountries: ["us", "mx"],
    assets
  };
}

async function uploadToBunny(feedString, filename) {
  const destPath = joinPaths(BUNNY_STORAGE_ZONE, BUNNY_PATH, filename);
  const uploadUrl = `https://storage.bunnycdn.com/${destPath}`;

  const resp = await axios.put(uploadUrl, feedString, {
    headers: {
      AccessKey: BUNNY_STORAGE_API_KEY,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });

  if (resp.status >= 200 && resp.status < 300) {
    return `${BUNNY_CDN_BASE}/${joinPaths(BUNNY_PATH, filename)}`;
  } else {
    throw new Error(`Upload failed with status ${resp.status}`);
  }
}

module.exports = { generateFeed, uploadToBunny };
