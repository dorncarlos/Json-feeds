const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

// API endpoint (replace with dynamic brand id later in CMS)
const API_URL = 'https://backend.castify.ai/api/brands/685b133ba250d04353496324/contents?limit=1000';

// Roku feed output file
const OUTPUT_FILE = "Ento_Live_Network_feed.json";

// Map contentRating
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

async function generateRokuFeed() {
  try {
    console.log("Fetching data from API...");

    const response = await axios.get(API_URL, {
      headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
    });

    const data = response.data.data;
    if (!Array.isArray(data)) throw new Error("Expected array at response.data.data");

    console.log(`📦 Found ${data.length} videos`);

    const assets = data.map((videoData) => {
      let advisoryRatings = [];
      if (videoData.ageRating && ratingMap[videoData.ageRating]) {
        advisoryRatings.push({
          source: "USA_PR",
          value: ratingMap[videoData.ageRating]
        });
      }

     
      const type = videoData.type.toLowerCase();
      const genres = videoData.genres.map(g => g.name);


      const durationInSeconds = videoData.duration && videoData.duration >= 60
        ? parseInt(videoData.duration)
        : 300;

      return {
        id: videoData._id || "",
        type: type,
        titles: [
          {
            value: videoData.title || "",
            languages: ["en"]
          }
        ],
        shortDescriptions: [
          {
            value: videoData.shortDescription || "",
            languages: ["en"]
          }
        ],
        longDescriptions: [
          {
            value: videoData.longDescription || "",
            languages: ["en"]
          }
        ],
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
        durationInSeconds: durationInSeconds,
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

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(feed, null, 2));
    console.log(`✅ Roku feed generated: ${OUTPUT_FILE}`);
    console.log(`Total assets: ${assets.length}`);

  } catch (error) {
    console.error("Error generating Roku feed:", error.response?.data || error.message);
  }
}

generateRokuFeed();
