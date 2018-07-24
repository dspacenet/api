const Router = require('koa-router');
const jwt = require('jsonwebtoken');
const mailgun = require('mailgun-js')({ apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN });
const crypto = require('crypto');

const { User } = require('./db');
const sccpClient = require('./sccpClient');
const io = require('./io');

const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const secret = process.env.SECRET || 'averyveryverysecretsecret';

const router = new Router({ prefix: '/api' });

/**
 * @api {post} /login API Login
 * @apiName Login
 * @apiGroup Auth
 *
 * @apiParam {String} username Your username.
 * @apiParam {String} password Your password.
 *
 * @apiSuccess {String} token Auth Token.
 * @apiError AuthorizationError Wrong `username`/`password` combination.
 */
router.post('/login', async (ctx) => {
  // Get user from database
  const user = await User.findOne({
    where: { username: ctx.request.body.username, password: ctx.request.body.password },
  });
  // If user is null, throw error
  ctx.assert(user, 401, 'Bad user/password');
  // Generate token and write response
  ctx.body = {
    token: jwt.sign({
      id: user.spaceId,
      name: user.username,
      rand: Math.random(),
    }, secret),
  };
});

router.post('/singup', async (ctx) => {
  ctx.assert(ctx.request.body.firstName, 400, 'Enter first name');
  ctx.assert(ctx.request.body.lastName, 400, 'Enter last name');
  ctx.assert(emailRegex.test(String(ctx.request.body.email).toLowerCase()), 400, 'Enter a valid email');
  ctx.assert(ctx.request.body.password && ctx.request.body.password.length >= 8, 400, 'Enter a password with at least 8 characters');
  ctx.assert(ctx.request.body.password === ctx.request.body.passwordConfirmation, 400, 'Password and its confirmation do not match');

  await mailgun.messages().send({
    from: 'DSpaceNet Admin <admin@dspacenet.com>',
    to: 'sebastianlopezn@gmail.com',
    subject: 'DSpaceNet registration request',
    text: `${ctx.request.body.firstName} ${ctx.request.body.lastName} has requested to join DSpaceNet:
      First Name: ${ctx.request.body.firstName}
      Last Name: ${ctx.request.body.lastName}
      Email: ${ctx.request.body.email}
      Password MD5 Hash: ${crypto.createHash('md5').update(ctx.request.body.password).digest('hex')}`,
  });
  ctx.body = { status: 'OK' };
});

/**
 * @api {get} /user Request User
 * @apiName GetUser
 * @apiGroup User
 *
 * @apiSuccess {Number} id User ID.
 * @apiSuccess {String} name User public name
 *
 * @apiError AuthorizationError Authentication required.
 */
router.get('/user', (ctx) => {
  ctx.body = { user: ctx.state.user };
});

/**
 * @api {get} /logout API logout
 * @apiName Logout
 * @apiGroup Auth
 *
 * @apiSuccess {String} status OK
 *
 * @apiError AuthorizationError Authentication required.
 */
router.get('/logout', (ctx) => {
  ctx.body = { status: 'OK' };
});

/**
 * @api {get} /space/:path Request Space Content
 * @apiName GetSpace
 * @apiGroup Space
 *
 * @apiParam {String} path Space's path
 * @apiParam {Boolean} filter=true Filter system messages
 *
 * @apiError UserError Malformed path: `path`
 * @apiError AuthorizationError Authentication required.
 *
 * @todo path assertion regexp should be global.
 */
router.get('/space/:path', async (ctx) => {
  // Filter system messages?
  const filter = ctx.query.filter !== 'false';
  // Normalize path of global
  const path = ctx.params.path === 'global' ? '' : ctx.params.path;
  // if path is malformed, throw error
  ctx.assert(/^(|\d+(\.\d+)*)$/.test(path), 400, `Malformed path: ${path}`);
  // Call SCCP API to get space contents and write response
  ctx.body = await sccpClient.getSpace(path, filter);
});

/**
 * @api {post} /space/:path Post Program in Space
 * @apiName PostProgram
 * @apiGroup Space
 *
 * @apiParam path    Space's path
 * @apiParam program Program to be posted
 *
 * @apiSuccess status OK
 *
 * @apiError UserError Malformed path: `path`
 * @apiError UserError Malformed Program: `program`
 * @apiError AuthorizationError Authentication required.
 *
 * @todo path assertion regexp should be global.
 */
