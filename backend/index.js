/**
 *   1) Accept an uploaded screenshot (multer)
 *   2) Use Google Gemini to parse show name + timestamp from the screenshot (multimodal)
 *   3) iTunes search => feedUrl
 *   4) Parse feed => real audio link
 *   5) Extract 5s around timestamp
 */

import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import Parser from "rss-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

// for ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const app = express();
const PORT = 4000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const rssParser = new Parser();

/** parse a HH:MM:SS or HH:MM timestamp from text. */
function parseTimestamp(text) {
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  let hours = 0, minutes = 0, seconds = 0;
  if (match[3]) {
    hours = parseInt(match[1], 10);
    minutes = parseInt(match[2], 10);
    seconds = parseInt(match[3], 10);
  } else {
    minutes = parseInt(match[1], 10);
    seconds = parseInt(match[2], 10);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

async function parseWithGemini(imagePath) {
  try {
    console.log("Starting Gemini analysis...");
    
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found at path: ${imagePath}`);
    }
    
    const imageData = fs.readFileSync(imagePath);
    const imageBase64 = imageData.toString('base64');
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/jpeg",
      },
    };
    
    const prompt = `
    This is a screenshot from a podcast player. Extract exactly two pieces of information:
    1. The podcast title (name of the show)
    2. The current timestamp shown in the player (in format HH:MM:SS or MM:SS)
    
    Return ONLY a JSON object with these two fields:
    {"title": "podcast title here", "timestamp": "00:00:00"}
    
    If you can't find one of these values, use an empty string for that field.
    `;
    
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    
    console.log("Gemini raw response:", text);
    
    const jsonMatch = text.match(/\{[\s\S]*"title"[\s\S]*"timestamp"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.error("Error parsing JSON from Gemini response:", err);
        // Try a simpler approach to extract information
        const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
        const timestampMatch = text.match(/"timestamp"\s*:\s*"([^"]*)"/);
        return {
          title: titleMatch ? titleMatch[1] : "",
          timestamp: timestampMatch ? timestampMatch[1] : ""
        };
      }
    }
    
    console.error("Could not extract JSON from Gemini response");
    return { title: "", timestamp: "" };
  } catch (err) {
    console.error("Gemini analysis error:", err.message);
    return { title: "", timestamp: "" };
  }
}

/** iTunes search  */
async function getFeedUrlFromiTunes(showName) {
  if (!showName) throw new Error("No show name for iTunes search.");
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(showName)}&entity=podcast`;
  
  try {
    const resp = await axios.get(url, { timeout: 10000 });
    if (resp.data.resultCount === 0) {
      throw new Error(`No podcast found on iTunes for: ${showName}`);
    }
    const first = resp.data.results[0];
    if (!first.feedUrl) {
      throw new Error(`No feedUrl in iTunes result for show: ${showName}`);
    }
    return first.feedUrl;
  } catch (err) {
    console.error("iTunes search error:", err.message);
    throw new Error(`Failed to search iTunes: ${err.message}`);
  }
}

/** parse feed => mp3 link */
async function getPodcastAudioFromFeed(feedUrl) {
  try {
    const feed = await rssParser.parseURL(feedUrl);
    if (!feed.items?.length) {
      throw new Error("No items in RSS feed.");
    }

    const firstItem = feed.items[0];
    if (!firstItem.enclosure?.url) {
      throw new Error("No enclosure URL in the feed item.");
    }
    return firstItem.enclosure.url;
  } catch (err) {
    console.error("Feed parsing error:", err.message);
    throw new Error(`Failed to parse feed: ${err.message}`);
  }
}

/** demo: extract 5s around timestamp with FFmpeg */
function extractAudioSnippet(timestampSecs, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    let start = timestampSecs - 2;
    if (start < 0) start = 0;
    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(5)
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .run();
  });
}

// Simple route
app.get("/", (req, res) => {
  res.send("PodShot backend is running...");
});

/**
 * POST /process-screenshot 
 *   1) upload screenshot
 *   2) analyze with Gemini => showName/timestamp
 *   3) iTunes => feedUrl => parse => MP3
 *   4) extract 5s snippet
 */
app.post("/process-screenshot", upload.single("screenshot"), async (req, res) => {
  // TODO: delete
  if (!fs.existsSync('uploads/')) {
    fs.mkdirSync('uploads/');
  }
  
  if (!req.file) {
    return res.status(400).json({ error: "No screenshot uploaded." });
  }
  
  console.log("Screenshot received:", req.file.path);
  const screenshotPath = req.file.path;
  
  try {
    // 1) LLM (Gemini) analysis
    const { title, timestamp } = await parseWithGemini(screenshotPath);
    const guessedTitle = title || "";
    const timestampSecs = parseTimestamp(timestamp || "");

    console.log("Parsed from screenshot:", { guessedTitle, timestamp, timestampSecs });
    
    if (!guessedTitle) {
      throw new Error("No valid show name extracted from screenshot.");
    }

    // 2) iTunes => feedUrl => parse => MP3
    console.log("Searching iTunes for:", guessedTitle);
    const feedUrl = await getFeedUrlFromiTunes(guessedTitle);
    console.log("Found feed URL:", feedUrl);
    
    const audioUrl = await getPodcastAudioFromFeed(feedUrl);
    console.log("Found audio URL:", audioUrl);

    /*
    const fullAudioPath = path.join(__dirname, "temp_full_audio.mp3");
    console.log("Downloading audio...");
    const audioResp = await axios.get(audioUrl, { 
      responseType: "arraybuffer",
      timeout: 30000
    });
    fs.writeFileSync(fullAudioPath, audioResp.data);

    const snippetPath = path.join(__dirname, `snippet_${Date.now()}.mp3`);
    await extractAudioSnippet(timestampSecs, fullAudioPath, snippetPath);
    
    // cleanup
    fs.unlinkSync(fullAudioPath);
    */

    // cleanup
    fs.unlinkSync(screenshotPath);

    return res.json({
      success: true,
      foundTimestamp: timestampSecs,
      guessedTitle,
      feedUrl,
      audioUrl,
      snippetInfo: "Audio processing skipped for demo"
    });
  } catch (err) {
    console.error("Processing error:", err);
    return res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`For external access, use: http://192.168.1.175:${PORT}`);
  
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ WARNING: GEMINI_API_KEY not set in environment variables!");
    console.warn("Get a free API key from https://aistudio.google.com/");
  }
});