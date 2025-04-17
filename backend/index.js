import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import axios from "axios";
import Parser from "rss-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import speech from "@google-cloud/speech";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import tesseract from "node-tesseract-ocr";
import sharp from "sharp";
import { createCanvas, loadImage } from "canvas";

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
const PORT = 4000;

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

// define template regions for different podcast UIs
const PODCAST_TEMPLATES = [
  {
    name: "spotify",
    regions: {
      podcast: { top: 0.65, left: 0.05, width: 0.9, height: 0.1 },
      episode: { top: 0.55, left: 0.05, width: 0.9, height: 0.1 },
      timestamp: { top: 0.75, left: 0.05, width: 0.15, height: 0.1 }
    },
    features: {
      darkBackground: true,
      playerControls: "bottom",
      logoPosition: "top-left"
    }
  },
  {
    name: "apple_podcasts",
    regions: {
      podcast: { top: 0.8, left: 0.3, width: 0.65, height: 0.1 },
      episode: { top: 0.72, left: 0.3, width: 0.6, height: 0.08 },
      timestamp: { top: 0.9, left: 0.05, width: 0.15, height: 0.05 }
    },
    features: {
      darkBackground: false,
      playerControls: "bottom",
      logoPosition: "left-middle"
    }
  },
  {
    name: "joe_rogan",
    regions: {
      podcast: { top: 0.65, left: 0.05, width: 0.9, height: 0.1 },
      episode: { top: 0.55, left: 0.05, width: 0.9, height: 0.1 },
      timestamp: { top: 0.85, left: 0.05, width: 0.15, height: 0.05 }
    },
    features: {
      darkBackground: true,
      playerControls: "bottom",
      logoPosition: "top"
    }
  },
  {
    name: "youtube_podcast",
    regions: {
      podcast: { top: 0.85, left: 0.1, width: 0.8, height: 0.1 },
      episode: { top: 0.75, left: 0.1, width: 0.8, height: 0.1 },
      timestamp: { top: 0.9, left: 0.1, width: 0.2, height: 0.05 }
    },
    features: {
      darkBackground: true,
      playerControls: "bottom",
      logoPosition: "top-left"
    }
  }
];

// extract features from an image for template matching
async function extractImageFeatures(imagePath) {
  try {
    // Get image dimensions and metadata
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    // Calculate average brightness (simple feature)
    const { dominant } = await sharp(imagePath)
      .resize(50, 50) // Resize for faster processing
      .stats();
    
    const avgBrightness = (dominant.r + dominant.g + dominant.b) / 3;
    const isDarkBackground = avgBrightness < 128;

    // Check for player controls at bottom (simple heuristic)
    const bottomRegion = await sharp(imagePath)
      .extract({ left: 0, top: Math.floor(height * 0.8), width, height: Math.floor(height * 0.2) })
      .toBuffer();
    
    const bottomStats = await sharp(bottomRegion).stats();
    const hasBottomControls = bottomStats.channels[0].mean < 200; // Approximate check for UI elements
    
    // Extract features from different regions of the image
    // For simplicity, we'll just sample some key areas
    const topLeftFeature = await sharp(imagePath)
      .extract({ left: 0, top: 0, width: Math.floor(width * 0.2), height: Math.floor(height * 0.2) })
      .toBuffer();
    
    const middleFeature = await sharp(imagePath)
      .extract({ 
        left: Math.floor(width * 0.4), 
        top: Math.floor(height * 0.4), 
        width: Math.floor(width * 0.2), 
        height: Math.floor(height * 0.2) 
      })
      .toBuffer();
    
    return {
      width,
      height,
      isDarkBackground,
      hasBottomControls,
      topLeftFeatureHash: await imageHashSimple(topLeftFeature),
      middleFeatureHash: await imageHashSimple(middleFeature),
    };
  } catch (err) {
    console.error("Error extracting image features:", err);
    return null;
  }
}

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

// function to find the best matching template
async function findBestTemplate(imageFeatures) {
  if (!imageFeatures) return PODCAST_TEMPLATES[0]; // default to first template if features extraction failed
  
  let bestMatch = null;
  let bestScore = -Infinity;
  
  for (const template of PODCAST_TEMPLATES) {
    let score = 0;
    
    // score based on dark/light background
    if (template.features.darkBackground === imageFeatures.isDarkBackground) {
      score += 10;
    }
    
    // score based on player controls position
    if (template.features.playerControls === "bottom" && imageFeatures.hasBottomControls) {
      score += 10;
    }
    
    // for logo position and other more complex features, we would need more sophisticated
    // image analysis, but this gives a basic template matching approach
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = template;
    }
  }
  
  console.log(`Best template match: ${bestMatch.name} with score ${bestScore}`);
  return bestMatch || PODCAST_TEMPLATES[0];
}

