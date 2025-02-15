import express from 'express';
import { forgotPassword, getUser, login, logout, register, resetPassword, verifyOTP } from '../controllers/user-controller.js';
import { isAuthenticated } from '../middlewares/auth-middleware.js';
const router = express.Router();

router.post('/register', register);
router.post('/otp-verification', verifyOTP);
router.post('/login', login);
router.post('/logout', isAuthenticated ,logout);

router.get('/me', isAuthenticated, getUser);

router.post('/password/forgot', forgotPassword);
router.put('/password/reset/:token', resetPassword);

export default router;