const axios = require('axios');

// Create HTTP Client to consume the SCCP API
const sccpClient = axios.create({ baseURL: `http://localhost:${process.env.SCCP_PORT || 8082}/` });

/**
 * Alters [program] to run inside the given [path].
 * @param {String} program - A SCULP/SCCP program to be runned.
 * @param {String} path - A string contining the path to the space where the
 * program will be runned.
 */
function spaceWrap(program, path) {
  // If path is empty, no alteration is done.
  if (path === '') return program;
  let result = program;
  `${path}`.split('.').forEach((spaceId) => { result = `([${result}] ${spaceId})`; });
  return result;
}

/**
 * Run the given [program] owned by [user] in the given [path].
 * @param {String} program - program to be runned.
 * @param {String} path - path to the space where the program will be runned.
 * @param {String} user - owner of the program.
 */
async function runSCCP(program, path, user, timeu = 1) {
  // Path the program to post it's source code to the top of the given path
  const patchedProgram = `${program} || enter @ "top" do post("${encodeURI(program)}")`;
  // Call the SCCP API with the given program, path and user.
  const { data } = await sccpClient.post('runsccp', { config: spaceWrap(patchedProgram, path), user, timeu });
  // If result is 'error', throw error messages in result.errors
  if (data.result === 'error') {
    let errorMessage = '';
    data.errors.forEach((error) => { errorMessage = `${errorMessage} ${error.error}`; });
    const error = new Error(errorMessage);
    error.expose = true;
    error.status = 400;
    throw error;
  }
}

/**
 * Return the content of the space in [path].
 * @param {String} path
 * @todo Use 'getSpace/' to get the global space.
 */
async function getSpace(path) {
  const { data } = path === '' ?
    await sccpClient.get('getGlobal') :
    await sccpClient.post('getSpace', { id: path.split('.') });
  if (data.result === 'error') {
    const error = new Error(data.errors);
    error.status = 400;
    throw error;
  }
  return data.result;
}

module.exports = { runSCCP, getSpace };
