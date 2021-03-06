const Sequelize = require('sequelize');

// Database Setup
const sequelize = new Sequelize({
  host: process.env.MYSQL_HOST || 'localhost',
  dialect: 'mysql',
  database: process.env.MYSQL_DATABASE || 'dspacenet',
  username: process.env.MYSQL_USER || 'dspacenet',
  password: process.env.MYSQL_PASSWORD || 'dspacenet',
});


// User Model
const User = sequelize.define('User', {
  username: { type: Sequelize.STRING, allowNull: false, unique: true },
  email: { type: Sequelize.STRING, allowNull: false, unique: true },
  password: { type: Sequelize.STRING, allowNull: false },
  spaceId: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
  lastClock: { type: Sequelize.BIGINT, allowNull: false },
  rank: {
    type: Sequelize.ENUM,
    values: ['user', 'admin'],
    allowNull: false,
    default: 'user',
  },
});

/**
 * Establishes connection to the database and synchronizes models
 * @returns {Promise<Void>}
 */
async function initialize() {
  // Check database credentials
  await sequelize.authenticate();

  // Sync user model
  await User.sync();
}

module.exports = { initialize, User };
