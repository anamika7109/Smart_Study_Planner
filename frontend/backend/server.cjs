const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const fs = require("node:fs");
const os = require("node:os");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const session = require("express-session");
const MongoStore = require("connect-mongo");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const scrypt = promisify(crypto.scrypt);
const SESSION_SECRET = process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "studyflow-development-only-change-before-deploy");
const SESSION_COOKIE_NAME = "studyflow.sid";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;
const LOCAL_DATA_DIR = process.env.STUDYFLOW_LOCAL_DATA_DIR ||
  (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "StudyFlow") : path.join(os.homedir(), ".studyflow"));
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, "planner-store.json");

function loadLocalState() {
  try {
    const saved = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, "utf8"));
    return {
      users: Array.isArray(saved.users) ? saved.users : [],
      notes: Array.isArray(saved.notes) ? saved.notes : [],
      sessions: saved.sessions && typeof saved.sessions === "object" ? saved.sessions : {},
    };
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("Could not read local StudyFlow data:", error.message);
    return { users: [], notes: [], sessions: {} };
  }
}

const localState = loadLocalState();

function persistLocalState() {
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true, mode: 0o700 });
  const tempFile = `${LOCAL_DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(localState), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempFile, LOCAL_DATA_FILE);
}

class LocalFileSessionStore extends session.Store {
  get(sessionId, callback) {
    const savedSession = localState.sessions[sessionId];
    if (!savedSession) return callback(null, null);

    const storageMode = mongoose.connection.readyState === 1 ? "mongo" : "local";
    const expiresAt = savedSession.cookie?.expires ? new Date(savedSession.cookie.expires).getTime() : null;
    if ((savedSession.__storageMode && savedSession.__storageMode !== storageMode) ||
        (Number.isFinite(expiresAt) && expiresAt <= Date.now())) {
      delete localState.sessions[sessionId];
      try {
        persistLocalState();
        return callback(null, null);
      } catch (error) {
        return callback(error);
      }
    }
    callback(null, savedSession);
  }

  set(sessionId, value, callback = () => {}) {
    const storageMode = mongoose.connection.readyState === 1 ? "mongo" : "local";
    localState.sessions[sessionId] = { ...value, __storageMode: storageMode };
    try {
      persistLocalState();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sessionId, value, callback = () => {}) {
    if (!localState.sessions[sessionId]) return callback(null);
    this.set(sessionId, value, callback);
  }

  destroy(sessionId, callback = () => {}) {
    delete localState.sessions[sessionId];
    try {
      persistLocalState();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production.");
}
if (!process.env.SESSION_SECRET) {
  console.warn("Using the development-only SESSION_SECRET. Configure a persistent secret before deployment.");
}
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Gemini model using 3.5-flash
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.set("Referrer-Policy", "no-referrer");
  next();
});

const sessionOptions = {
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS * 1000,
  },
};

if (MONGODB_URI && process.env.NODE_ENV === "production") {
  sessionOptions.store = MongoStore.create({
    mongoUrl: MONGODB_URI,
    collectionName: "studyflow_sessions",
    ttl: SESSION_TTL_SECONDS,
  });
} else if (process.env.NODE_ENV === "production") {
  throw new Error("MONGODB_URI is required in production.");
} else {
  sessionOptions.store = new LocalFileSessionStore();
  console.warn(`Development planner data and sessions persist locally at ${LOCAL_DATA_FILE}.`);
}

app.use(session(sessionOptions));

// --------------------------------------------------
// MongoDB Note Schema
// --------------------------------------------------

const noteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    prompt: {
      type: String,
      default: "",
    },
    content: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      default: "General",
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Note = mongoose.model("Note", noteSchema);

const initialPlannerState = () => ({
  profile: {
    name: "",
    studentClass: "",
    course: "",
    goal: "",
    dailyGoal: 60,
    streak: 0,
    lastStudyDate: "",
    onboardingComplete: false,
  },
  data: { subjects: [], tasks: [], exams: [], studySessions: [], activityLog: [] },
  dashboardPrefs: {
    stats: ["streak", "today", "tasks", "subjects"],
    sections: { tasks: true, exams: true, subjects: true },
  },
  flashcardReviews: {},
});

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    isGuest: { type: Boolean, default: false, index: true },
    passwordHash: { type: String, default: null, select: false },
    recoveryCodeHash: { type: String, default: null, select: false },
    sessionVersion: { type: Number, default: 0 },
    profile: { type: mongoose.Schema.Types.Mixed, default: () => initialPlannerState().profile },
    planner: { type: mongoose.Schema.Types.Mixed, default: initialPlannerState },
  },
  { timestamps: true }
);
const User = mongoose.model("StudyFlowUser", userSchema);
const memoryUsers = new Map();
const memoryNotes = new Map();

const createMemoryId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const normalizeMemoryUser = (user) => {
  const base = user && typeof user === "object" ? user : {};
  const profile = cleanProfile(base.profile || base.planner?.profile, base.email ? base.email.split("@")[0] || "Student" : "Student");
  const planner = base.planner && typeof base.planner === "object"
    ? cleanPlannerState(base.planner, profile)
    : { profile, data: { subjects: [], tasks: [], exams: [], studySessions: [], activityLog: [] }, dashboardPrefs: { stats: ["streak", "today", "tasks", "subjects"], sections: { tasks: true, exams: true, subjects: true } }, flashcardReviews: {} };

  return {
    ...base,
    _id: String(base._id || base.id || createMemoryId()),
    email: typeof base.email === "string" ? base.email : "",
    isGuest: Boolean(base.isGuest),
    passwordHash: typeof base.passwordHash === "string" ? base.passwordHash : null,
    recoveryCodeHash: typeof base.recoveryCodeHash === "string" ? base.recoveryCodeHash : null,
    sessionVersion: Number(base.sessionVersion) || 0,
    profile,
    planner,
    createdAt: base.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const saveMemoryUser = (user) => {
  const normalized = normalizeMemoryUser(user);
  memoryUsers.set(String(normalized._id), normalized);
  localState.users = Array.from(memoryUsers.values());
  persistLocalState();
  return normalized;
};

const getMemoryUserById = (id) => {
  if (!id) return null;
  const user = memoryUsers.get(String(id));
  return user ? normalizeMemoryUser(user) : null;
};

const getMemoryUserByEmail = (email) => {
  const target = normalizeEmail(email);
  for (const user of memoryUsers.values()) {
    if (normalizeEmail(user.email) === target) return normalizeMemoryUser(user);
  }
  return null;
};

const cleanProfile = (input, fallbackName = "Student") => {
  const source = input && typeof input === "object" ? input : {};
  const cleanText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return {
    name: cleanText(source.name, 80) || fallbackName,
    studentClass: cleanText(source.studentClass, 120),
    course: cleanText(source.course, 160),
    goal: cleanText(source.goal, 500),
    dailyGoal: Number.isFinite(Number(source.dailyGoal)) ? Math.max(10, Math.min(1440, Number(source.dailyGoal))) : 60,
    streak: Number.isFinite(Number(source.streak)) ? Math.max(0, Math.floor(Number(source.streak))) : 0,
    lastStudyDate: cleanText(source.lastStudyDate, 10),
    onboardingComplete: source.onboardingComplete === true,
  };
};

const cleanPlannerState = (input, profile) => {
  const source = input && typeof input === "object" ? input : {};
  const sourceData = source.data && typeof source.data === "object" ? source.data : {};
  const data = {
    subjects: Array.isArray(sourceData.subjects) ? sourceData.subjects.filter((item) => item && typeof item === "object").slice(0, 500) : [],
    tasks: Array.isArray(sourceData.tasks) ? sourceData.tasks.filter((item) => item && typeof item === "object").slice(0, 1000) : [],
    exams: Array.isArray(sourceData.exams) ? sourceData.exams.filter((item) => item && typeof item === "object").slice(0, 500) : [],
    studySessions: Array.isArray(sourceData.studySessions) ? sourceData.studySessions.filter((item) => item && typeof item === "object").slice(-5000) : [],
    activityLog: Array.isArray(sourceData.activityLog) ? sourceData.activityLog.filter((item) => item && typeof item === "object").slice(0, 5000).map((item) => ({
      id: typeof item.id === "string" ? item.id.slice(0, 120) : "",
      kind: typeof item.kind === "string" ? item.kind.slice(0, 40) : "activity",
      title: typeof item.title === "string" ? item.title.slice(0, 300) : "Activity",
      details: typeof item.details === "string" ? item.details.slice(0, 500) : "",
      entityId: typeof item.entityId === "string" ? item.entityId.slice(0, 120) : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt.slice(0, 40) : new Date().toISOString(),
    })) : [],
  };
  const preferences = source.dashboardPrefs && typeof source.dashboardPrefs === "object" ? source.dashboardPrefs : {};
  const sections = preferences.sections && typeof preferences.sections === "object" ? preferences.sections : {};
  const review = source.flashcardReviews && typeof source.flashcardReviews === "object" ? source.flashcardReviews : {};

  return {
    profile,
    data,
    dashboardPrefs: {
      stats: Array.isArray(preferences.stats)
        ? preferences.stats.filter((item) => ["streak", "today", "tasks", "subjects"].includes(item)).slice(0, 4)
        : ["streak", "today", "tasks", "subjects"],
      sections: {
        tasks: sections.tasks !== false,
        exams: sections.exams !== false,
        subjects: sections.subjects !== false,
      },
    },
    flashcardReviews: Object.fromEntries(
      Object.entries(review).slice(0, 2000).filter(([key, value]) =>
        /^[a-f\d]{24}$/i.test(key) &&
        value &&
        typeof value === "object" &&
        typeof value.dueOn === "string" &&
        typeof value.reviewedOn === "string" &&
        ["Again", "Hard", "Good", "Easy"].includes(value.rating)
      )
    ),
  };
};

for (const savedUser of localState.users) {
  const user = normalizeMemoryUser(savedUser);
  memoryUsers.set(String(user._id), user);
}
for (const note of localState.notes) {
  if (note && typeof note === "object" && note._id) memoryNotes.set(String(note._id), note);
}

const sendAccount = (res, user, extra = {}) => {
  res.json({
    success: true,
    account: {
      id: String(user._id),
      isGuest: Boolean(user.isGuest),
      email: user.isGuest ? null : user.email,
    },
    profile: user.profile,
    planner: user.planner || initialPlannerState(),
    ...extra,
  });
};

const regenerateSession = (req, userId, sessionVersion = 0) => new Promise((resolve, reject) => {
  req.session.regenerate((regenerateError) => {
    if (regenerateError) return reject(regenerateError);
    req.session.userId = String(userId);
    req.session.sessionVersion = sessionVersion;
    req.session.save((saveError) => saveError ? reject(saveError) : resolve());
  });
});

const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  const localRoutes = [
    "/api/auth/guest",
    "/api/auth/register",
    "/api/auth/recover",
    "/api/auth/recovery-code",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/planner",
  ];
  if (localRoutes.includes(req.path)) return next();
  if (req.path.startsWith("/api/notes")) return next();
  return res.status(503).json({ success: false, error: "Account storage is unavailable until MongoDB is connected." });
};

const normalizeEmail = (email) => typeof email === "string" ? email.trim().toLowerCase() : "";
const isValidEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const passwordHash = async (password) => {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
};
const createRecoveryCode = () => crypto.randomBytes(24).toString("hex");
const normalizeRecoveryCode = (code) => typeof code === "string"
  ? code.replace(/[\s-]/g, "").toLowerCase()
  : "";
const verifyPassword = async (password, storedHash) => {
  const match = typeof storedHash === "string" && storedHash.match(/^scrypt\$([a-f\d]{32})\$([a-f\d]{128})$/i);
  const salt = match ? Buffer.from(match[1], "hex") : Buffer.alloc(16);
  const expected = match ? Buffer.from(match[2], "hex") : Buffer.alloc(64);
  const actual = await scrypt(password, salt, 64);
  return Boolean(match && crypto.timingSafeEqual(actual, expected));
};

const requireAuth = async (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, error: "A private browser planner session is required." });
  }
  try {
    let user = null;
    if (mongoose.connection.readyState === 1) {
      user = await User.findById(req.session.userId);
    } else {
      user = getMemoryUserById(req.session.userId);
    }
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ success: false, error: "Your private browser planner session has expired." });
    }
    req.user = user;
    if (mongoose.connection.readyState === 1 && (req.session.sessionVersion || 0) !== (user.sessionVersion || 0)) {
      req.session.destroy(() => {});
      return res.status(401).json({ success: false, error: "Your private browser planner session has expired." });
    }
    next();
  } catch (error) {
    next(error);
  }
};

const guestCreationAttempts = new Map();
const accountAuthAttempts = new Map();

const limitAccountAuth = (req, res, next) => {
  const now = Date.now();
  const address = req.ip || req.socket.remoteAddress || "unknown";
  for (const [key, attempt] of accountAuthAttempts) {
    if (attempt.resetAt <= now) accountAuthAttempts.delete(key);
  }
  const attempt = accountAuthAttempts.get(address);
  if (attempt && attempt.count >= 15 && attempt.resetAt > now) {
    res.set("Retry-After", String(Math.ceil((attempt.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, error: "Too many sign-in attempts. Please try again later." });
  }
  accountAuthAttempts.set(address, attempt && attempt.resetAt > now
    ? { count: attempt.count + 1, resetAt: attempt.resetAt }
    : { count: 1, resetAt: now + 15 * 60 * 1000 });
  next();
};

app.post("/api/auth/guest", requireDatabase, async (req, res, next) => {
  if (req.session?.userId) {
    try {
      const existingUser = await User.findById(req.session.userId);
      if (existingUser && (req.session.sessionVersion || 0) === (existingUser.sessionVersion || 0)) {
        req.user = existingUser;
        return sendAccount(res, existingUser);
      }
      req.session.destroy((error) => {
        if (error) return next(error);
        createGuestAccount(req, res);
      });
      return;
    } catch (error) {
      return next(error);
    }
  }
  return createGuestAccount(req, res);
});

async function createGuestAccount(req, res) {
  const now = Date.now();
  const address = req.ip || req.socket.remoteAddress || "unknown";
  const attempt = guestCreationAttempts.get(address);
  for (const [key, value] of guestCreationAttempts) {
    if (value.resetAt <= now) guestCreationAttempts.delete(key);
  }
  if (attempt && attempt.resetAt > now && attempt.count >= 30) {
    res.set("Retry-After", String(Math.ceil((attempt.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, error: "Too many new browser planners. Please try again later." });
  }
  guestCreationAttempts.set(address, attempt && attempt.resetAt > now
    ? { count: attempt.count + 1, resetAt: attempt.resetAt }
    : { count: 1, resetAt: now + 60 * 60 * 1000 });
  try {
    const legacyProfile = req.body?.legacyPlanner?.profile;
    const profile = cleanProfile(legacyProfile);
    const planner = cleanPlannerState(req.body?.legacyPlanner, profile);
    const guestId = crypto.randomBytes(24).toString("hex");
    if (mongoose.connection.readyState !== 1) {
      const user = saveMemoryUser({
        _id: guestId,
        email: `guest-${guestId}@studyflow.invalid`,
        isGuest: true,
        profile,
        planner,
        sessionVersion: 0,
      });
      await regenerateSession(req, user._id, user.sessionVersion || 0);
      return sendAccount(res, user);
    }
    const user = await User.create({
      email: `guest-${guestId}@studyflow.invalid`,
      isGuest: true,
      profile,
      planner,
    });
    await regenerateSession(req, user._id, user.sessionVersion || 0);
    return sendAccount(res, user);
  } catch (error) {
    console.error("Could not create a private browser planner:", error.message);
    return res.status(500).json({ success: false, error: "Could not open your private study planner. Please try again." });
  }
}

app.post("/api/auth/register", requireDatabase, limitAccountAuth, async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const studentDetails = {
    name: typeof req.body?.name === "string" ? req.body.name.trim() : "",
    studentClass: typeof req.body?.studentClass === "string" ? req.body.studentClass.trim() : "",
    course: typeof req.body?.course === "string" ? req.body.course.trim() : "",
  };
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: "Enter a valid email address." });
  }
  if (password.length < 12 || password.length > 128) {
    return res.status(400).json({ success: false, error: "Use a password between 12 and 128 characters." });
  }
  if (!studentDetails.name || studentDetails.name.length > 80 ||
      !studentDetails.studentClass || studentDetails.studentClass.length > 120 ||
      !studentDetails.course || studentDetails.course.length > 160) {
    return res.status(400).json({ success: false, error: "Enter your name, standard, and course." });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      const existing = getMemoryUserByEmail(email);
      if (existing) {
        return res.status(409).json({ success: false, error: "An account with this email already exists. Please log in." });
      }
      const currentUser = req.session?.userId ? getMemoryUserById(req.session.userId) : null;
      if (currentUser && !currentUser.isGuest) {
        return res.status(409).json({ success: false, error: "Sign out before creating a different account." });
      }
      const hashedPassword = await passwordHash(password);
      const recoveryCode = createRecoveryCode();
      const hashedRecoveryCode = await passwordHash(recoveryCode);
      const profile = cleanProfile({ ...currentUser?.profile, ...studentDetails, onboardingComplete: true }, studentDetails.name || "Student");
      const planner = cleanPlannerState(currentUser?.planner || initialPlannerState(), profile);
      const user = saveMemoryUser({
        ...currentUser,
        _id: currentUser?._id || createMemoryId(),
        email,
        isGuest: false,
        passwordHash: hashedPassword,
        recoveryCodeHash: hashedRecoveryCode,
        sessionVersion: currentUser?.sessionVersion || 0,
        profile,
        planner,
      });
      await regenerateSession(req, user._id, user.sessionVersion || 0);
      return sendAccount(res, user, { recoveryCode });
    }
    if (await User.exists({ email })) {
      return res.status(409).json({ success: false, error: "An account with this email already exists. Please log in." });
    }

    const currentUser = req.session?.userId ? await User.findById(req.session.userId) : null;
    if (currentUser && !currentUser.isGuest) {
      return res.status(409).json({ success: false, error: "Sign out before creating a different account." });
    }

    const hashedPassword = await passwordHash(password);
    const recoveryCode = createRecoveryCode();
    const hashedRecoveryCode = await passwordHash(recoveryCode);
    const user = currentUser || new User({
      email,
      isGuest: false,
      profile: initialPlannerState().profile,
      planner: initialPlannerState(),
    });
    user.email = email;
    user.passwordHash = hashedPassword;
    user.recoveryCodeHash = hashedRecoveryCode;
    user.isGuest = false;
    const profile = cleanProfile(user.profile);
    Object.assign(profile, studentDetails, { onboardingComplete: true });
    user.profile = profile;
    const planner = cleanPlannerState(user.planner, profile);
    user.planner = planner;
    await user.save();
    await regenerateSession(req, user._id, user.sessionVersion || 0);
    return sendAccount(res, user, { recoveryCode });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: "An account with this email already exists. Please log in." });
    }
    console.error("Account registration failed:", error.message);
    return res.status(500).json({ success: false, error: "Could not create your account. Please try again." });
  }
});

app.post("/api/auth/recovery-code", requireDatabase, requireAuth, async (req, res) => {
  if (req.user.isGuest) {
    return res.status(403).json({ success: false, error: "Create an account with an email and password before setting up password recovery." });
  }

  try {
    const recoveryCode = createRecoveryCode();
    const hashedRecoveryCode = await passwordHash(recoveryCode);
    if (mongoose.connection.readyState !== 1) {
      const user = saveMemoryUser({ ...req.user, recoveryCodeHash: hashedRecoveryCode, updatedAt: new Date().toISOString() });
      return res.json({ success: true, recoveryCode });
    }
    await User.updateOne({ _id: req.user._id }, { $set: { recoveryCodeHash: hashedRecoveryCode } });
    return res.json({ success: true, recoveryCode });
  } catch (error) {
    console.error("Recovery code generation failed:", error.message);
    return res.status(500).json({ success: false, error: "Could not create a recovery code. Please try again." });
  }
});

app.post("/api/auth/recover", requireDatabase, limitAccountAuth, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const recoveryCode = normalizeRecoveryCode(req.body?.recoveryCode);
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!isValidEmail(email) || !/^[a-f\d]{48}$/.test(recoveryCode)) {
    return res.status(400).json({ success: false, error: "Check your email and recovery code, then try again." });
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ success: false, error: "Use a new password between 12 and 128 characters." });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      const user = getMemoryUserByEmail(email);
      const recoveryCodeMatches = user && await verifyPassword(recoveryCode, user.recoveryCodeHash);
      if (!user || !recoveryCodeMatches) {
        return res.status(400).json({ success: false, error: "Email or recovery code is incorrect." });
      }
      const hashedPassword = await passwordHash(newPassword);
      const refreshedUser = saveMemoryUser({ ...user, passwordHash: hashedPassword, recoveryCodeHash: null, sessionVersion: (user.sessionVersion || 0) + 1, updatedAt: new Date().toISOString() });
      await regenerateSession(req, refreshedUser._id, refreshedUser.sessionVersion || 0);
      return sendAccount(res, refreshedUser);
    }
    const user = await User.findOne({ email, isGuest: false }).select("+recoveryCodeHash");
    const recoveryCodeMatches = await verifyPassword(recoveryCode, user?.recoveryCodeHash);
    if (!user || !recoveryCodeMatches) {
      return res.status(400).json({ success: false, error: "Email or recovery code is incorrect." });
    }

    const hashedPassword = await passwordHash(newPassword);
    const result = await User.updateOne(
      { _id: user._id, recoveryCodeHash: user.recoveryCodeHash, sessionVersion: user.sessionVersion },
      {
        $set: { passwordHash: hashedPassword },
        $unset: { recoveryCodeHash: "" },
        $inc: { sessionVersion: 1 },
      }
    );
    if (!result.modifiedCount) {
      return res.status(400).json({ success: false, error: "Email or recovery code is incorrect." });
    }

    user.passwordHash = hashedPassword;
    user.recoveryCodeHash = undefined;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    await regenerateSession(req, user._id, user.sessionVersion);
    return sendAccount(res, user);
  } catch (error) {
    console.error("Password recovery failed:", error.message);
    return res.status(500).json({ success: false, error: "Could not reset your password. Please try again." });
  }
});

app.post("/api/auth/login", requireDatabase, limitAccountAuth, async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!isValidEmail(email) || password.length === 0 || password.length > 128) {
    return res.status(400).json({ success: false, error: "Enter your email and password." });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      const user = getMemoryUserByEmail(email);
      const passwordMatches = user && await verifyPassword(password, user.passwordHash);
      if (!user || !passwordMatches) {
        return res.status(401).json({ success: false, error: "Email or password is incorrect." });
      }
      await regenerateSession(req, user._id, user.sessionVersion || 0);
      return sendAccount(res, user);
    }
    const user = await User.findOne({ email, isGuest: false }).select("+passwordHash");
    const passwordMatches = await verifyPassword(password, user?.passwordHash);
    if (!user || !passwordMatches) {
      return res.status(401).json({ success: false, error: "Email or password is incorrect." });
    }
    await regenerateSession(req, user._id, user.sessionVersion || 0);
    return sendAccount(res, user);
  } catch (error) {
    console.error("Account login failed:", error.message);
    return res.status(500).json({ success: false, error: "Could not log in. Please try again." });
  }
});

app.post("/api/auth/logout", (req, res, next) => {
  if (!req.session) return res.json({ success: true });
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return res.json({ success: true });
  });
});

app.get("/api/auth/me", requireDatabase, requireAuth, (req, res) => sendAccount(res, req.user));
app.get("/api/health", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  return res.status(200).json({
    success: true,
    database: databaseReady ? "connected" : "local-disk",
    aiConfigured: Boolean(GEMINI_API_KEY),
  });
});
app.all("/api/auth/{*path}", (req, res) => {
  res.status(404).json({ success: false, error: "Account route not found." });
});

app.get("/api/planner", requireDatabase, requireAuth, (req, res) => {
  res.json({ success: true, planner: req.user.planner || initialPlannerState() });
});

app.put("/api/planner", requireDatabase, requireAuth, async (req, res) => {
  try {
    const profile = cleanProfile(req.body.profile, req.user.profile?.name || "Student");
    const planner = cleanPlannerState(req.body, profile);
    if (mongoose.connection.readyState !== 1) {
      const user = saveMemoryUser({ ...req.user, profile, planner, updatedAt: new Date().toISOString() });
      req.user = user;
      return res.json({ success: true });
    }
    await User.updateOne({ _id: req.user._id }, { $set: { profile, planner } });
    return res.json({ success: true });
  } catch (error) {
    console.error("Planner sync failed:", error.message);
    return res.status(500).json({ success: false, error: "Could not sync your planner. Keep this tab open and retry." });
  }
});

// Helper function to build system prompt context
const buildSystemPrompt = (prompt, context, history = []) => {
  const studentContext =
    context && typeof context === "object"
      ? JSON.stringify(context, null, 2)
      : "No student information available.";
  const conversation = history
    .filter(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.text === "string"
    )
    .slice(-10)
    .map((message) => `${message.role === "user" ? "Student" : "StudyFlow AI"}: ${message.text.slice(0, 4000)}`)
    .join("\n");

  return `
