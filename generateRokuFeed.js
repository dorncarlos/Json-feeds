const fs = require("fs");
const Airtable = require("airtable");
require("dotenv").config();

// Airtable setup
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base("appM9WlWxrWZwSu5j");

// Table name in Airtable
const TABLE_NAME = "Live Olympics TV";

// Roku feed output file
const OUTPUT_FILE = "roku_feed.json";

// Map Airtable contentRating → Roku advisory rating
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
    console.log("📥 Fetching data from Airtable...");

    const records = await base(TABLE_NAME).select({}).all();

    const assets = records.map((record) => {
      const fields = record.fields;

      // Advisory Ratings
      let advisoryRatings = [];
      if (fields.contentRating && ratingMap[fields.contentRating]) {
        advisoryRatings.push({
          source: "USA_PR",
          value: ratingMap[fields.contentRating]
        });
      }

      // Genres (expects array or single value)
      let genres = [];
      if (fields.genres) {
        if (Array.isArray(fields.genres)) {
          genres = fields.genres.map((g) => g.trim());
        } else if (typeof fields.genres === "string") {
          genres = [fields.genres.trim()];
        }
      }

      // Build asset object
      const asset = {
        id: fields.video_id || "",
        type: fields.isLiveStream ? "live" : "shortform",
        titles: [
          {
            value: fields.video_title || "",
            language: "en"
          }
        ],
        shortDescriptions: [
          {
            value: fields.video_description || "",
            languages: ["en"]
          }
        ],
        longDescriptions: [
          {
            value: fields.long_description || "",
            languages: ["en"]
          }
        ],
        releaseDate: fields.releaseDate || "",
        genres,
        advisoryRatings,
        images: fields.thumbnail_url
          ? [
              {
                type: "landscape",
                url: fields.thumbnail_url,
                languages: ["en"]
              }
            ]
          : [],
        content: {
          playOptions: [
            {
              license: "free",
              quality: "hd",
              videoType: "HLS", // Roku prefers HLS
              playId: fields.video_id || "",
              url: fields.stream_url || "",
              availabilityInfo: {
                country: ["us", "mx"]
              }
            }
          ]
        }
      };

      // Only include duration for VOD (not live)
      if (!fields.isLiveStream) {
        asset.durationInSeconds = fields.durationInSeconds || 0;
      }

      return asset;
    });

    const feed = {
      version: "1.0",
      defaultLanguage: "en",
      defaultAvailabilityCountries: ["us", "mx"],
      assets
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(feed, null, 2));
    console.log(`✅ Roku feed generated: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("❌ Error generating Roku feed:", error.message);
  }
}

generateRokuFeed();
