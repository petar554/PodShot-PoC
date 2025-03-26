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
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR);
}
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
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
  debugger;
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
    This is a screenshot from a podcast player. Extract exactly two pieces of information:
    1. The episode (the name of the specific podast episode). 
    2. The podcast (the name of podcast show).
    3. The current timestamp shown in the player (in format HH:MM:SS or MM:SS).
    
    Return ONLY a JSON object with these two fields:
    {"epsiode": "episode title here. If the text is cut off, logically conclude how the text continues based on the part of the text that is shown.", "podcast": "podcast title here", "timestamp": "00:00:00"}
    
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
    return firstItem.enclosure.url;
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
async function transcribeAudio(audioFilePath) {
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
      languageCode: "sr-RS",
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
      // 1) LLM (Gemini) analysis
      const { podcast, episode, timestamp } = await parseWithGemini(
        screenshotPath
      );
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

      const audioUrl = await getPodcastAudioFromFeed(feedUrl);
      console.log("Found audio URL:", audioUrl);

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
      const transcription = await transcribeAudio(snippetPath);

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
