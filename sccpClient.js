const axios = require('axios');
const { SculpParser, Expressions } = require('sculp-parser');

// Create HTTP Client to consume the SCCP API
const sccpClient = axios.create({ baseURL: `http://localhost:${process.env.SCCP_PORT || 8082}/` });

/**
 * Alters [program] to run inside the given [path].
 * @param {String} program - A SCULP/SCCP program to be executed.
 * @param {String} path - A string containing the path to the space where the
 * program will be executed.
 */
function spaceWrap(program, path) {
  // If path is empty, no alteration is done.
  if (path === '') return program;
  let result = program;
  `${path}`.split('.').reverse().forEach((spaceId) => { result = `([${result}] ${spaceId})`; });
  return result;
}

/**
 * Run the given [program] owned by [user] in the given [path].
 * @param {String} program - program to be executed.
 * @param {String} path - path to the space where the program will be executed.
 * @param {String} user - owner of the program.
 */
async function runSCCP(program, path, user, timeu = 1) {
  // Parse the program to check syntax
  const parser = new SculpParser(program);
  // Add user to vote calls
  parser.applyTo(Expressions.Procedure, (procedure) => { if (procedure.name === 'vote') procedure.pushParam(user); });
  // rebuild program with update source code
  const parsedProgram = parser.result.toString();
  // Path the program to post it's source code to the top of the given path
  const patchedProgram = `${parsedProgram} || enter @ "top" do post("${encodeURI(parsedProgram)}")`;
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
async function getSpace(path, filter = true) {
  const { data } = path === '' ?
    await sccpClient.get('getGlobal') :
    await sccpClient.post('getSpace', { id: path.split('.') });
  if (data.result === 'error') {
    const error = new Error(data.errors);
    error.status = 400;
    throw error;
  }
  // If not filter, send messages without filtering.
  if (!filter) return data.result;
  // Filter system and private messages before sending it
  return data.result.filter(post => post.class !== 'system' && post.usr_msg !== 'private');
}

module.exports = { runSCCP, getSpace };
