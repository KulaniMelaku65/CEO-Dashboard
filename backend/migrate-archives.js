// Import data/archives/*.json into SQLite. Run: npm run migrate-archives
require('dotenv').config();
const { importArchives } = require('./services/import-archives');

const n = importArchives({ onlyIfEmpty: false });
if (n === 0) console.log('Nothing new imported.');
