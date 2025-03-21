import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import {connecteDb} from './database/db.js';
import { errorMiddleware } from './middlewares/error-middleware.js';
import userRoutes from './routes/user-router.js';
import {removeUnverifiedAccounts} from './automation/remove-unverified-accout.js';
// Load environment variables from .env file
dotenv.config();

// Create Express app
export const app = express();

// Required Middlewares
app.use(cors({
  origin: [process.env.CLIENT_URL],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Enable cookies
}));

app.use(cookieParser());

app.use(express.json());

app.use(express.urlencoded({extended: true}));

app.use('/api/v1/user', userRoutes);

removeUnverifiedAccounts();
connecteDb();

app.use(errorMiddleware);