const fs = require("fs");
const Airtable = require("airtable");
require("dotenv").config();

// Airtable setup 
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base("appM9WlWxrWZwSu5j");

// Table name in Airtable
const TABLE_NAME = "Ento Live Network";

// Roku feed output file
const OUTPUT_FILE = "Ento Live Network_feed.json";

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
    console.log("Fetching data from Airtable...");

    const records = await base(TABLE_NAME).select({}).all();

    const assets = records.map((record) => {
      const fields = record.fields;

      // Handle advisory rating mapping
      let advisoryRatings = [];
      if (fields.contentRating && ratingMap[fields.contentRating]) {
        advisoryRatings.push({
          source: "USA_PR",
          value: ratingMap[fields.contentRating]
        });
      }

      // FIX: Add genres - use "Sports" for Olympic content
      const genres = ["Sports"];
      
      // FIX: Set realistic duration (minimum 60 seconds)
      const durationInSeconds = fields.durationInSeconds && fields.durationInSeconds >= 60 
        ? fields.durationInSeconds 
        : 300; // 5 minutes default

      return {
        id: fields.video_id || "",
        type: "movie",
        titles: [
          {
            value: fields.video_title || "",
            languages: ["en"] // FIX: Changed to languages array (not deprecated)
          }
        ],
        shortDescriptions: [
          {
            value: fields.video_description || "",
            languages: ["en"] // FIX: Changed to languages array (not deprecated)
          }
        ],
        longDescriptions: [
          {
            value: fields.long_description || "",
            languages: ["en"] // FIX: Changed to languages array (not deprecated)
          }
        ],
        releaseDate: fields.releaseDate || "",
        genres: genres,
        advisoryRatings,
        images: fields.thumbnail_url
          ? [
              {
                type: "main", // FIX: Using "main" as required by schema
                url: fields.thumbnail_url,
                languages: ["en"] // FIX: Changed to languages array (not deprecated)
              }
            ]
          : [],
        durationInSeconds: durationInSeconds,
        content: {
          playOptions: [
            {
              license: "free",
              quality: "hd",
              playId: fields.video_id || "",
              availabilityInfo: {
                availabilityStartTime: "2024-01-01T00:00:00Z", // FIX: Added required field
                country: ["us", "mx"]
              }
            }
          ]
        }
      };
    });

    const feed = {
      version: "1",
      defaultLanguage: "en", // This is still required at feed level
      defaultAvailabilityCountries: ["us", "mx"],
      assets
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(feed, null, 2));
    console.log(`✅ Roku feed generated: ${OUTPUT_FILE}`);
    console.log(`📊 Total assets: ${assets.length}`);
    
  } catch (error) {
    console.error("Error generating Roku feed:", error.message);
  }
}

generateRokuFeed();