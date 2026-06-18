// Re-seed / update all default users. Run: npm run seed
require('dotenv').config();
const { seedAllUsers } = require('./services/ensure-users');

seedAllUsers();
