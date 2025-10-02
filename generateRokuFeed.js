const fs = require("fs");
const Airtable = require("airtable");
require("dotenv").config();

// Airtable setup 
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base("appM9WlWxrWZwSu5j");

// Table name in Airtable
const TABLE_NAME = "Live Olympics TV";

// Roku feed output file
const OUTPUT_FILE = "Live_Olympics_TV_feed.json";

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

      // Use default genre "Sports" if none provided
      const genres = fields.genres && fields.genres.length > 0 ? fields.genres : ["Sports"];

      // Set a default duration if not provided (5 minutes)
      const durationInSeconds = fields.durationInSeconds || 300;

      return {
        id: fields.video_id || "",
        type: "movie", // Changed from "shortform" to "movie"
        titles: [
          {
            value: fields.video_title || "",
            language: "en" // Changed from deprecated structure
          }
        ],
        shortDescriptions: [
          {
            value: fields.video_description || "",
            language: "en" // Changed from deprecated structure
          }
        ],
        longDescriptions: [
          {
            value: fields.long_description || "",
            language: "en" // Changed from deprecated structure
          }
        ],
        releaseDate: fields.releaseDate || "",
        genres: genres, // Now always has at least "Sports"
        advisoryRatings,
        images: fields.thumbnail_url
          ? [
              {
                type: "thumbnail", // Changed from "main" to "thumbnail"
                url: fields.thumbnail_url,
                language: "en" // Changed from deprecated structure
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
                availabilityStartTime: "2000-01-01T00:00:00Z", // Added required field
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
    console.log(`Roku feed generated: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("Error generating Roku feed:", error.message);
  }
}

generateRokuFeed();