import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET, REFRESH_TOKEN_SECRET } from "../config.js";
import Token from "../models/Token.js";

export const registerUser = async (req, res) => {
  const { username, password, confirmPassword } = req.body;

  if (!username || !password) {
    return res.status(400).json("All fields are required.");
  }

  if (username.length < 3) {
    return res.status(400).json("Username must be at least 3 characters long.");
  }

  if (username.length > 20) {
    xc;
    return res
      .status(400)
      .json("Username must be no more than 20 characters long.");
  }

  if (password.length < 6) {
    return res.status(400).json("Password must be at least 6 character long.");
  }

  if (password !== confirmPassword) {
    return res.status(400).json("Passwords do not match.");
  }

  try {
    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      return res.status(400).json("The username is already in use.");
    }

    const hashed = await User.hashPassword(password);
    const newUser = new User({ username, password: hashed });
    await newUser.save();

    res.status(201).json("User registered successfully.");
  } catch (error) {
    res
      .status(500)
      .json(
        "An unknown error occurred while trying to register the user, please try again later."
      );
  }
};

export const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json("All fields are required.");
  }

  try {
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(400).json("incorrect username or password");
    }

    const isValid = await User.comparePassword(password, user.password);

    if (!isValid) {
      return res.status(400).json("incorrect username or password");
    }

    const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const refreshToken = jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, {
      expiresIn: "1d",
      algorithm: "HS256",
    });

    await new Token({ token: refreshToken, expiresAt: expiration }).save();

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000,
    });

    const accessToken = jwt.sign(
      {
        id: user._id,
        username: user.username,
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
        algorithm: "HS256",
      }
    );

    res.status(200).json({
      username: user.username,
      accessToken,
    });
  } catch (error) {
    res
      .status(500)
      .json(
        "An unknown error occurred while trying to log in the user, please try again later."
      );
  }
};

export const refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json("No refresh token found");
  }

  const found = await Token.findOne({ token: refreshToken });

  jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json("Invalid refresh token");
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json("user not found");
    }

    const newAccessToken = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    res.status(200).json({
      username: user.username,
      newAccessToken,
    });
  });
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(204).json("No token found");
    }

    await Token.findOneAndDelete({ token: refreshToken });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    return res.status(200).json("Logout successful");
  } catch (error) {
    return res.status(500).json("Error during logout");
  }
};
