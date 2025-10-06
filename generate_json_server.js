const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_TOKEN = process.env.API_TOKEN;
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_CDN_BASE = process.env.BUNNY_CDN_BASE;
const BUNNY_PATH = process.env.BUNNY_PATH;

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
  News: ["news", "headline", "report"],
  Adventure: ["adventure", "exploration", "journey"],
  Lifestyle: ["fashion", "style", "beauty", "trend", "culture"]
};

function joinPaths(...parts) {
  return parts
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
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
      advisoryRatings.push({
        source: "USA_PR",
        value: ratingMap[videoData.ageRating]
      });
    }

    const genres = getGenresFromContent(videoData);
    const durationInSeconds = videoData.isLiveStream
      ? 7200
      : Math.floor(Math.random() * (1200 - 300 + 1)) + 300;

    return {
      id: videoData._id || "",
      type: videoData.type || "movie",
      titles: [{ value: videoData.title || "", languages: ["en"] }],
      shortDescriptions: [{ value: videoData.shortDescription || "", languages: ["en"] }],
      longDescriptions: [{ value: videoData.longDescription || "", languages: ["en"] }],
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
    const publicUrl = `${BUNNY_CDN_BASE}/${joinPaths(BUNNY_PATH, filename)}`;
    return publicUrl;
  } else {
    throw new Error(`Upload failed with status ${resp.status}`);
  }
}

app.get("/generate-feed", async (req, res) => {
  const brandId = req.query.brandId;
  if (!brandId) return res.status(400).json({ error: "Missing brandId query param" });

  try {
    console.log(`Generating feed for brand: ${brandId}`);

    const feedData = await generateFeed(brandId);
    const feedString = JSON.stringify(feedData, null, 2);
    const filename = `${brandId}_roku_feed_${Date.now()}.json`;

    const publicUrl = await uploadToBunny(feedString, filename);

    console.log("Feed uploaded:", publicUrl);

    res.json({
      message: "Feed generated successfully",
      brandId,
      feedUrl: publicUrl
    });
  } catch (err) {
    console.error("Error generating feed:", err.message || err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
