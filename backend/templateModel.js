// templateModel.js - New file
import * as tf from '@tensorflow/tfjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { extractImageFeatures } from './utils/imageUtils.js';
import { findTemplateByHash, getAllTemplates, storeTemplate } from './db.js';

// for ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_DIR = path.join(__dirname, 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'podcast_detector');

// load or create model
let model = null;

// default regions to detect (can be refined by the model)
const DEFAULT_REGIONS = {
  playbackBar: { top: 0.75, left: 0.0, width: 1.0, height: 0.15 }
};

// TODO: better model is needed
// create a basic CNN model for template detection
async function createModel() {
  // Create a sequential model
  const model = tf.sequential();
  
  // add layers
  model.add(tf.layers.conv2d({
    inputShape: [224, 224, 3],
    filters: 32,
    kernelSize: 3,
    activation: 'relu',
  }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  
  model.add(tf.layers.conv2d({
    filters: 64,
    kernelSize: 3,
    activation: 'relu',
  }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.5 }));
  
  // output layer - 4 outputs for playback bar:
  // [playbackBar_top, playbackBar_left, playbackBar_width, playbackBar_height]
  model.add(tf.layers.dense({ units: 4, activation: 'sigmoid' }));
  
  // compile model
  model.compile({
    optimizer: 'adam',
    loss: 'meanSquaredError',
  });
  
  return model;
}

// initialize model
async function initModel() {
  try {
    // ensure model directory exists
    if (!fs.existsSync(MODEL_DIR)) {
      fs.mkdirSync(MODEL_DIR, { recursive: true });
    }
    
    // check if model exists
    if (fs.existsSync(`${MODEL_PATH}/model.json`)) {
      console.log('Loading existing model...');
      model = await tf.loadLayersModel(`file://${MODEL_PATH}/model.json`);
    } else {
      console.log('Creating new model...');
      model = await createModel();
      await model.save(`file://${MODEL_PATH}`);
    }
    
    return model;
  } catch (err) {
    console.error('Error initializing model:', err);
    // fallback - create new model if loading fails
    model = await createModel();
    return model;
  }
}

// use the model to predict regions
async function predictRegions(features) {
  if (!model) {
    model = await initModel();
  }
  
  try {
    // make prediction
    const prediction = model.predict(features.tensor.expandDims());
    const values = await prediction.data();
    
    // extract coordinates for playback bar
    const regions = {
      playbackBar: {
        top: values[0],
        left: values[1],
        width: values[2],
        height: values[3]
      }
    };
    
    return regions;
  } catch (err) {
    console.error('Error predicting regions:', err);
    return DEFAULT_REGIONS;
  }
}

// process an image to find templates
async function processTemplate(imagePath) {
  try {
    // extract features
    const features = await extractImageFeatures(imagePath);
    if (!features) {
      throw new Error('Failed to extract image features');
    }
    
    // check if we already have this template in database
    const existingTemplate = await findTemplateByHash(features.hash);
    if (existingTemplate) {
      console.log('Found existing template:', existingTemplate.name);
      return existingTemplate;
    }
    
    // if not found, use model to predict regions
    const regions = await predictRegions(features);
    
    // store new template
    const templateName = `auto_template_${Date.now()}`;
    const templateFeatures = {
      width: features.originalWidth,
      height: features.originalHeight,
      aspectRatio: features.originalWidth / features.originalHeight,
      isDarkBackground: false // could be detected with more sophisticated analysis
    };
    
    const templateId = await storeTemplate(templateName, features.hash, templateFeatures, regions);
    console.log('Created new template with ID:', templateId);
    
    return {
      id: templateId,
      name: templateName,
      hash: features.hash,
      features: templateFeatures,
      regions: regions
    };
  } catch (err) {
    console.error('Error processing template:', err);
    return { regions: DEFAULT_REGIONS };
  }
}

// #TODO
// train model with new data
async function trainModel(imageData, labeledRegions) {
  if (!model) {
    model = await initModel();
  }
  
  // prepare training data
  const xs = tf.tensor4d(imageData, [imageData.length, 224, 224, 3]);
  
  // format labels as [playbackBar_top, playbackBar_left, playbackBar_width, playbackBar_height]
  const labels = labeledRegions.map(regions => [
    regions.playbackBar.top, regions.playbackBar.left, regions.playbackBar.width, regions.playbackBar.height
  ]);
  
  const ys = tf.tensor2d(labels);
  
  // train the model
  await model.fit(xs, ys, {
    epochs: 10,
    batchSize: 4,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch}: loss = ${logs.loss}`);
      }
    }
  });
  
  // save the updated model
  await model.save(`file://${MODEL_PATH}`);
  console.log('Model trained and saved');
  
  // clean up tensors
  xs.dispose();
  ys.dispose();
}

export {
  initModel,
  processTemplate,
  trainModel,
  DEFAULT_REGIONS
};
