import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
  },

  expiresAt: {
    type: Date,
    required: true,
    expires: 0,
  },
});

const Token = mongoose.model("Token", tokenSchema);

export default Token;
