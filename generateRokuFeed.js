const fs = require("fs");
const Airtable = require("airtable");
require("dotenv").config();

// Airtable setup
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base("appM9WlWxrWZwSu5j");

// Table name in Airtable
const TABLE_NAME = "Live Olympics TV";

// Roku feed output file
const OUTPUT_FILE = "LiveOlympics_feed.json";

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

      // Ensure descriptions are different
      let shortDesc = fields.video_description || "";
      let longDesc = fields.long_description || "";
      if (longDesc === shortDesc) {
        longDesc = shortDesc + " Learn more about this program.";
      }

      // Handle advisory rating mapping
      let advisoryRatings = [];
      if (fields.ageRating && ratingMap[fields.ageRating]) {
        advisoryRatings.push({
          source: "USA_PR",
          value: ratingMap[fields.ageRating]
        });
      }

      // Default duration (must be >= 60 sec for Roku validation)
      const duration = fields.durationInSeconds && fields.durationInSeconds > 60 
        ? fields.durationInSeconds 
        : 60;

      // Ensure at least one image
      const images = [];
      if (fields.thumbnail_url) {
        images.push({
          type: "main",
          url: fields.thumbnail_url,
          languages: ["en"]
        });
      }
      if (fields.portrait_thumbnail?.[0]?.url) {
        images.push({
          type: "poster",
          url: fields.portrait_thumbnail[0].url,
          languages: ["en"]
        });
      }
      if (images.length === 0) {
        images.push({
          type: "main",
          url: "https://via.placeholder.com/800x450.png?text=No+Image",
          languages: ["en"]
        });
      }

      return {
        id: fields.video_id || "",
        type: "shortform",
        title: fields.video_title || "",
        shortDescriptions: [
          {
            value: shortDesc,
            languages: ["en"]
          }
        ],
        longDescriptions: [
          {
            value: longDesc,
            languages: ["en"]
          }
        ],
        releaseDate: fields.releaseDate || new Date().toISOString(),
        genres: fields.genres ? [fields.genres] : ["Uncategorized"],
        advisoryRatings,
        images,
        durationInSeconds: duration,
        content: {
          playOptions: [
            {
              license: "free",
              quality: "hd",
              playId: fields.video_id || "",
              availabilityStart: "2025-01-01T00:00:00Z",
              availabilityEnd: "2030-01-01T00:00:00Z",
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
      providerName: "Todazon",
      defaultLanguage: "en",
      defaultAvailabilityCountries: ["us", "mx"],
      assets
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(feed, null, 2));
    console.log(`✅ Roku feed generated successfully: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("❌ Error generating Roku feed:", error.message);
  }
}

generateRokuFeed();
