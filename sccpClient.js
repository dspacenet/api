const { APIError } = require('./errorHandling');
const { SculpParser, Expressions } = require('@dspacenet/sculp-parser');
const MaudeProcess = require('@dspacenet/maude');
const fs = require('fs').promises;
const crypto = require('crypto');
const { promisify } = require('util');
const { load } = require('crontab');
const sculp = require('./sculp');
const io = require('./io');

/**
 * @typedef Message
 * @prop {String} class
 * @prop {String} content
 * @prop {Number} pid
 * @prop {String} id
 * @prop {String} user
 *
 * @typedef MemoryDifferences
 * @prop {[Message]} added
 * @prop {[string]} removed
 */

const maude = new MaudeProcess(`${__dirname}/../sccp/maude.linux64`, { timeLimit: 15000 });
/** @type {Object.<string,[Message]>} */
let memory = {};
let processes = '';
let ntccTime = 0;
let rawMemory = '';
let crontab;
let busy = false;

const parser = new SculpParser({
  post: [Expressions.String],
  signal: [Expressions.String],
  vote: [Expressions.String],
  rm: [Expressions.Constraint, Expressions.Constraint, Expressions.Constraint],
  notify: [Expressions.String],
  clock: [Expressions.String],
  abort: [],
  kill: [Expressions.String],
  mail: [Expressions.String],
  'create-poll': [Expressions.String],
  'close-poll': [],
  call: [Expressions.String],
});

const loadCrontab = promisify(load);
const executionQueue = [];

/**
 * Alters [program] to run inside the given [path].
 * @param {String} program - A SCULP/SCCP program to be executed.
 * @param {String} path - A string containing the path to the space where the
 * program will be executed.
 * @todo can be done in better way using reduce.
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
  const match = message.match(/<(.+)\|.\|(.+)\|(.+)>(.*)/);
  if (match !== null) {
    return {
      pid: match[1],
      id: match[2],
      user: match[3],
      content: match[4],
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
 * @param {Object.<string,[Message]} oldMemory
 * @param {Object.<string,[Message]} newMemory
 * @returns {Object.<string,MemoryDifferences}
 */
function getMemoryChanges(oldMemory, newMemory) {
  const differences = {};
  /** @type {[string]} */
  const keys = [...new Set(Object.keys(oldMemory).concat(Object.keys(newMemory)))];
  keys.forEach((key) => {
    const oldIds = (oldMemory[key] || []).map(message => message.id);
    const newIds = (newMemory[key] || []).map(message => message.id);
    differences[key] = {
      added: (newMemory[key] || []).filter(message => !oldIds.includes(message.id)),
      removed: oldIds.filter(id => !newIds.includes(id)),
    };
    if (!differences[key].added.length && !differences[key].removed.length) delete differences[key];
  });
  return differences;
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
  const differences = getMemoryChanges(memory, newMemory);
  memory = newMemory;
  return differences;
}

async function updateState(newMemory, newProcesses) {
  rawMemory = newMemory
    .replace(/<pids\|/g, `<${ntccTime}|`)
    .replace(/\|uid\|/g, () => `|${crypto.randomBytes(5).toString('hex')}|`);
  ntccTime += 1;
  processes = newProcesses;
  await fs.writeFile('state.json', JSON.stringify({ ntccTime, rawMemory, processes }));
  return parseMemory();
}

/**
 * Run the given [program] owned by [user] in the given [path].
 * @param {String} program - program to be executed.
 * @param {String} path - path to the space where the program will be executed.
 * @param {String} user - owner of the program.
 */
