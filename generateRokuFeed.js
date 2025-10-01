const fs = require("fs");
const Airtable = require("airtable");
require("dotenv").config();

// Airtable setup 
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base("appM9WlWxrWZwSu5j");

// Table name in Airtable
const TABLE_NAME = "Live Olympics TV ";

// Roku feed output file
const OUTPUT_FILE = "Live Olympics TV_feed.json";

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

      return {
        id: fields.video_id || "",
        type: "shortform",
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
        genres: fields.genres ? [fields.genres] : [],
        advisoryRatings,
        images: fields.thumbnail_url
          ? [
              {
                type: "main",
                url: fields.thumbnail_url,
                languages: ["en"]
              }
            ]
          : [],
        durationInSeconds: fields.durationInSeconds || 0,
        content: {
          playOptions: [
            {
              license: "free",
              quality: "hd",
              playId: fields.video_id || "",
              availabilityInfo: {
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
