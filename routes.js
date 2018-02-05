const Router = require('koa-router');
const jwt = require('jsonwebtoken');
const { User } = require('./db');
const sccpClient = require('./sccpClient');

const secret = process.env.SECRET || 'averyveryverysecretsecret';

const router = new Router({ prefix: '/api' });

router.all('/', (ctx) => {
  ctx.body = { status: 'working' };
});

router.post('/login', async (ctx) => {
  ctx.assert(!(ctx.session && ctx.session.username), 200, 'Already logged in');
  const user = await User.findOne({
    where: { username: ctx.request.body.username, password: ctx.request.body.password },
  });
  ctx.assert(user, 401, 'Bad user/password');
  ctx.body = {
    token: jwt.sign({
      id: user.spaceId,
      name: user.username,
      rand: Math.random(),
    }, secret),
  };
});

router.get('/user', (ctx) => {
  ctx.body = { user: ctx.state.user };
});

router.get('/logout', (ctx) => {
  ctx.body = { status: 'OK' };
});

router.get('/space/:path', async (ctx) => {
  const path = ctx.params.path === 'global' ? '' : ctx.params.path;
  ctx.assert(/^(|\d+(\.\d+)*)$/.test(path), 400, `Malformed path: ${path}`);
  ctx.body = await sccpClient.getSpace(path);
});

router.post('/space/:path', async (ctx) => {
  ctx.assert(ctx.request.body.program, 400, 'Empty program');
  const path = ctx.params.path === 'global' ? '' : ctx.params.path;
  ctx.assert(/^(|\d+(\.\d+)*)$/.test(path), 400, `Malformed path: ${path}`);
  await sccpClient.runSCCP(ctx.request.body.program, path, ctx.state.user.name);
  ctx.body = {};
});

router.get('/meta/space/:path(\\d+):path2(\\.\\d+)*', async (ctx) => {
  const path = ctx.params.path + (ctx.params.path2 || '');
  ctx.assert(/^\d+$/.test(path), 404, 'Not Found');
  const data = await User.findOne({
    where: { spaceId: path },
    attributes: ['username'],
  });
  ctx.assert(data, 404, 'Not Found');
  ctx.body = { alias: data.username };
});

router.get('/meta/space/:alias', async (ctx) => {
  let spaceId = '';
  if (ctx.params.alias !== 'global') {
    const user = await User.findOne({
      attributes: ['spaceId'],
      where: { username: ctx.params.alias },
    });
    ctx.assert(user, 404, 'Space not found');
    ({ spaceId } = user);
  }
  const childs = await User.findAll({
    attributes: ['spaceId', 'username'],
    where: {
      spaceId: { $ne: spaceId },
    },
  });
  ctx.body = {
    isOwnSpace: spaceId === ctx.state.user.id,
    isGlobal: spaceId === '',
    space: ctx.params.alias,
    spaceId,
    childs: childs.map(child => ({ id: child.spaceId, user: child.username })),
  };
});

module.exports = router;
