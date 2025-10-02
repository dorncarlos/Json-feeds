const axios = require("axios");
const Airtable = require("airtable");
require("dotenv").config();

// Airtable setup
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base("appM9WlWxrWZwSu5j");

// API endpoint
const API_URL = 'https://backend.castify.ai/api/brands/685b8e0ca250d043534bdcd3/contents?limit=1000';

async function importData() {
  try {
    const response = await axios.get(API_URL, {
      headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
    });

    const data = response.data.data;
    if (!Array.isArray(data)) throw new Error("Expected array at response.data.data");

    console.log(`📦 Found ${data.length} videos to import`);

    for (const videoData of data) {
      // build fields dynamically and skip empty ones
      const fields = {
        video_id: videoData._id || undefined,
        video_title: videoData.title || undefined,
        video_description: videoData.shortDescription || undefined,
        long_description: videoData.longDescription || undefined,
        releaseDate: videoData.createdAt
          ? new Date(videoData.createdAt).toISOString().split("T")[0]
          : undefined,

        durationInSeconds: videoData.isLiveStream
          ? undefined // skip duration if live
          : parseInt(videoData.duration) || undefined,

        isLiveStream: videoData.isLiveStream || false,
        contentRating: videoData.ageRating || undefined,

        // Handle type as plain text
        type: videoData.type ? String(videoData.type) : undefined,

        // Genres as comma-separated text
        genre: Array.isArray(videoData.genre) && videoData.genres.length > 0
          ? videoData.genres.map(g => g.name).join(", ")
          : undefined,

        // Images
        thumbnail_upload: videoData.landscapeThumbnail?.url
          ? [{ url: videoData.landscapeThumbnail.url }]
          : [],
        thumbnail_url: videoData.landscapeThumbnail?.url || undefined,

        portrait_thumbnail: videoData.verticalThumbnail?.url
          ? [{ url: videoData.verticalThumbnail.url }]
          : [],

        // Stream link
        stream_url: videoData.file?.url || undefined,
      };

      // Remove any undefined values so Airtable doesn’t reject them
      Object.keys(fields).forEach(
        (key) => fields[key] === undefined && delete fields[key]
      );

      await base("Live Olympics TV").create(fields);

      console.log(`✅ Added: ${videoData.title}`);
    }

    console.log("🎉 Import complete!");
  } catch (error) {
    console.error("❌ Error importing data:", error.response?.data || error.message);
  }
}

importData();
