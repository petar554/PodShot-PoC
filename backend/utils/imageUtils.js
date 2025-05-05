// imageUtils.js - New file
import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
import * as tf from '@tensorflow/tfjs-node'; 

// generate perceptual hash for an image
async function generateImageHash(imagePath) {
  try {
    // resize to small greyscale image for hashing
    const resizedBuffer = await sharp(imagePath)
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
    
    // create hash from buffer
    return crypto.createHash('sha256')
      .update(Buffer.from(resizedBuffer))
      .digest('hex');
  } catch (err) {
    console.error('Error generating image hash:', err);
    return null;
  }
}

// extract image features for model input
async function extractImageFeatures(imagePath) {
  try {
    // get image metadata
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    // resize image to standard input size for our model
    const resizedBuffer = await sharp(imagePath)
      .resize(224, 224, { fit: 'fill' })
      .removeAlpha()
      .toBuffer();
    
    // convert buffer to tensor
    const tensor = tf.node.decodeImage(resizedBuffer, 3);
    
    // normalize pixel values to [0, 1]
    const normalized = tensor.div(tf.scalar(255));
    
    return {
      tensor: normalized,
      originalWidth: width,
      originalHeight: height,
      hash: await generateImageHash(imagePath)
    };
  } catch (err) {
    console.error('Error extracting image features:', err);
    return null;
  }
}

// extract region from image based on coordinates
async function extractRegion(imagePath, region, outputPath) {
  try {
    // get image metadata
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    
    // calculate absolute pixel values from relative positions
    const left = Math.floor(region.left * width);
    const top = Math.floor(region.top * height);
    const regionWidth = Math.floor(region.width * width);
    const regionHeight = Math.floor(region.height * height);
    
    // skip if dimensions are invalid
    if (regionWidth <= 0 || regionHeight <= 0) {
      console.warn(`Invalid dimensions for region`);
      return null;
    }
    
    // extract the region
    await sharp(imagePath)
      .extract({ left, top, width: regionWidth, height: regionHeight })
      .toFile(outputPath);
    
    return outputPath;
  } catch (err) {
    console.error('Error extracting region:', err);
    return null;
  }
}

export {
  generateImageHash,
  extractImageFeatures,
  extractRegion
};