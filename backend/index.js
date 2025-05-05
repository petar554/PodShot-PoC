import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import axios from "axios";
import Parser from "rss-parser";
import path from "path";
import speech from "@google-cloud/speech";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import tesseract from "node-tesseract-ocr";
import sharp from "sharp";

import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createCanvas, loadImage } from "canvas";
import { processTemplate } from './templateModel.js';
import { extractRegion } from './utils/imageUtils.js';
import { getDB } from './db.js';
import { listTemplates, getTemplateDetails, backupDatabase } from './dbTools.js';

// Initialize Google Speech-to-Text client
// const speechClient = new speech.SpeechClient();
// const keyFilePath = path.join(__dirname, 'nimble-petal-453918-q5-8ef417a842d5.json');
const speechClient = new speech.SpeechClient({
  keyFilename: "C:/keys/nimble-petal-453918-q5-8ef417a842d5.json",
});

// for ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const app = express();
const PORT = 8000;

// public directory for audio files if it doesn't exist
const PUBLIC_DIR = path.join(__dirname, "public");
const AUDIO_DIR = path.join(PUBLIC_DIR, "audio");
const TEMPLATES_DIR = path.join(__dirname, "templates");

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR);
}
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR);
}
if (!fs.existsSync("uploads/")) {
  fs.mkdirSync("uploads/");
}

app.use("/public", express.static(PUBLIC_DIR));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const rssParser = new Parser();

// simple perceptual hash function for image similarity
async function imageHashSimple(imageBuffer) {
  try {
    // resize image to 8x8 grayscale for simple hash
    const resizedBuffer = await sharp(imageBuffer)
      .resize(8, 8)
      .grayscale()
      .raw()
      .toBuffer();
    
    // calculate average pixel value
    const pixels = new Uint8Array(resizedBuffer);
    const average = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
    
    // create hash (1 for pixels above average, 0 for below)
    let hash = "";
    for (const pixel of pixels) {
      hash += pixel >= average ? "1" : "0";
    }
    
    return hash;
  } catch (err) {
    console.error("Error calculating image hash:", err);
    return "";
  }
}

// process playback bar region with OCR
async function processRegionsWithOCR(regions) {
  const results = {};
  
  // We're only interested in the playback bar region
  const playbackBarPath = regions.playbackBar;
  if (playbackBarPath && fs.existsSync(playbackBarPath)) {
    try {
      // OCR options for playback bar
      const config = {
        lang: "eng",
        oem: 1,
        psm: 6, // Assume it's a block of text
      };
      
      // perform OCR on the playback bar region
      const text = await tesseract.recognize(playbackBarPath, config);
      results.playbackBar = text.trim();
      
      // Try to extract podcast, episode, and timestamp from the playback bar text
      const lines = results.playbackBar.split('\n').filter(line => line.trim());
      if (lines.length >= 2) {
        // Attempt to extract information from the playback bar text
        // This is a simple heuristic and may need adjustment
        results.episode = lines[0] || "";
        results.podcast = lines.length > 2 ? lines[1] : "";
        
        // Try to find timestamp in the text
        const timestampMatch = results.playbackBar.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        results.timestamp = timestampMatch ? timestampMatch[0] : "";
      }
      
      // Keep the playback bar image in uploads folder instead of deleting it
      console.log(`Saved playback bar image to: ${playbackBarPath}`);
    } catch (err) {
      console.error(`Error processing playback bar region:`, err);
      results.playbackBar = "";
    }
  }
  
  return results;
}

async function getOcrText(imagePath) {
  try {
    console.log("Starting OCR with node-tesseract-ocr...");

    const config = {
      lang: "eng",
      oem: 1,
      psm: 6,
      // improve recognition for screen text
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:.-_ ",
    };

    const text = await tesseract.recognize(imagePath, config);
    console.log("OCR Text Result:", text);

    return text.trim();
  } catch (err) {
    console.error("OCR Error:", err);
    throw err;
  }
}

