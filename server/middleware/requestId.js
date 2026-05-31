// Request IDs let us correlate client errors with server logs.
// The client sees the ID in the response header (X-Request-Id) and
// in any 500 body. Operators grep logs by that ID.
module.exports = (req, res, next) => {
    const id = Math.random().toString(36).slice(2, 10);
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
};
