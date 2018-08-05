/**
 * Adds the required metadata for each procedure that is being executed en in
 * the program
 * @param {Expressions.Procedure} procedure
 * @param {String} user
 */
function tagProcedures(procedure, { user }) {
  switch (procedure.name) {
    case 'vote':
      procedure.params.list[0].value = `<pids|v|uid|${user}>${procedure.params.list[0].value}`;
      procedure.pushParam(user);
      break;
    case 'signal':
      procedure.params.list[0].value = `<pids|s|uid|${user}>${procedure.params.list[0].value}`;
      break;
    case 'post':
    case 'notify':
      procedure.params.list[0].value = `<pids|p|uid|${user}>${procedure.params.list[0].value}`;
      break;
    // no default
  }
}

module.exports = { tagProcedures };