You are StudyFlow AI, an intelligent personal study assistant.

You help students with:
- Studying
- Time management
- Exam preparation
- Subjects
- Assignments
- Deadlines
- Revision
- Notes
- Productivity
- Pomodoro study sessions
- Study planning

IMPORTANT RULES:
1. Answer the student's actual question.
2. Do not give the same fixed response every time.
3. Understand the meaning of the question.
4. Give an answer appropriate to the request.
5. Use simple language.
6. For exam questions, give structured answers.
7. Use headings, bullet points and examples when useful.
8. For study plans, use the available student information.
9. Never pretend you changed something in the app.
10. If information is missing, say what is needed.
11. Be friendly, helpful and professional.

STUDENT INFORMATION:
${studentContext}

RECENT CONVERSATION:
${conversation || "No previous messages."}

STUDENT QUESTION:
${prompt.trim()}

Answer the student's question naturally and specifically.
`;
};

// --------------------------------------------------
// Main AI Chat Endpoint
// --------------------------------------------------

app.post("/api/ai", requireAuth, async (req, res) => {
  try {
    const { prompt, context, history } = req.body;

    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 8000) {
      return res.status(400).json({
        success: false,
        error: "Enter a question of up to 8,000 characters.",
      });
    }

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing from .env");
      return res.status(500).json({
        success: false,
        error: "AI service is not configured.",
      });
    }

    const finalPrompt = buildSystemPrompt(prompt, context, Array.isArray(history) ? history : []);

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(GEMINI_MODEL) +
      ":generateContent?key=" +
      encodeURIComponent(GEMINI_API_KEY);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: finalPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1400,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data?.error?.message || "Unknown API error");
      return res.status(502).json({
        success: false,
        error: data?.error?.message || "Gemini could not generate a response.",
      });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      console.error("Empty Gemini response received.");
      return res.status(502).json({
        success: false,
        error: "Gemini returned an empty response.",
      });
    }

    return res.json({
      success: true,
      answer,
    });
  } catch (error) {
    console.error("STUDYFLOW AI SERVER ERROR:", error.message);
    return res.status(500).json({
      success: false,
      error: "Unable to connect to StudyFlow AI.",
    });
  }
});

app.post("/api/ai/quiz", requireAuth, async (req, res) => {
  try {
    const { topic, context } = req.body;
    if (typeof topic !== "string" || !topic.trim() || topic.length > 300) {
      return res.status(400).json({
        success: false,
        error: "Enter a quiz topic of up to 300 characters.",
      });
    }

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing from backend/.env");
      return res.status(500).json({
        success: false,
        error: "AI service is not configured. Add GEMINI_API_KEY to frontend/backend/.env and restart the server.",
      });
    }

    const finalPrompt = `Create exactly 5 concise multiple-choice study questions about "${topic.trim()}". Use the student's context when relevant: ${JSON.stringify(context || {})}. Each question must have exactly four distinct options, one correct answer as an integer index from 0 to 3, and a brief explanation. Return only compact JSON with this shape: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}. Do not include markdown or other text.`;
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(GEMINI_MODEL) +
      ":generateContent?key=" +
      encodeURIComponent(GEMINI_API_KEY);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1400,
          responseMimeType: "application/json",
        },
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini quiz API error:", data?.error?.message || "Unknown API error");
      return res.status(502).json({
        success: false,
        error: data?.error?.message || "Gemini could not generate a quiz.",
      });
    }

    const responseText = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("");
    const quiz = responseText ? JSON.parse(responseText) : null;
    const questions = quiz?.questions;
    const validQuestions =
      Array.isArray(questions) &&
      questions.length === 5 &&
      questions.every(
        (question) =>
          typeof question.question === "string" &&
          Array.isArray(question.options) &&
          question.options.length === 4 &&
          question.options.every((option) => typeof option === "string") &&
          Number.isInteger(question.answer) &&
          question.answer >= 0 &&
          question.answer < question.options.length &&
          typeof question.explanation === "string"
      );

    if (!validQuestions) {
      console.error("Gemini returned an invalid quiz response.");
      return res.status(502).json({
        success: false,
        error: "The AI returned an incomplete quiz. Please try again.",
      });
    }

    return res.json({ success: true, questions });
  } catch (error) {
    console.error("StudyFlow AI quiz error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Unable to generate a quiz right now. Please try again.",
    });
  }
});

