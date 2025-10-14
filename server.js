const express = require("express");
require("dotenv").config();

const { generateFeed, uploadToBunny } = require("./generate_json");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/generate-feed", async (req, res) => {
  const brandId = req.query.brandId;
  if (!brandId) return res.status(400).json({ error: "Missing brandId query param" });

  try {
    console.log(`Generating feed for brand: ${brandId}`);

    const feedData = await generateFeed(brandId);
    const feedString = JSON.stringify(feedData, null, 2);
    const filename = `${brandId}_roku_feed.json`;

    const publicUrl = await uploadToBunny(feedString, filename);

    console.log("Feed uploaded:", publicUrl);

    res.json({
      message: "Feed generated successfully",
      brandId,
      feedUrl: publicUrl
    });
  } catch (err) {
    console.error("Error generating feed:", err.message || err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
