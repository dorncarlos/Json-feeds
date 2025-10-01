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
      await base("Live Olympics TV").create({
        video_id: videoData._id || "",
        video_title: videoData.title || "",
        video_description: videoData.shortDescription || "",
        long_description: videoData.longDescription || "",
        releaseDate: videoData.createdAt
       ? new Date(videoData.createdAt).toISOString().split("T")[0]
       : null,

        durationInSeconds: parseInt(videoData.duration) || 0,
        isLiveStream: !!videoData.isLiveStream,
        contentRating: videoData.ageRating || "",

        thumbnail_upload: videoData.landscapeThumbnail?.url
          ? [{ url: videoData.landscapeThumbnail.url }]
          : [],
        thumbnail_url: videoData.landscapeThumbnail?.url || "",

        portrait_thumbnail: videoData.verticalThumbnail?.url
          ? [{ url: videoData.verticalThumbnail.url }]
          : [],

        // Stream link
        stream_url: videoData.file?.url || "",
      });

      console.log(`Added: ${videoData.title}`);
    }

    console.log("Import complete!");
  } catch (error) {
    console.error("Error importing data:", error.response?.data || error.message);
  }
}

importData();
