require('dotenv').config();
const Koa = require('koa');
const logger = require('koa-logger');
const bodyParser = require('koa-bodyparser');
const jwt = require('koa-jwt');
const cors = require('@koa/cors');
const http = require('http');
const SocketIO = require('socket.io');
const router = require('./routes');
const db = require('./db');
const sccpClient = require('./sccpClient');
const io = require('./io');
const notifications = require('./notifications');

const port = process.env.API_PORT || process.env.PORT || 3500;
const secret = process.env.SECRET || 'averyveryverysecretsecret';

// Koa application Setup
const app = new Koa();

// Middleware Setup
app.use(logger());
app.use(bodyParser());
app.use(cors({ credentials: true }));
app.use(jwt({ secret }).unless({ path: [/^\/api\/(login|singup|backdoor)/] }));

// Router Setup
app.use(router.routes());
app.use(router.allowedMethods());

// SocketIO Setup
const server = http.Server(app.callback());
io.initialize(SocketIO(server));

// Notifications Setup
notifications.initialize();

async function main() {
  await db.initialize();
  await sccpClient.initialize();
  server.listen(port);
  console.log(`Server running at port: ${port}\n`); // eslint-disable-line no-console
}

main().catch((error) => {
  throw error;
});