// --------------------------------------------------
// Create Note
// --------------------------------------------------

app.post("/api/notes", requireDatabase, requireAuth, async (req, res) => {
  try {
    const { prompt, content, subject, category, tags } = req.body;

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: "Note content is required.",
      });
    }

    if (mongoose.connection.readyState !== 1) {
      const note = {
        _id: createMemoryId(),
        userId: req.user._id,
        prompt: typeof prompt === "string" ? prompt.trim() : "",
        content: content.trim(),
        subject: typeof subject === "string" ? subject.trim() : "",
        category: typeof category === "string" && category.trim() ? category.trim().slice(0, 40) : "General",
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryNotes.set(note._id, note);
      localState.notes = Array.from(memoryNotes.values());
      persistLocalState();
      return res.status(201).json({ success: true, note });
    }

    const note = new Note({
      userId: req.user._id,
      prompt: typeof prompt === "string" ? prompt.trim() : "",
      content: content.trim(),
      subject: typeof subject === "string" ? subject.trim() : "",
      category: typeof category === "string" && category.trim() ? category.trim().slice(0, 40) : "General",
      tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [],
    });

    await note.save();

    return res.status(201).json({
      success: true,
      note,
    });
  } catch (error) {
    console.error("Save Note Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to save note.",
    });
  }
});

