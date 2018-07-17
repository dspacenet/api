const { APIError } = require('./errorHandling');
const { SculpParser, Expressions } = require('@dspacenet/sculp-parser');
const fs = require('fs').promises;
const MaudeProcess = require('@dspacenet/maude');
const sculp = require('./sculp');

/**
 * @typedef Message
 * @prop {String} class
 * @prop {String} content
 * @prop {Number} pid
 * @prop {String} user
 */

const maude = new MaudeProcess(`${__dirname}/../sccp/maude.linux64`);
/** @type {Object.<string,[Message]>} */
let memory = {};
let processes = '';
let ntccTime = 0;
let rawMemory = '';

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
 *
 * @param {String} message
 * @returns {Message}
 */
function parseMessage(message) {
  const match = message.match(/<(.+)\|.\|(.+)>(.*)/);
  if (match !== null) {
    return {
      pid: match[1],
      user: match[2],
      content: match[3],
      class: 'message',
    };
  }
  return {
    class: 'system',
    content: message,
  };
}

/**
 *
 * @param {String} rawMemory
 */
function parseMemory() {
  const regex = /([[\]:()"\s]|[^[[\]:()"\s]+)/y;
  let token = regex.exec(rawMemory);
  const newMemory = {};
  const space = [0];
  let contents = [];
  let stringStart = 0;

  while (token !== null) {
    if (stringStart > 0) {
      if (token[1] === '"') {
        contents.push(parseMessage(rawMemory.substring(stringStart, regex.lastIndex - 1)));
        stringStart = 0;
      }
    } else {
      switch (token[1]) {
        case '"': stringStart = regex.lastIndex; break;
        case '[':
          if (contents.length) newMemory[space.join('.')] = contents;
          contents = [];
          space.push(0);
          break;
        case ':': space[space.length - 1] += 1; break;
        case ']': space.pop(); break;
        // no default
      }
    }
    token = regex.exec(rawMemory);
  }
  memory = newMemory;
}

async function updateState(newMemory, newProcesses) {
  ntccTime += 1;
  rawMemory = newMemory.replace('<pids|', `<${ntccTime}|`);
  processes = newProcesses;
  await fs.writeFile('state.json', JSON.stringify({ ntccTime, rawMemory, processes }));
  parseMemory();
}

/**
 * Run the given [program] owned by [user] in the given [path].
 * @param {String} program - program to be executed.
 * @param {String} path - path to the space where the program will be executed.
 * @param {String} user - owner of the program.
 */
async function runSCCP(program, path, user) {
  try {
    // Parse the program to check syntax
    const parser = new SculpParser(program);
    const originalProgram = parser.result.toString();
    // Translate unimplemented expressions
    parser.patch(sculp.translateUnimplementedExpressions);
    // Patch the program to post it's source code to the top of the given path
    const finalProgram = new SculpParser(`$program || enter @ "top" do post("${encodeURI(originalProgram)}")`, {
      program: parser.result,
    });
    // Translate space path
    finalProgram.patch(sculp.translateSpacePath);
    // Tag procedures
    finalProgram.applyTo(
      Expressions.Procedure,
      procedure => sculp.tagProcedures(procedure, { user }),
    );
    let result = '';
    ({ result } = await maude.run(`red in SCCP-RUN : ${spaceWrap(finalProgram, path)} . \n`));
    const translatedProgram = result.match(/^SpaInstruc: (.+)$/)[1]
      .replace('<pid|', `<${ntccTime}|`)
      .replace('{pid}', ntccTime)
      .replace('|usn>', `|${user}>`)
      .replace('usn', user);
    processes = `${translatedProgram} || ${processes}`;
    ({ result } = await maude.run(`red in NTCC-RUN : IO(< ${processes} ; ${rawMemory} >) . \n`));
    const [, newProcesses, newMemory] = result.match(/^Conf: < (.+) ; (.+) >/);
    await updateState(newMemory, newProcesses);
  } catch (error) {
    throw new APIError(`${Error.name}: ${error.message}`, 400);
  }
}

/**
 * Return the content of the space in [path].
 * @param {String} path
 */
async function getSpace(path, filter = true) {
  path = path === '' ? '0' : `0.${path}`; // eslint-disable-line no-param-reassign
  if (path in memory) {
    if (!filter) return memory[path];
    // Filter system and private messages before sending it
    return memory[path].filter(post => post.class !== 'system');
  }
  return [];
}

async function initialize() {
  try {
    const state = await fs.readFile('state.json');
    ({ processes, rawMemory, ntccTime } = JSON.parse(state.toString()));
  } catch (error) {
    console.warn('Warning: state file not found, initializing with an empty file.'); // eslint-disable-line no-console
    rawMemory = 'empty[empty-forest]';
    processes = 'skip';
    ntccTime = 0;
  }
  parseMemory(rawMemory);
}

module.exports = { runSCCP, getSpace, initialize };
