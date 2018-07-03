const { SculpParser, Expressions } = require('@dspacenet/sculp-parser');

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

/**
 * Replaces unimplemented expressions with the equivalent code in SCULP
 * @param {Expressions.Expression} expression
 */
function translateUnimplementedExpressions(expression) {
  switch (expression.constructor) {
    case Expressions.Procedure:
      switch (expression.name) {
        case 'notify':
          return new SculpParser('enter @ "inbox" do post($message)', {
            message: expression.params[0],
          }).result;
        // no default
      }
      break;
    case Expressions.Constraint:
      switch (expression.name) {
        case 'msg':
          return new SculpParser('"<".*."|".$user.">".$content', {
            user: expression.params[0],
            content: expression.params[1],
          }).result;
        case 'msg-content':
          return new SculpParser('"<".*."|".*.">".$content', {
            content: expression.params[0],
          }).result;
        case 'msg-user':
          return new SculpParser('"<".*."|".$user.">".*', {
            user: expression.params[0],
          }).result;
        // no default
      }
      break;
    // no default
  }
  return expression;
}

function translateSpacePath(expression) {
  // Translation of each valid special space.
  const spaces = {
    meta: 0,
    top: 2,
    abattoir: 4,
    clock: 6,
    pbox: 8,
    poll: 10,
    inbox: 12,
    outbox: 14,
  };
  if (expression instanceof Expressions.SpacePath && expression.path.value in spaces) {
    return new Expressions.Number(spaces[expression.path.value]);
  }
  return expression;
}

module.exports = { tagProcedures, translateSpacePath, translateUnimplementedExpressions };
