require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "linktree",
};

mysql.createConnection(dbConfig, (err, connection) => {
  if (err) {
    console.error("Error connecting to database:", err.stack);
    return;
  }
  console.log("Connected to database as id " + connection.threadId);
  connection.end();
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // set to true if using HTTPS
  })
);

// Set EJS as view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Database initialization
async function initializeDatabase() {
  try {
    const connection = await mysql.createConnection(dbConfig);

    // Create users table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        verification_code VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create links table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        platform VARCHAR(50) NOT NULL,
        url VARCHAR(255) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create profiles table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        display_name VARCHAR(100),
        bio TEXT,
        theme_color VARCHAR(50) DEFAULT '#6366f1',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log("Database initialized successfully");
    await connection.end();
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
}

initializeDatabase();

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Routes
app.get("/", (req, res) => {
  res.render("home", { user: req.session.user });
});

app.get("/create", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.render("create");
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await mysql.createConnection(dbConfig);

    // Check if email already exists
    const [existing] = await connection.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = uuidv4();

    // Insert new user
    await connection.execute(
      "INSERT INTO users (email, password, verification_code) VALUES (?, ?, ?)",
      [email, hashedPassword, verificationCode]
    );

    // Send verification email
    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/verify?code=${verificationCode}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your LinkTree account",
      html: `
        <h1>Welcome to LinkTree!</h1>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    await connection.end();

    res
      .status(200)
      .json({
        message:
          "Registration successful. Please check your email for verification.",
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration failed" });
  }
});

app.get("/verify", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect("/create");
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    // Find user with verification code
    const [users] = await connection.execute(
      "SELECT * FROM users WHERE verification_code = ?",
      [code]
    );

    if (users.length === 0) {
      return res.render("verify", {
        success: false,
        message: "Invalid verification code",
      });
    }

    const user = users[0];

    // Update user as verified
    await connection.execute(
      "UPDATE users SET verified = TRUE, verification_code = NULL WHERE id = ?",
      [user.id]
    );

    // Create empty profile
    await connection.execute("INSERT INTO profiles (user_id) VALUES (?)", [
      user.id,
    ]);

    await connection.end();

    // Auto-login the user
    req.session.user = { id: user.id, email: user.email };
    res.render("verify", {
      success: true,
      message: "Email verified successfully!",
      redirect: "/dashboard",
    });
  } catch (error) {
    console.error(error);
    res.render("verify", { success: false, message: "Verification failed" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await mysql.createConnection(dbConfig);

    // Find user by email
    const [users] = await connection.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const user = users[0];

    // Check if user is verified
    if (!user.verified) {
      return res
        .status(400)
        .json({ message: "Please verify your email first" });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Set session
    req.session.user = { id: user.id, email: user.email };

    await connection.end();

    res
      .status(200)
      .json({ message: "Login successful", redirect: "/dashboard" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/create");
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    // Get user profile
    const [profiles] = await connection.execute(
      "SELECT * FROM profiles WHERE user_id = ?",
      [req.session.user.id]
    );

    // Get user links
    const [links] = await connection.execute(
      "SELECT * FROM links WHERE user_id = ?",
      [req.session.user.id]
    );

    await connection.end();

    res.render("dashboard", {
      user: req.session.user,
      profile: profiles[0],
      links: links,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/");
  }
});

app.post("/update-profile", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { displayName, bio, themeColor } = req.body;

  try {
    const connection = await mysql.createConnection(dbConfig);

    await connection.execute(
      "UPDATE profiles SET display_name = ?, bio = ?, theme_color = ? WHERE user_id = ?",
      [displayName, bio, themeColor, req.session.user.id]
    );

    await connection.end();

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Profile update failed" });
  }
});

app.post("/add-link", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { platform, url } = req.body;

  try {
    const connection = await mysql.createConnection(dbConfig);

    await connection.execute(
      "INSERT INTO links (user_id, platform, url) VALUES (?, ?, ?)",
      [req.session.user.id, platform, url]
    );

    await connection.end();

    res.status(200).json({ message: "Link added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to add link" });
  }
});

app.post("/delete-link", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { id } = req.body;

  try {
    const connection = await mysql.createConnection(dbConfig);

    await connection.execute("DELETE FROM links WHERE id = ? AND user_id = ?", [
      id,
      req.session.user.id,
    ]);

    await connection.end();

    res.status(200).json({ message: "Link deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete link" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const connection = await mysql.createConnection(dbConfig);

    // Find user by email (using email as username for simplicity)
    const [users] = await connection.execute(
      "SELECT * FROM users WHERE email = ?",
      [username + "@" + process.env.EMAIL_DOMAIN || "example.com"]
    );

    if (users.length === 0) {
      return res.status(404).render("404");
    }

    const user = users[0];

    // Get user profile
    const [profiles] = await connection.execute(
      "SELECT * FROM profiles WHERE user_id = ?",
      [user.id]
    );

    // Get user links
    const [links] = await connection.execute(
      "SELECT * FROM links WHERE user_id = ?",
      [user.id]
    );

    await connection.end();

    if (links.length === 0) {
      return res.status(404).render("404");
    }

    res.render("linktree", {
      profile: profiles[0],
      links: links,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("500");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
