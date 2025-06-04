import { getDB } from '../db.js';
import { supabase } from '../services/supabaseService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// For ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Supabase tables if they don't exist
async function createSupabaseTables() {
  console.log('Creating Supabase tables if they don\'t exist...');
  
  try {
    // Create podcast_templates table
    const { error: templatesError } = await supabase.rpc('create_tables', {
      sql: `
        CREATE TABLE IF NOT EXISTS podcast_templates (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          hash TEXT UNIQUE,
          features JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
        
        CREATE INDEX IF NOT EXISTS idx_template_hash ON podcast_templates (hash);
      `
    });
    
    if (templatesError) throw templatesError;
    
    // Create template_regions table
    const { error: regionsError } = await supabase.rpc('create_tables', {
      sql: `
        CREATE TABLE IF NOT EXISTS template_regions (
          id SERIAL PRIMARY KEY,
          template_id INTEGER NOT NULL REFERENCES podcast_templates (id) ON DELETE CASCADE,
          region_name TEXT NOT NULL,
          top REAL NOT NULL,
          left_pos REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL
        );
      `
    });
    
    if (regionsError) throw regionsError;
    
    console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

// Migrate podcast templates from SQLite to Supabase
async function migrateTemplates() {
  console.log('Starting migration of podcast templates...');
  
  try {
    // Get SQLite database connection
    const db = await getDB();
    
    // Get all templates from SQLite
    const templates = await db.all('SELECT * FROM podcast_templates');
    console.log(`Found ${templates.length} templates to migrate`);
    
    // Create tables in Supabase if they don't exist
    await createSupabaseTables();
    
    // Migrate each template
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const template of templates) {
      try {
        // Get regions for this template
        const regions = await db.all(
          'SELECT * FROM template_regions WHERE template_id = ?', 
          [template.id]
        );
        
        // Format regions for Supabase
        const formattedRegions = {};
        regions.forEach(region => {
          formattedRegions[region.region_name] = {
            top: region.top,
            left: region.left,
            width: region.width,
            height: region.height
          };
        });
        
        // Parse features JSON if it's a string
        const features = typeof template.features === 'string' 
          ? JSON.parse(template.features) 
          : template.features;
        
        // Insert template into Supabase
        const { data: templateData, error: templateError } = await supabase
          .from('podcast_templates')
          .insert({
            name: template.name,
            hash: template.hash,
            features: features
          })
          .select('id')
          .single();
        
        if (templateError) throw templateError;
        
        const templateId = templateData.id;
        
        // Insert regions into Supabase
        for (const [regionName, regionConfig] of Object.entries(formattedRegions)) {
          const { error: regionError } = await supabase
            .from('template_regions')
            .insert({
              template_id: templateId,
              region_name: regionName,
              top_pos: regionConfig.top,
              left_pos: regionConfig.left,
              width: regionConfig.width,
              height: regionConfig.height
            });
          
          if (regionError) throw regionError;
        }
        
        migratedCount++;
        console.log(`Migrated template: ${template.name} (${migratedCount}/${templates.length})`);
      } catch (error) {
        errorCount++;
        console.error(`Error migrating template ${template.name}:`, error);
      }
    }
    
    console.log(`Migration completed. Successfully migrated ${migratedCount} templates with ${errorCount} errors.`);
    return { migratedCount, errorCount };
  } catch (error) {
    console.error('Error in template migration:', error);
    throw error;
  }
}

// Main migration function
async function migrateToSupabase() {
  console.log('Starting migration to Supabase...');
  
  try {
    // Check Supabase connection
    const { error: connectionError } = await supabase.from('_test_connection').select('*').limit(1);
    
    if (connectionError && connectionError.code !== 'PGRST116') {
      // PGRST116 is "relation does not exist" which is expected for a non-existent test table
      console.error('Supabase connection error:', connectionError);
      throw new Error('Could not connect to Supabase');
    }
    
    console.log('Supabase connection successful');
    
    // Create backup of SQLite database
    const dbPath = path.join(__dirname, '..', 'database', 'podshot.db');
    const backupPath = path.join(__dirname, '..', 'database', `podshot_backup_${Date.now()}.db`);
    
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`SQLite database backed up to: ${backupPath}`);
    }
    
    // Migrate templates
    const templateResults = await migrateTemplates();
    
    // Add more migration functions here as needed
    // For example: await migrateUsers();
    
    console.log('Migration to Supabase completed successfully');
    return {
      success: true,
      templates: templateResults
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run migration if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrateToSupabase()
    .then(result => {
      console.log('Migration result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unhandled error during migration:', error);
      process.exit(1);
    });
}

export { migrateToSupabase, migrateTemplates, createSupabaseTables };
