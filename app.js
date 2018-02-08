const Koa = require('koa');
const logger = require('koa-logger');
const bodyParser = require('koa-bodyparser');
const jwt = require('koa-jwt');
const cors = require('@koa/cors');
const router = require('./routes');
const db = require('./db');

const port = process.env.API_PORT || process.env.PORT || 3500;
const secret = process.env.SECRET || 'averyveryverysecretsecret';

// Koa application Setup
const app = new Koa();

// Middlewares Setup
app.use(logger());
app.use(bodyParser());
app.use(cors({ credentials: true }));
app.use(jwt({ secret }).unless({ path: [/^\/api\/login/] }));

// Router Setup
app.use(router.routes());
app.use(router.allowedMethods());

// Checks database connection
db.initialize().then(() => {
  // Start Server listening
  app.listen(port);
  process.stdout.write(`Server running at port: ${port}\n`);
}).catch((error) => {
  // Throw error if database connection failed
  process.stderr.write(`Error connecting to database: ${error.message}\n`);
});

