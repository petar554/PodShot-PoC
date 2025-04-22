import { getDB } from './db.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// for ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// export database path for external tools
async function getDatabasePath() {
  const db = await getDB();
  return path.join(__dirname, 'database', 'podshot.db');
}

// database backup
async function backupDatabase(backupDir = path.join(__dirname, 'backups')) {
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const dbPath = await getDatabasePath();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `podshot-backup-${timestamp}.db`);
    
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Database backed up to: ${backupPath}`);
    return backupPath;
  } catch (err) {
    console.error('Database backup failed:', err);
    throw err;
  }
}

// all templates in the database
async function listTemplates() {
  const db = await getDB();
  const templates = await db.all(`
    SELECT 
      t.id, t.name, t.hash, t.created_at,
      COUNT(r.id) as region_count
    FROM 
      podcast_templates t
    LEFT JOIN 
      template_regions r ON t.id = r.template_id
    GROUP BY 
      t.id
    ORDER BY 
      t.created_at DESC
  `);
  
  return templates;
}

// detailed template information
async function getTemplateDetails(templateId) {
  const db = await getDB();
  
  const template = await db.get('SELECT * FROM podcast_templates WHERE id = ?', [templateId]);
  if (!template) return null;
  
  const regions = await db.all(
    'SELECT * FROM template_regions WHERE template_id = ?', 
    [templateId]
  );
  
  return {
    ...template,
    features: JSON.parse(template.features),
    regions
  };
}

export {
  getDatabasePath,
  backupDatabase,
  listTemplates,
  getTemplateDetails
};