/** parse a HH:MM:SS or HH:MM timestamp from text. */
function parseTimestamp(text) {
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  let hours = 0,
    minutes = 0,
    seconds = 0;
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
    const imageBase64 = imageData.toString("base64");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/jpeg",
      },
    };

    const prompt = `
      This is a screenshot from a podcast player.  Identify these three fields in the screenshot::
      1. The episode (the specific episode name or(and) number (like '#2286 - Antonio Brown').Do not return letters-text that have been cut off(like 'b - Komentari su me pogadj' -> 'Komentari su me')). 
      2. The podcast (the overall podcast name (like 'The Joe Rogan Experience'). The podcast name is usually bold and is the largest heading on the screenshot. The podcast name is written as the text on the screenshot, not as the text on the image on the screenshot).
      3. The current timestamp shown in the player (in format HH:MM:SS or MM:SS).
      
      Return ONLY a JSON object with these two fields:
      {"epsiode": "episode title here", "podcast": "podcast title here", "timestamp": "00:00:00"}
      
      If you can't find one of these values, use an empty string for that field.
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    console.log("Gemini raw response:", text);

    // const jsonMatch = text.match(/\{[\s\S]*"title"[\s\S]*"timestamp"[\s\S]*\}/);
    const jsonMatch = text.match(
      /\{[\s\S]*"episode"[\s\S]*"podcast"[\s\S]*"timestamp"[\s\S]*\}/
    );

    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.error("Error parsing JSON from Gemini response:", err);
        // Fallback: extract fields manually
        const titleMatch = text.match(/"podcast"\s*:\s*"([^"]*)"/);
        const episodeMatch = text.match(/"episode"\s*:\s*"([^"]*)"/);
        const timestampMatch = text.match(/"timestamp"\s*:\s*"([^"]*)"/);
        return {
          podcast: titleMatch ? titleMatch[1] : "",
          episode: episodeMatch ? episodeMatch[1] : "",
          timestamp: timestampMatch ? timestampMatch[1] : "",
        };
      }
    }

    console.error("Could not extract JSON from Gemini response");
    return { podcast: "", episode: "", timestamp: "" };
  } catch (err) {
    console.error("Gemini analysis error:", err.message);
    return { podcast: "", episode: "", timestamp: "" };
  }
}

/** iTunes search  */
async function getFeedUrlFromiTunes(showName, episodeName = "") {
  if (!showName) throw new Error("No show name for iTunes search.");
  // Combine podcast and episode name in the search term
  const searchTerm = episodeName ? `${showName} ${episodeName}` : showName;

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    searchTerm
  )}&country=US&media=podcast&entity=podcastEpisode&limit=25`;

  try {
    const resp = await axios.get(url, { timeout: 10000 });

    if (resp.data.resultCount === 0) {
      throw new Error(`No podcast found on iTunes for: ${searchTerm}`);
    }

    const first = resp.data.results[0];

    if (!first.feedUrl) {
      throw new Error(`No feedUrl in iTunes result for show: ${searchTerm}`);
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

    const feedLanguage = feed.language || "en-US";
    return {
      audioUrl: firstItem.enclosure.url,
      language: feedLanguage,
    };
  } catch (err) {
    console.error("Feed parsing error:", err.message);
    throw new Error(`Failed to parse feed: ${err.message}`);
  }
}

/** extract 5s around timestamp with FFmpeg */
function extractAudioSnippet(timestampSecs, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    let start = timestampSecs - 2;
    if (start < 0) start = 0;
    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(10)
      .output(outputPath)
      .audioCodec("libmp3lame")
      .audioChannels(1) // mono for better speech recognition
      .audioFrequency(16000) // 16kHz for better speech recognition
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .run();
  });
}

/** convert audio to text using Google Speech-to-Text */
async function transcribeAudio(audioFilePath, languageCode = "en-US") {
  try {
    console.log("Starting audio transcription...");

    // read audio file
    const audioBytes = fs.readFileSync(audioFilePath).toString("base64");

    const audio = {
      content: audioBytes,
    };

    // TODO: set languageCode based on the podcast language
    const config = {
      encoding: "MP3",
      sampleRateHertz: 16000,
      languageCode,
      enableAutomaticPunctuation: true,
    };

    const request = {
      audio: audio,
      config: config,
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map((result) => result.alternatives[0].transcript)
      .join("\n");

    console.log("Transcription result:", transcription);
    return transcription;
  } catch (err) {
    console.error("Transcription error:", err.message);
    return "Could not transcribe audio.";
  }
}

// Format timestamp to HH:MM:SS
function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [
    hours > 0 ? hours.toString().padStart(2, "0") : "",
    minutes.toString().padStart(2, "0"),
    remainingSeconds.toString().padStart(2, "0"),
  ]
    .filter(Boolean)
    .join(":");
}