// --------------------------------------------------
// Update Note
// --------------------------------------------------

app.put("/api/notes/:id", requireDatabase, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { prompt, content, subject, category, tags } = req.body;

    if (!id || typeof id !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid note ID.",
      });
    }

    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 160) {
      return res.status(400).json({
        success: false,
        error: "A note title of up to 160 characters is required.",
      });
    }

    if (typeof content !== "string" || !content.trim() || content.length > 20000) {
      return res.status(400).json({
        success: false,
        error: "Note content of up to 20,000 characters is required.",
      });
    }

    if (mongoose.connection.readyState !== 1) {
      const note = memoryNotes.get(id);
      if (!note || String(note.userId) !== String(req.user._id)) {
        return res.status(404).json({
          success: false,
          error: "Note not found.",
        });
      }
      const updatedNote = {
        ...note,
        prompt: prompt.trim(),
        content: content.trim(),
        subject: typeof subject === "string" ? subject.trim() : "",
        category: typeof category === "string" && category.trim() ? category.trim().slice(0, 40) : "General",
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [],
        updatedAt: new Date().toISOString(),
      };
      memoryNotes.set(id, updatedNote);
      localState.notes = Array.from(memoryNotes.values());
      persistLocalState();
      return res.json({ success: true, note: updatedNote });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid note ID.",
      });
    }

    const note = await Note.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      {
        prompt: prompt.trim(),
        content: content.trim(),
        subject: typeof subject === "string" ? subject.trim() : "",
        category: typeof category === "string" && category.trim() ? category.trim().slice(0, 40) : "General",
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [],
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!note) {
      return res.status(404).json({
        success: false,
        error: "Note not found.",
      });
    }

    return res.json({ success: true, note });
  } catch (error) {
    console.error("Update Note Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update note.",
    });
  }
});

