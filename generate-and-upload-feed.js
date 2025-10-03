
const axios = require('axios');
require('dotenv').config();

const BRAND_ID = process.env.BRAND_ID || process.argv[2];
if (!BRAND_ID) {
  console.error('Please provide BRAND_ID (env or first CLI arg).');
  process.exit(1);
}

const API_TOKEN = process.env.API_TOKEN; 
const API_URL = `https://backend.castify.ai/api/brands/${BRAND_ID}/contents?limit=1000`;

// Bunny storage constants (defaults filled in)
const BUNNY_REGION = process.env.BUNNY_REGION;
const BASE_HOSTNAME = "storage.bunnycdn.com";
const BUNNY_HOSTNAME = BUNNY_REGION ? `${BUNNY_REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;

const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_CDN_BASE = (process.env.BUNNY_CDN_BASE);
const BUNNY_PATH = process.env.BUNNY_PATH;

if (!API_TOKEN) {
  console.error("Please set API_TOKEN in env.");
  process.exit(1);
}

// Mapping for ratings
const ratingMap = {
  "G": "TVY",
  "PG": "TVY7",
  "PG-13": "TV14",
  "PG13": "TV14",
  "R": "TVMA",
  "NC-17": "TVMA",
  "NC17": "TVMA",
  "UR": "NR"
};

function joinPaths(...parts) {
  return parts
    .map(p => String(p).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

async function generateFeedFromApi() {
  console.log("Fetching data from API:", API_URL);
  const resp = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    timeout: 30000
  });

  const data = resp.data.data;
  if (!Array.isArray(data)) throw new Error("Expected response.data.data to be an array");

  const assets = data.map(videoData => {
    const advisoryRatings = [];
    if (videoData.ageRating && ratingMap[videoData.ageRating]) {
      advisoryRatings.push({
        source: "USA_PR",
        value: ratingMap[videoData.ageRating]
      });
    }

    const type = videoData.type.toLowerCase();
    const genres = videoData.genres.map(g => g.name);

    const durationInSeconds =
      videoData.duration && videoData.duration >= 60
        ? parseInt(videoData.duration, 10)
        : 300;

    return {
      id: videoData._id || "",
      type,
      titles: [{ value: videoData.title || "", languages: ["en"] }],
      shortDescriptions: [{ value: videoData.shortDescription || "", languages: ["en"] }],
      longDescriptions: [{ value: videoData.longDescription || "", languages: ["en"] }],
      releaseDate: videoData.createdAt
        ? new Date(videoData.createdAt).toISOString().split("T")[0]
        : "",
      genres,
      advisoryRatings,
      images: videoData.landscapeThumbnail?.url
        ? [
            {
              type: "main",
              url: videoData.landscapeThumbnail.url,
              languages: ["en"]
            }
          ]
        : [],
      durationInSeconds,
      content: {
        playOptions: [
          {
            license: "free",
            quality: "hd",
            playId: videoData._id || "",
            availabilityInfo: {
              availabilityStartTime: "2024-01-01T00:00:00Z",
              country: ["us", "mx"]
            }
          }
        ]
      }
    };
  });

  const feed = {
    version: "1",
    defaultLanguage: "en",
    defaultAvailabilityCountries: ["us", "mx"],
    assets
  };

  return JSON.stringify(feed, null, 2);
}

async function uploadToBunnyStorage(feedString, filename) {
  const destPath = joinPaths(BUNNY_STORAGE_ZONE, BUNNY_PATH, filename);
  const uploadUrl = `https://${BUNNY_HOSTNAME}/${destPath}`;

  console.log("Uploading to Bunny Storage:", uploadUrl);

  try {
    const resp = await axios.put(uploadUrl, feedString, {
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(feedString)
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000
    });

    if (resp.status >= 200 && resp.status < 300) {
      const publicUrl = `${BUNNY_CDN_BASE}/${joinPaths(BUNNY_PATH, filename)}`;
      return { ok: true, publicUrl, status: resp.status };
    } else {
      return { ok: false, status: resp.status, data: resp.data };
    }
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message || err };
  }
}

(async function main() {
  try {
    const feedString = await generateFeedFromApi();

    const filename = `${BRAND_ID}_roku_feed.json`;

    const uploadResult = await uploadToBunnyStorage(feedString, filename);

    if (uploadResult.ok) {
      console.log("Upload successful!");
      console.log("Public URL:", uploadResult.publicUrl);
    } else {
      console.error("Upload failed:", uploadResult);
    }
  } catch (err) {
    console.error("Error:", err.response?.data || err.message || err);
  }
})();
