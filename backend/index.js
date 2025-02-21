/**
 * Minimal Express server to:
 *   1) Accept an uploaded screenshot (multer)
 *   2) OCR the image (Tesseract)
 *   3) Extract show name + timestamp (OCR or fallback GPT)
 *   4) Query Apple iTunes Search API to get the official RSS feed URL
 *   5) Parse the RSS feed to find a real audio file
 *   6) Download the audio, extract 5s around the timestamp
 *   7) Transcribe snippet (OpenAI Whisper)
 */

// require('dotenv').config();
// const openaiModule = require("openai");
// const Configuration = openaiModule.Configuration;
// const OpenAIApi = openaiModule.OpenAIApi;
// const express = require('express');
// const multer = require('multer');
// const Tesseract = require('tesseract.js');
// const fs = require('fs');
// const path = require('path');
// const axios = require('axios');
// const ffmpeg = require('fluent-ffmpeg');
// const Parser = require('rss-parser');
import "dotenv/config";
import OpenAI from "openai";
import express from "express";
import multer from "multer";
import fs from "fs";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import Parser from "rss-parser";
// import tesseract from 'tesseract.js';
import tesseract from 'node-tesseract-ocr';
// import { createWorker } from 'tesseract.js'; // add this import at the top (if not already present)
import { createRequire } from 'module';
import { extname } from 'path';
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";
import path from "path";

const app = express();
const PORT = 4000;
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  lang: 'eng',  // Language of OCR
  oem: 1,       // OCR Engine mode
  psm: 3        // Page segmentation mode
};

// Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + extname(file.originalname));
  }
});
const upload = multer({ storage });


// OpenAI config
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// RSS parser instance
const rssParser = new Parser();

/**
 * Attempt to parse a timestamp from text, in the form HH:MM:SS or MM:SS
 */
function parseTimestamp(text) {
  const timeRegex = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const match = text.match(timeRegex);
  if (!match) return null;

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

/**
 * If OCR doesn't find needed data, use GPT to parse "podcast title" + "timestamp" from text.
 */
async function parseWithOpenAI(ocrText) {
  const prompt = `
I have the following text from a podcast player's screenshot:
---
${ocrText}
---
Extract two fields in strict JSON only:
{"title": "<podcast title or empty>", "timestamp": "<HH:MM or HH:MM:SS or empty>"}
No extra text, JSON only.
  `;

  try {
    const resp = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });
    const content = resp.data.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (err) {
    console.error("OpenAI parse error:", err.message);
    return { title: "", timestamp: "" };
  }
}

/**
 * Query Apple's iTunes Search API for the show name, returning the official feedUrl
 */
