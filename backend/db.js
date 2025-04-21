// db.js - New file
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

// For ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'database', 'podshot.db');

// initialize database
async function initDB() {
  // Ensure database directory exists
  const fs = await import('fs');
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS podcast_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hash TEXT UNIQUE,
      features TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS template_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      region_name TEXT NOT NULL,
      top REAL NOT NULL,
      left REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      FOREIGN KEY (template_id) REFERENCES podcast_templates (id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_template_hash ON podcast_templates (hash);
  `);

  console.log('Database initialized at:', DB_PATH);
  return db;
}

// get database connection
let dbInstance = null;
async function getDB() {
  if (!dbInstance) {
    dbInstance = await initDB();
  }
  return dbInstance;
}

// store a template in the database
async function storeTemplate(name, hash, features, regions) {
  const db = await getDB();
  
  try {
    await db.run('BEGIN TRANSACTION');
    
    // insert template
    const result = await db.run(
      'INSERT OR IGNORE INTO podcast_templates (name, hash, features) VALUES (?, ?, ?)',
      [name, hash, JSON.stringify(features)]
    );
    
    const templateId = result.lastID || await db.get('SELECT id FROM podcast_templates WHERE hash = ?', [hash]).then(row => row.id);
    
    // insert regions
    for (const [regionName, regionConfig] of Object.entries(regions)) {
      await db.run(
        'INSERT OR REPLACE INTO template_regions (template_id, region_name, top, left, width, height) VALUES (?, ?, ?, ?, ?, ?)',
        [templateId, regionName, regionConfig.top, regionConfig.left, regionConfig.width, regionConfig.height]
      );
    }
    
    await db.run('COMMIT');
    
    return templateId;
  } catch (err) {
    await db.run('ROLLBACK');
    console.error('Error storing template:', err);
    throw err;
  }
}

// find a template by its hash
async function findTemplateByHash(hash) {
  const db = await getDB();
  
  const template = await db.get('SELECT * FROM podcast_templates WHERE hash = ?', [hash]);
  if (!template) return null;
  
  const regions = await db.all(
    'SELECT region_name, top, left, width, height FROM template_regions WHERE template_id = ?', 
    [template.id]
  );
  
  const formattedRegions = {};
  regions.forEach(region => {
    formattedRegions[region.region_name] = {
      top: region.top,
      left: region.left,
      width: region.width,
      height: region.height
    };
  });
  
  return {
    id: template.id,
    name: template.name,
    hash: template.hash,
    features: JSON.parse(template.features),
    regions: formattedRegions
  };
}

// get all templates
async function getAllTemplates() {
  const db = await getDB();
  
  const templates = await db.all('SELECT * FROM podcast_templates');
  const result = [];
  
  for (const template of templates) {
    const regions = await db.all(
      'SELECT region_name, top, left, width, height FROM template_regions WHERE template_id = ?', 
      [template.id]
    );
    
    const formattedRegions = {};
    regions.forEach(region => {
      formattedRegions[region.region_name] = {
        top: region.top,
        left: region.left,
        width: region.width,
        height: region.height
      };
    });
    
    result.push({
      id: template.id,
      name: template.name,
      hash: template.hash,
      features: JSON.parse(template.features),
      regions: formattedRegions
    });
  }
  
  return result;
}

export {
  getDB,
  storeTemplate,
  findTemplateByHash,
  getAllTemplates
};