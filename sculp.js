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
      procedure.params.list[0].value = `<pids|v|uid|${user}>${procedure.params.list[0].value}`;
      procedure.pushParam(user);
      break;
    case 'signal':
      procedure.params.list[0].value = `<pids|s|uid|${user}>${procedure.params.list[0].value}`;
      break;
    case 'post':
    case 'notify':
    case 'mail':
      procedure.params.list[0].value = `<pids|p|uid|${user}>${procedure.params.list[0].value}`;
      break;
    // no default
  }
}

/**
 * Translate SCULP only expressions to SCCP
 * @param {Expressions.Expression} expression
 */
function translateSCULP(expression) {
  if (expression instanceof Expressions.MatchList) {
    const pid = expression.list.pid ? expression.list.pid.pattern : '*';
    const usr = expression.list.usr ? expression.list.usr.pattern : '*';
    const body = expression.list.body ? expression.list.body.pattern : '*';
    return new Expressions.Pattern(`"<" . ${pid} . * . "|" . ${usr} . ">" . ${body}`);
  }
  return expression;
}

module.exports = { tagProcedures, translateSCULP };