// test route
app.get("/", (req, res) => {
  res.send("PodShot backend is running...");
});

async function detectPlaybackBar(imagePath) {
  console.log("Detecting playback bar region in:", imagePath);

  try {
    // process the image with our template model
    const template = await processTemplate(imagePath);
    
    // get image dimensions
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    // extract the playback bar region from the template
    const playbackBarRegion = template.regions?.playbackBar || {
      top: 0.75,
      left: 0.0,
      width: 1.0,
      height: 0.15
    };
    
    // calculate absolute coordinates based on relative values
    const x = Math.floor(width * playbackBarRegion.left);
    const y = Math.floor(height * playbackBarRegion.top);
    const regionWidth = Math.floor(width * playbackBarRegion.width);
    const regionHeight = Math.floor(height * playbackBarRegion.height);
    
    // extract the playback bar region
    const playbackBarPath = path.join(
      "uploads", 
      `${path.basename(imagePath, path.extname(imagePath))}_playbackBar${path.extname(imagePath)}`
    );
    
    try {
      // image dimensions
      const metadata = await sharp(imagePath).metadata();
      console.log("Image dimensions:", metadata.width, "x", metadata.height);
      
      // new buffer from the image
      const imageBuffer = await fs.promises.readFile(imagePath);
      
      // new Sharp instance from the buffer
      const image = sharp(imageBuffer);
      
      //TODO: now we use fixed coordinates that match the red-highlighted area in the example image
      // This is approximately the bottom 15-20% of the image
      const playbackBarHeight = Math.floor(metadata.height * 0.20); 
      const playbackBarTop = Math.floor(metadata.height * 0.55);
      
      console.log("Extracting playback bar region with coordinates:", {
        left: 0,
        top: playbackBarTop,
        width: metadata.width,
        height: playbackBarHeight
      });
      
      // extract just the playback bar region
      await image
        .extract({
          left: 0,
          top: playbackBarTop,
          width: metadata.width,
          height: playbackBarHeight
        })
        .toFile(playbackBarPath);
      
      console.log(`Playback bar image saved to: ${playbackBarPath}`);
    } catch (err) {
      console.error("Error processing playback bar region:", err);
      // If extraction fails, we'll continue without the extracted region
    }
    
    return {
      x: x,
      y: y,
      width: regionWidth,
      height: regionHeight,
      template: template.name || 'default',
      regions: { playbackBar: playbackBarPath }
    };
  } catch (err) {
    console.error("Error in playback bar detection:", err);
    
    // get image dimensions for fallback
    try {
      const metadata = await sharp(imagePath).metadata();
      const { width, height } = metadata;
      
      // fallback to default if detection fails - use bottom 15% of the image
      return {
        x: 0,
        y: Math.floor(height * 0.75),
        width: width,
        height: Math.floor(height * 0.15),
        template: "default",
        regions: {}
      };
    } catch (e) {
      // if we can't even get image dimensions, use hardcoded values
      return {
        x: 0,
        y: 300,
        width: 400,
        height: 100,
        template: "default",
        regions: {}
      };
    }
  }
}

/**
 * POST /process-screenshot
 *   1) upload screenshot
 *   2) analyze with Gemini => showName/timestamp
 *   3) iTunes => feedUrl => parse => MP3
 *   4) extract 5s snippet
 *   5) transcribe the snippet
 */