// extract regions from image based on template
async function extractRegionsFromTemplate(imagePath, template) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    // extract each region based on template
    const regions = {};
    
    for (const [regionName, regionDims] of Object.entries(template.regions)) {
      // calculate absolute pixel values from relative positions
      const left = Math.floor(regionDims.left * width);
      const top = Math.floor(regionDims.top * height);
      const regionWidth = Math.floor(regionDims.width * width);
      const regionHeight = Math.floor(regionDims.height * height);
      
      // skip if dimensions are invalid
      if (regionWidth <= 0 || regionHeight <= 0) {
        console.warn(`Invalid dimensions for ${regionName} region`);
        continue;
      }
      
      // extract the region
      const regionPath = path.join(
        "uploads", 
        `${path.basename(imagePath, path.extname(imagePath))}_${regionName}${path.extname(imagePath)}`
      );
      
      await sharp(imagePath)
        .extract({ left, top, width: regionWidth, height: regionHeight })
        .toFile(regionPath);
      
      regions[regionName] = regionPath;
    }
    
    return regions;
  } catch (err) {
    console.error("Error extracting regions:", err);
    return {};
  }
}

// process specific regions with OCR
async function processRegionsWithOCR(regions) {
  const results = {};
  
  for (const [regionName, regionPath] of Object.entries(regions)) {
    if (!fs.existsSync(regionPath)) {
      console.warn(`Region file does not exist: ${regionPath}`);
      continue;
    }
    
    try {
      // OCR options based on region type
      let config = {
        lang: "eng",
        oem: 1,
        psm: 6,
      };
      
      // OCR settings based on region type
      if (regionName === "timestamp") {
        config.psm = 7; // Treat as single line of text
        config.tessedit_char_whitelist = "0123456789:-.";
      } else if (regionName === "podcast" || regionName === "episode") {
        config.psm = 6; // Assume it's a block of uniform text
      }
      
      // perform OCR on the region
      const text = await tesseract.recognize(regionPath, config);
      results[regionName] = text.trim();
      
      fs.unlinkSync(regionPath);
    } catch (err) {
      console.error(`Error processing region ${regionName}:`, err);
      results[regionName] = "";
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
  console.log("Detecting bounding box for playback bar in:", imagePath);

  try {
    // extract features from image
    const imageFeatures = await extractImageFeatures(imagePath);
    
    // find best matching template
    const bestTemplate = await findBestTemplate(imageFeatures);
    
    // extract regions of interest from image based on template
    const regions = await extractRegionsFromTemplate(imagePath, bestTemplate);
    
    // use dimensions for playback bar based on best template
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    // default playback bar location is at the bottom 20% of the screen
    return {
      x: 0,
      y: Math.floor(height * 0.8),
      width: width,
      height: Math.floor(height * 0.2),
      template: bestTemplate.name,
      regions: regions
    };
  } catch (err) {
    console.error("Error in playback bar detection:", err);
    
    // fallback to default if detection fails
    return {
      x: 100,
      y: 300,
      width: 200,
      height: 60,
      template: "default",
      regions: {}
    };
  }
};

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
      // detect UI elements and extract regions
      debugger;
      const playbackInfo = await detectPlaybackBar(screenshotPath);
      console.log("Playback bar info:", playbackInfo);
      
      // process extracted regions with OCR if available
      let templateData = {};
      if (playbackInfo.regions && Object.keys(playbackInfo.regions).length > 0) {
        templateData = await processRegionsWithOCR(playbackInfo.regions);
        console.log("Template-based OCR results:", templateData);
      }

      // fallback to full image OCR if template extraction failed
      const ocrText = await getOcrText(screenshotPath);
      console.log("Full OCR result:", ocrText);

      // 1) use template data if available, otherwise fall back to Gemini
      let podcast = templateData.podcast || "";
      let episode = templateData.episode || "";
      let timestamp = templateData.timestamp || "";
      
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

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`For external access, use: http://192.168.1.175:${PORT}`);

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