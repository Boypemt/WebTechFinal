const rateLimit = require('express-rate-limit');

// Brute-force defense: caps login attempts to 5 per 15 min per IP.
module.exports = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many login attempts, please try again later.',
    },
});
