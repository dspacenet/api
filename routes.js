const Router = require('koa-router');
const jwt = require('jsonwebtoken');
const { User } = require('./db');
const sccpClient = require('./sccpClient');

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
  // Get user fron database
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
 *
 * @apiError UserError Malformed path: `path`
 * @apiError AuthorizationError Authentication required.
 *
 * @todo path assertion regexp shold be global.
 */
router.get('/space/:path', async (ctx) => {
  // Normalize path of global
  const path = ctx.params.path === 'global' ? '' : ctx.params.path;
  // if path is malformed, throw error
  ctx.assert(/^(|\d+(\.\d+)*)$/.test(path), 400, `Malformed path: ${path}`);
  // Call SCCP API to get space contents and write response
  ctx.body = await sccpClient.getSpace(path);
});

/**
 * @api {post} /space/:path Post Program in Space
 * @apiName PostProgram
 * @apiGroup Space
 *
 * @apiParam path    Space's path
 * @apiParam program Program to be posted
 *
 * @apiSucess status OK
 *
 * @apiError UserError Malformed path: `path`
 * @apiError UserError Malformed Program: `program`
 * @apiError AuthorizationError Authentication required.
 *
 * @todo path assertion regexp shold be global.
 */
router.post('/space/:path', async (ctx) => {
  // if no program is set, throw error
  ctx.assert(ctx.request.body.program, 400, 'Empty program');
  // normalize path of global
  const path = ctx.params.path === 'global' ? '' : ctx.params.path;
  // if path is malformed, throw error
  ctx.assert(/^(|\d+(\.\d+)*)$/.test(path), 400, `Malformed path: ${path}`);
  // call SCCP API to run the program
  await sccpClient.runSCCP(ctx.request.body.program, path, ctx.state.user.name);
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
 * @apiSuccess {Object[]} childs Subspaces of the Space
 * @apiSuccess {Number}   childs.id Subspace ID
 * @apiSuccess {String}   childs.username Username of the Subspace's owner
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
  const childs = await User.findAll({
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
    childs: childs.map(child => ({ id: child.spaceId, user: child.username })),
  };
});

module.exports = router;
