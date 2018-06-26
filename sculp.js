const { Expressions } = require('@dspacenet/sculp-parser');

/**
 * Adds the required metadata for each procedure that is being executed en in
 * the program
 * @param {Expressions.Procedure} procedure
 * @param {String} user
 */
function tagProcedures(procedure, { user }) {
  switch (procedure.name) {
    case 'vote':
      procedure.params[0].value = `<pids|v|${user}>${procedure.params[0].value}`;
      procedure.pushParam(user);
      break;
    case 'signal':
      procedure.params[0].value = `<pids|s|${user}>${procedure.params[0].value}`;
      break;
    case 'post':
      procedure.params[0].value = `<pids|p|${user}>${procedure.params[0].value}`;
      break;
    // no default
  }
}

module.exports = { tagProcedures };