// --------------------------------------------------
// Get All Notes
// --------------------------------------------------

app.get("/api/notes", requireDatabase, requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const notes = Array.from(memoryNotes.values())
        .filter((note) => note.userId === req.user._id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({ success: true, notes });
    }
    const notes = await Note.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();

    return res.json({
      success: true,
      notes,
    });
  } catch (error) {
    console.error("Fetch Notes Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch notes.",
    });
  }
});

// --------------------------------------------------
// Delete Note
// --------------------------------------------------

app.delete("/api/notes/:id", requireDatabase, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid note ID.",
      });
    }

    if (mongoose.connection.readyState !== 1) {
      const note = memoryNotes.get(id);
      if (!note || String(note.userId) !== String(req.user._id)) {
        return res.status(404).json({
          success: false,
          error: "Note not found.",
        });
      }
      memoryNotes.delete(id);
      localState.notes = Array.from(memoryNotes.values());
      persistLocalState();
      return res.json({
        success: true,
        message: "Note deleted successfully.",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid note ID.",
      });
    }

    const deletedNote = await Note.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!deletedNote) {
      return res.status(404).json({
        success: false,
        error: "Note not found.",
      });
    }

    return res.json({
      success: true,
      message: "Note deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Note Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to delete note.",
    });
  }
});

