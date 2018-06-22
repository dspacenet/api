/**
 * Generic error supposed to be exposed to the user
 */
class APIError extends Error {
  /**
   * @param {String} message
   * @param {Number=} status
   */
  constructor(message, status) {
    super(message);
    this.status = status || 500;
    this.expose = true;
  }
}

/**
 * If the [predicate] is false, throws an error that is exposed to the user with
 * the given [message] and [status] code
 * @param {Boolean} predicate
 * @param {Number} status
 * @param {String} message
 */
function assert(predicate, status, message) {
  if (!predicate) throw new APIError(message, status);
}

module.exports = { APIError, assert };
