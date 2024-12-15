import dotenv from "dotenv";

dotenv.config();

export const JWT_SECRET = process.env.JWT_SECRET;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
export const FRONTEND_URL = process.env.FRONTEND_URL;
export const MONGODB_URI = process.env.MONGODB_URI;
