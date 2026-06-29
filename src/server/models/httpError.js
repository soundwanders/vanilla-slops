export default class HttpError extends Error {
  constructor(status, message, code = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
