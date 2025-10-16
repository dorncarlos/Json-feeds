const axios = require("axios");
const sharp = require("sharp");
const path = require("path");

const {
  API_TOKEN,
  BUNNY_STORAGE_ZONE,
  BUNNY_STORAGE_API_KEY,
  BUNNY_CDN_BASE,
  BUNNY_PATH
} = process.env;

if (!API_TOKEN || !BUNNY_STORAGE_ZONE || !BUNNY_STORAGE_API_KEY || !BUNNY_CDN_BASE || !BUNNY_PATH) {
  console.error("❌ Missing required environment variables in .env");
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
  Kids: ["kids", "cartoon", "animation", "children", "family", "fun", "educational"],
  Sports: ["football", "soccer", "basketball", "tennis", "race", "sports", "cricket"],
  Documentary: ["documentary", "history", "wildlife", "nature", "science", "culture"],
  Travel: ["travel", "journey", "explore", "adventure", "trip", "vacation"],
  Music: ["music", "song", "concert", "live", "dj", "artist"],
  Food: ["food", "cooking", "recipe", "chef", "kitchen", "meal"],
  Educational: ["learn", "education", "tutorial", "class", "lesson"],
  Comedy: ["funny", "comedy", "laugh", "humor", "standup", "sketch"],
  Drama: ["drama", "series", "emotional", "thriller", "movie"],
  Horror: ["horror", "ghost", "scary", "zombie", "fear"],
  Romance: ["love", "romance", "relationship", "couple", "wedding"],
  News: ["news", "headline", "report", "update", "politics"]
};

function joinPaths(...parts) {
  return parts.map((p) => String(p).replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

function isValidImageUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  const validExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  if (!validExtensions.some(ext => lower.includes(ext))) return false;
  if (lower.includes("error") || lower.includes("placeholder")) return false;
  return true;
}

async function retryRequest(fn, retries = 3, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch {
      if (attempt < retries) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

async function validateAndFixImage(imageUrl, fileName) {
  try {
    if (!isValidImageUrl(imageUrl)) throw new Error("Invalid image URL");

    // Detect extension
    const isPng = imageUrl.toLowerCase().endsWith(".png");
    const format = isPng ? "png" : "jpeg";
    const ext = isPng ? "png" : "jpg";

    // Fetch image
    const response = await retryRequest(async () => {
      const res = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 40000,
        validateStatus: (status) => status >= 200 && status < 400
      });
      const type = res.headers["content-type"] || "";
      if (!type.startsWith("image/")) throw new Error(`Invalid image type: ${type}`);
      return res;
    });

    const buffer = Buffer.from(response.data);

    // ✅ Always resize to uniform 1152x648
    const resizedBuffer = await sharp(buffer)
      .resize(1152, 648, { fit: "cover", position: "center" })
      [format]({ quality: 80 })
      .toBuffer();

    // Upload to BunnyCDN
    const destPath = joinPaths(BUNNY_STORAGE_ZONE, BUNNY_PATH, `images/${fileName}.${ext}`);
    const uploadUrl = `https://storage.bunnycdn.com/${destPath}`;

    await axios.put(uploadUrl, resizedBuffer, {
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
        "Content-Type": isPng ? "image/png" : "image/jpeg",
        "Cache-Control": "no-cache"
      },
      timeout: 30000
    });

    return `${BUNNY_CDN_BASE}/${joinPaths(BUNNY_PATH, `images/${fileName}.${ext}`)}`;
  } catch (err) {
    console.warn(`⚠️ Skipping invalid or broken image: ${imageUrl}`);
    return null;
  }
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
    if (keywords.some((keyword) => text.includes(keyword))) return [genre];
  }
  return videoData.isLiveStream ? ["News"] : ["Action"];
}

function sanitizeDescriptions(videoData) {
  let shortDesc = videoData.shortDescription || "";
  let longDesc = videoData.longDescription || "";

  if (!shortDesc && !longDesc) {
    shortDesc = `Watch ${videoData.title || "this video"} now on Roku.`;
    longDesc = `${videoData.title || "This video"} is available to stream on Roku.`;
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

  const assets = (
    await Promise.all(
      data.map(async (videoData) => {
        try {
          let imageUrl = videoData.landscapeThumbnail?.url || "";
          if (!isValidImageUrl(imageUrl)) return null;

          const fileName = videoData._id || `img_${Date.now()}`;
          imageUrl = await validateAndFixImage(imageUrl, fileName);
          if (!imageUrl) return null;

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
            images: [{ type: "main", url: imageUrl, languages: ["en"] }],
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
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean);

  return {
    version: "1",
    defaultLanguage: "en",
    defaultAvailabilityCountries: ["us", "mx"],
    assets
  };
}

async function uploadToBunny(feedString, filename) {
  const destPath = joinPaths(BUNNY_STORAGE_ZONE, BUNNY_PATH, `feeds/${filename}`);
  const uploadUrl = `https://storage.bunnycdn.com/${destPath}`;

  const resp = await axios.put(uploadUrl, feedString, {
    headers: {
      AccessKey: BUNNY_STORAGE_API_KEY,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });

  if (resp.status >= 200 && resp.status < 300) {
    return `${BUNNY_CDN_BASE}/${joinPaths(BUNNY_PATH, `feeds/${filename}`)}`;
  } else {
    throw new Error(`Upload failed with status ${resp.status}`);
  }
}

module.exports = { generateFeed, uploadToBunny };