app.use((error, req, res, next) => {
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "Request body must contain valid JSON." });
  }
  return next(error);
});

// --------------------------------------------------
// Serve React Frontend (Static Files)
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "../../dist")));

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "../../dist/index.html"));
});

// --------------------------------------------------
// Start Server
// --------------------------------------------------

async function startServer() {
  let databaseConnected = false;
  if (MONGODB_URI) {
    try {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      await User.collection.updateMany(
        {},
        { $unset: { passwordResetTokenHash: "", passwordResetExpiresAt: "" } }
      );
      databaseConnected = true;
      console.log("MongoDB connected successfully.");
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
      if (process.env.NODE_ENV === "production") throw error;
      console.warn("Starting the development backend with local in-memory planner storage.");
    }
  } else {
    console.warn("MONGODB_URI is not configured. Starting with local in-memory planner storage.");
  }

  app.listen(PORT, () => {
    console.log("");
    console.log("====================================");
    console.log("       STUDYFLOW AI SERVER          ");
    console.log("====================================");
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`Gemini configured: ${Boolean(GEMINI_API_KEY)}`);
    console.log(`Gemini model: ${GEMINI_MODEL}`);
    console.log(`Planner storage: ${databaseConnected ? "MongoDB" : "local disk"}`);
    console.log("Planner access: email and password accounts");
    console.log("====================================");
    console.log("");
  });
}

startServer();