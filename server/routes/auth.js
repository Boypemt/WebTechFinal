const { Router }      = require('express');
const { login }       = require('../controllers/authController');
const loginRateLimit  = require('../middleware/loginRateLimit');

const router = Router();

router.post('/', loginRateLimit, login);

module.exports = router;
