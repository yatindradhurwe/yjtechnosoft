const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  /** code: optional machine-readable reason (e.g. OUTSIDE_GEOFENCE), details: extra data for the client */
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    if (code) this.code = code;
    if (details) this.details = details;
  }
}

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'A record with the same unique value already exists';
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    status = 409;
    message = 'This record is in use by other records and cannot be deleted';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'Uploaded file is too large';
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ message });
}

module.exports = { asyncHandler, HttpError, notFound, errorHandler };