router.post('/space/:path', async (ctx) => {
  // if no program is set, throw error
  ctx.assert(ctx.request.body.program, 400, 'Empty program');
  // normalize path of global
  const path = ctx.params.path === 'global' ? '' : ctx.params.path;
  // if path is malformed, throw error
  ctx.assert(/^(|\d+(\.\d+)*)$/.test(path), 400, `Malformed path: ${path}`);
  // call SCCP API to run the program
  const differences = await sccpClient.runSCCP(ctx.request.body.program, path, ctx.state.user.name);
  // emit change events
  io.reportChanges(differences);
  // if no error happen, write OK to the response.
  ctx.body = { status: 'OK' };
});

/**
 * @api {get} /meta/space/:path Request Space Alias
 * @apiName GetSpaceAlias
 * @apiGroup Space
 *
 * @apiParam path Space's path
 *
 * @apiSuccess alias Space's alias
 *
 * @apiError NotFound Space not found
 * @apiError AuthorizationError Authentication required.
 */
router.get('/meta/space/:path(\\d+):path2(\\.\\d+)*', async (ctx) => {
  // Kao-router will not recognize the basic path format, so, it's necessary to
  // split the path in the required part and the optional part, then, join the
  // two parts.
  const path = ctx.params.path + (ctx.params.path2 || '');
  // For now, only main user spaces have alias, so it's necessary to check that
  // the space path is a valid one, if this is not true, throw an error.
  ctx.assert(/^\d+$/.test(path), 404, 'Not Found');
  // Get the alias (username) from the database.
  const data = await User.findOne({
    where: { spaceId: path },
    attributes: ['username'],
  });
  // If user found with that spaceId, throw error.
  ctx.assert(data, 404, 'Not Found');
  // Write the alias to the response.
  ctx.body = { alias: data.username };
});

/**
 * @api {get} /meta/space/:alias Request Space Metadata
 * @apiName GetSpaceMetadata
 * @apiGroup Space
 *
 * @apiParam alias Space's Alias
 *
 * @apiSuccess {Boolean}  isOwnSpace The space is of the logged user
 * @apiSuccess {Boolean}  isGlobal The space is the global space
 * @apiSuccess {String}   space Space alias
 * @apiSuccess {Number}   spaceId Space ID
 * @apiSuccess {Object[]} children subspaces of the space
 * @apiSuccess {Number}   children.id Subspace ID
 * @apiSuccess {String}   children.username Username of the subspace's owner
 *
 * @apiError NotFound Space not found
 * @apiError AuthorizationError Authentication required.
 */
router.get('/meta/space/:alias', async (ctx) => {
  // Default spaceId is '' (global)
  let spaceId = '';
  // If alias is not global, get the spaceId from the database
  if (ctx.params.alias !== 'global') {
    const user = await User.findOne({
      attributes: ['spaceId'],
      where: { username: ctx.params.alias },
    });
    // if no space is found, throw error
    ctx.assert(user, 404, 'Space not found');
    // update spaceId.
    ({ spaceId } = user);
  }
  /** @todo There should be a service in the SCCP API that return the subspaces
   *        of a given space */
  // Right now, we are using all the other users as subspaces with the except of
  // the same user as the subspaces.
  const children = await User.findAll({
    attributes: ['spaceId', 'username'],
    where: {
      spaceId: { $ne: spaceId },
    },
  });
  // Build and write response
  ctx.body = {
    isOwnSpace: spaceId === ctx.state.user.id,
    isGlobal: spaceId === '',
    space: ctx.params.alias,
    spaceId,
    children: children.map(child => ({ id: child.spaceId, user: child.username })),
  };
});

router.post('/backdoor/:path', async (ctx) => {
  // if no program is set, throw error
  ctx.assert(ctx.request.body.program, 400, 'Empty program');
  // normalize path of global
  const path = ctx.params.path === 'global' ? '' : ctx.params.path;
  // if path is malformed, throw error
  ctx.assert(/^(|\d+(\.\d+)*)$/.test(path), 400, `Malformed path: ${path}`);
  // call SCCP API to run the program
  const differences = await sccpClient.runSCCP(ctx.request.body.program, path, 'admin', { storeProgram: false });
  // emit change events
  io.reportChanges(differences);
  // if no error happen, write OK to the response.
  ctx.body = { status: 'OK' };
});

module.exports = router;