app.post(
  "/process-screenshot",
  upload.single("screenshot"),
  async (req, res) => {
    debugger;
    // create uploads directory if it doesn't exist
    // TODO: delete all
    if (!fs.existsSync("uploads/")) {
      fs.mkdirSync("uploads/");
    }

    if (!req.file) {
      return res.status(400).json({ error: "No screenshot uploaded." });
    }

    console.log("Screenshot received:", req.file.path);
    const screenshotPath = req.file.path;

    try {
      // detect playback bar region
      const playbackInfo = await detectPlaybackBar(screenshotPath);
      console.log("Playback bar info:", playbackInfo);
      
      // process playback bar region with OCR if available
      let templateData = {};
      if (playbackInfo.regions && Object.keys(playbackInfo.regions).length > 0) {
        templateData = await processRegionsWithOCR(playbackInfo.regions);
        console.log("Playback bar OCR results:", templateData);
      }

      // perform OCR on the full image as a fallback
      const ocrText = await getOcrText(screenshotPath);
      console.log("Full OCR result:", ocrText);

      // extract information from OCR results
      // first try to get from playback bar region, then fall back to full image OCR
      let podcast = templateData.playbackBar || "";
      let episode = "";
      let timestamp = "";
      
      // try to extract timestamp from OCR text
      const timestampMatch = ocrText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (timestampMatch) {
        timestamp = timestampMatch[0];
      }
      
      // if template extraction failed, use Gemini as backup
      if (!podcast || !episode || !timestamp) {
        const geminiResults = await parseWithGemini(screenshotPath);
        podcast = podcast || geminiResults.podcast || "";
        episode = episode || geminiResults.episode || "";
        timestamp = timestamp || geminiResults.timestamp || "";
      }

      const guessedTitle = podcast || "";
      const timestampSecs = parseTimestamp(timestamp || "");
      const formattedTimestamp = formatTimestamp(timestampSecs);

      console.log("Parsed from screenshot:", {
        guessedTitle,
        timestamp,
        timestampSecs,
        formattedTimestamp,
      });

      if (!guessedTitle) {
        throw new Error("No valid show name extracted from screenshot.");
      }

      // 2) iTunes => feedUrl => parse => MP3
      console.log("Searching iTunes for:", guessedTitle);
      // const feedUrl = await getFeedUrlFromiTunes(guessedTitle);
      const feedUrl = await getFeedUrlFromiTunes(podcast, episode);
      console.log("Found feed URL:", feedUrl);

      const { audioUrl, language } = await getPodcastAudioFromFeed(feedUrl);
      console.log("Found audio URL:", audioUrl, "with language:", language);

      // 3) download full audio
      const fullAudioPath = path.join(__dirname, "temp_full_audio.mp3");
      console.log("Downloading audio...");
      const audioResp = await axios.get(audioUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      fs.writeFileSync(fullAudioPath, audioResp.data);

      // 4) extract 5s around snippet
      const snippetFilename = `snippet_${Date.now()}.mp3`;
      const snippetPath = path.join(AUDIO_DIR, snippetFilename);
      await extractAudioSnippet(timestampSecs, fullAudioPath, snippetPath);

      // 5) Transcribe the audio snippet
      const transcription = await transcribeAudio(snippetPath, language);

      // Generate a URL for the audio snippet
      const snippetUrl = `${req.protocol}://${req.get(
        "host"
      )}/public/audio/${snippetFilename}`;

      // cleanup
      fs.unlinkSync(fullAudioPath);
      fs.unlinkSync(screenshotPath);

      return res.json({
        success: true,
        guessedTitle,
        timestamp: formattedTimestamp,
        feedUrl,
        audioUrl,
        snippetUrl,
        transcription,
        snippetDuration: "5 seconds",
        snippetInfo: `Audio extracted from ${guessedTitle} at ${formattedTimestamp}`,
        detectionMethod: playbackInfo.template,
      });
    } catch (err) {
      console.error("Processing error:", err);
      return res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  }
);

// list all templates
app.get('/templates', async (req, res) => {
  try {
    const templates = await listTemplates();
    res.json({ success: true, templates });
  } catch (err) {
    console.error('Error listing templates:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// get template details
app.get('/templates/:id', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const template = await getTemplateDetails(templateId);
    
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    res.json({ success: true, template });
  } catch (err) {
    console.error('Error getting template details:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// database backup
app.post('/backup-database', async (req, res) => {
  try {
    const backupPath = await backupDatabase();
    res.json({ success: true, backupPath });
  } catch (err) {
    console.error('Error backing up database:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`For external access, use: http://192.168.1.175:${PORT}`);

   // initialize database
   getDB().then(() => {
    console.log("Database connection established");
  }).catch(err => {
    console.error("Database initialization error:", err);
  });

  if (!GEMINI_API_KEY) {
    console.warn(
      "⚠️ WARNING: GEMINI_API_KEY not set in environment variables!"
    );
    console.warn("Get a free API key from https://aistudio.google.com/");
  }

  // if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  //   console.warn("⚠️ WARNING: GOOGLE_APPLICATION_CREDENTIALS not set in environment variables!");
  //   console.warn("Speech-to-text functionality will not work properly.");
  // }
});