async function getFeedUrlFromiTunes(showName) {
  if (!showName) {
    throw new Error("No show name provided to iTunes search");
  }

  // Example: https://itunes.apple.com/search?term=The+Daily&entity=podcast
  const apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
    showName
  )}&entity=podcast`;

  const response = await axios.get(apiUrl);
  if (response.data.resultCount === 0) {
    throw new Error(`No podcast found on iTunes for show name: ${showName}`);
  }

  // For simplicity, pick the first result.
  // In a real scenario, you'd compare 'collectionName' to ensure you have the right one.
  const firstResult = response.data.results[0];
  if (!firstResult.feedUrl) {
    throw new Error(`No feedUrl in iTunes result for show: ${showName}`);
  }
  return firstResult.feedUrl;
}

/**
 * Parse the feed URL to get an actual MP3 link.
 * For demonstration, we pick the first item’s enclosure.
 * In production, you might match the episode name or date.
 */
async function getPodcastAudioFromFeed(feedUrl) {
  const feed = await rssParser.parseURL(feedUrl);
  if (!feed.items || feed.items.length === 0) {
    throw new Error("No items found in the RSS feed.");
  }

  // Just pick the first item for a minimal POC
  const firstItem = feed.items[0];
  if (!firstItem.enclosure || !firstItem.enclosure.url) {
    throw new Error("No enclosure URL in the first feed item.");
  }

  return firstItem.enclosure.url;
}

/**
 * Extract 5 seconds around the timestamp with FFmpeg
 * (start at timestamp-2, total 5 seconds).
 */
function extractAudioSnippet(timestamp, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    let start = timestamp - 2;
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

/**
 * Transcribe the snippet using OpenAI Whisper
 */
async function transcribeAudio(snippetPath) {
  try {
    const resp = await openai.createTranscription(
      fs.createReadStream(snippetPath),
      "whisper-1"
    );
    return resp.data.text;
  } catch (err) {
    console.error("Whisper transcription error:", err.message);
    return "(transcription failed)";
  }
}

// Basic route
app.get("/", (req, res) => {
  res.send("PodShot backend is running...");
});

/**
 * POST /process-screenshot
 *  1) Upload screenshot
 *  2) OCR => parse showName & timestamp
 *  3) iTunes search => feedUrl
 *  4) RSS feed => real audio link
 *  5) Download audio => extract 5s => transcribe
 */
app.post(
  "/process-screenshot",
  upload.single("screenshot"),
  async (req, res) => {
    debugger;
    if (!req.file) {
      return res.status(400).json({ error: "No screenshot uploaded" });
    }
    // const screenshotPath = req.file.path;
    const screenshotPath = path.join(__dirname, 'screenshots', 'sss.png');

    try {
      tesseract
        .recognize(screenshotPath, config)
        .then((text) => {
          console.log('OCR Result:', text);
          res.send(text);
        })
        .catch((error) => {
          console.error('OCR Error:', error.message);
          res.status(500).send('Error processing the image.');
        });
    } catch (error) {
      console.error('Error:', error.message);
      res.status(500).send('An error occurred while processing the image.');
    }

    try {
      const fullPath = path.resolve(screenshotPath);
      const ocrText = await tesseract.recognize(fullPath)
      .then(result => result.text);
      
      // Attempt naive parse for timestamp
      let timestampSecs = parseTimestamp(ocrText);
      let guessedTitle = ""; // We'll try to glean from OCR or GPT

      // 2) If we can't find a clear timestamp or title, fallback to GPT
      //    (This is simplified; you might always parse with GPT for the show name.)
      if (!timestampSecs) {
        const { title, timestamp } = await parseWithOpenAI(ocrText);
        guessedTitle = title || "";
        if (timestamp) {
          timestampSecs = parseTimestamp(timestamp);
        }
      }
      if (!timestampSecs) timestampSecs = 0;

      // If we didn't get a show name from OCR, also fallback to GPT
      if (!guessedTitle) {
        const { title } = await parseWithOpenAI(ocrText);
        guessedTitle = title || "";
      }
      if (!guessedTitle) {
        throw new Error(
          "Could not parse a valid podcast show name from screenshot text."
        );
      }

      // 3) iTunes search => feedUrl
      const feedUrl = await getFeedUrlFromiTunes(guessedTitle);
      console.log(`iTunes found feedUrl: ${feedUrl}`);

      // 4) Parse feed => get real audio link
      const audioUrl = await getPodcastAudioFromFeed(feedUrl);
      console.log(`Audio URL from feed: ${audioUrl}`);

      // 5) Download the audio
      const fullAudioPath = path.join(__dirname, "temp_full_audio.mp3");
      const audioResp = await axios.get(audioUrl, {
        responseType: "arraybuffer",
      });
      fs.writeFileSync(fullAudioPath, audioResp.data);

      // Extract 5s snippet
      const snippetPath = path.join(__dirname, `snippet_${Date.now()}.mp3`);
      await extractAudioSnippet(timestampSecs, fullAudioPath, snippetPath);

      // Transcribe snippet
      const snippetTranscript = await transcribeAudio(snippetPath);

      // Clean up
      fs.unlinkSync(screenshotPath); // remove screenshot
      fs.unlinkSync(fullAudioPath);
      // fs.unlinkSync(snippetPath); // optionally remove snippet

      return res.json({
        success: true,
        foundTimestamp: timestampSecs,
        guessedTitle,
        feedUrl,
        snippetTranscript,
      });
    } catch (err) {
      console.error("Error:", err.message);
      console.log("Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