async function postRunSCCP(program, path, user, raw) {
  try {
    let result = '';
    let programToExecute;
    if (raw) {
      programToExecute = program
        .replace(/post\("/g, `post("<pid|p|uid|${user}>`)
        .replace(/notify\("/g, `notify("<pid|p|uid|${user}>`)
        .replace(/signal\("/g, `signal("<pid|p|uid|${user}>`)
        .replace(/vote\("/g, `vote("<pid|v|uid|${user}>`)
        .replace(/signal\("/g, `signal("<pid|s|uid|${user}>`);
    } else {
      const parsedProgram = parser.parse(program);
      // Parse the program to check syntax
      const originalProgram = parsedProgram.toString();
      // Patch the program to post it's source code to the top of the given path
      const finalProgram = parser.parse(`$program || enter @ "top" do post("${encodeURI(originalProgram)}")`, {
        program: parsedProgram,
      });
      // Tag procedures
      finalProgram.applyTo(
        Expressions.Procedure,
        procedure => sculp.tagProcedures(procedure, { user }),
      );
      // Translate SCULP only expressions
      finalProgram.patch(sculp.translateSCULP);
      programToExecute = finalProgram.toString();
    }
    ({ result } = await maude.run(`red in SCCP-RUN : ${spaceWrap(programToExecute, path)} . \n`));
    const translatedProgram = result.match(/^SpaInstruc: (.+)$/)[1]
      .replace(/<pid\|/g, `<${ntccTime}|`)
      .replace(/{pid}/g, ntccTime)
      .replace(/\|usn>/g, `|${user}>`)
      .replace(/usn/g, user);
    const processesToExecute = `${translatedProgram} || ${processes}`;
    ({ result } = await maude.run(`red in NTCC-RUN : IO(< ${processesToExecute} ; ${rawMemory} >) . \n`));
    const [, newProcesses, newMemory] = result.match(/^Conf: < (.+) ; (.+) >/);
    return updateState(newMemory, newProcesses);
  } catch (error) {
    console.error(error); // eslint-disable-line no-console
    throw new APIError(`${Error.name}: ${error.message}`, 400);
  }
}

async function next() {
  if (!busy && executionQueue.length) {
    const {
      program, path, user, raw, reject, resolve,
    } = executionQueue.shift();
    busy = true;
    try {
      resolve(await postRunSCCP(program, path, user, raw));
    } catch (error) {
      reject(error);
    }
    busy = false;
    if (executionQueue.length) process.nextTick(next);
  }
}

function runSCCP(program, path, user, raw) {
  return new Promise((resolve, reject) => {
    executionQueue.push({
      program, path, user, raw, resolve, reject,
    });
    next();
  });
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

async function getProcess(raw = false) {
  if (raw) return processes;
  const regex = /( \|\| |[()"]|[^()"]+)/y;
  const processesList = [];
  let token = regex.exec(processes);
  let isString = false;
  let parenthesisCount = 0;
  let lastFound = 0;
  while (token !== null) {
    switch (token[0]) {
      case '(': if (!isString) parenthesisCount += 1; break;
      case ')': if (!isString) parenthesisCount -= 1; break;
      case '"': isString = !isString; break;
      case ' || ':
        if (!isString && parenthesisCount === 0) {
          processesList.push(processes.substring(lastFound, regex.lastIndex - 4));
          lastFound = regex.lastIndex;
        }
        break;
      // no default
    }
    token = regex.exec(processes);
  }
  processesList.push(processes.substring(lastFound, processes.length));
  return processesList.map(item => ({ process: item }));
}

function setClock(cronExpression, path) {
  crontab.remove({ comment: new RegExp(`p${path}\\$`) });
  if (cronExpression !== '0') {
    crontab.create(`${process.execPath} ${__dirname}/tickWorker.js ${path}`, cronExpression, `p${path}$`);
  }
  crontab.save((error) => { if (error) throw error; });
}

function getTime() {
  return ntccTime;
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
  try {
    crontab = await loadCrontab();
  } catch (error) {
    throw new Error(`An error ocurred while loading crontab: ${error}`);
  }
  parseMemory(rawMemory);
  io.pushInternal(/6$/, (path, data) => {
    data.added.forEach((post) => {
      if (post.content !== 'tick') setClock(post.content, path.match(/^(.+)\.6$/)[1] || 6);
    });
  });
}

function resetMemory() {
  return updateState('empty[empty-forest]', processes);
}

function killAllProcess() {
  processes = 'skip';
}

function killAllClocks() {
  crontab.remove({ comment: /.*/ });
  crontab.save((error) => { if (error) throw error; });
}

function restartCore() {
  maude.destroy();
  maude.spawnProcess();
}

module.exports = {
  runSCCP,
  getSpace,
  initialize,
  getTime,
  getProcess,
  resetMemory,
  restartCore,
  killAllProcess,
  killAllClocks,
};
