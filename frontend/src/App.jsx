import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
  ============================================================
  STUDYFLOW
  Complete single-file React/Vite frontend prototype
  ============================================================
*/

const initialData = {
  subjects: [],
  tasks: [],
  exams: [],
  studySessions: [],
};

const initialProfile = {
  name: "",
  studentClass: "",
  course: "",
  goal: "",
  dailyGoal: 60,
  streak: 0,
  lastStudyDate: "",
  onboardingComplete: false,
};

const initialDashboardPrefs = {
  stats: ["streak", "today", "tasks", "subjects"],
  sections: { tasks: true, exams: true, subjects: true },
};

const studyThemes = [
  { id: "violet", name: "Violet", primary: "#a78bfa", secondary: "#67e8d2" },
  { id: "ocean", name: "Ocean", primary: "#38bdf8", secondary: "#5eead4" },
  { id: "rose", name: "Rose", primary: "#fb7185", secondary: "#c084fc" },
  { id: "amber", name: "Amber", primary: "#fbbf24", secondary: "#fb923c" },
];
const themeStorageKey = "studyFlowTheme";
const motivationalQuotes = [
  "A little progress each day adds up to big results.",
  "You do not have to be perfect to make meaningful progress.",
  "The focus you give today is a gift to your future self.",
  "Start where you are. Use what you have. Do what you can.",
  "Every problem you practice is one you are better prepared to solve.",
  "Small, steady steps can take you further than a perfect plan.",
];

function getSavedTheme() {
  try {
    const savedTheme = window.localStorage.getItem(themeStorageKey);
    return studyThemes.some((theme) => theme.id === savedTheme) ? savedTheme : "violet";
  } catch (error) {
    console.warn("Could not read the saved StudyFlow theme.", error);
    return "violet";
  }
}

const difficultyInfo = {
  Easy: {
    icon: "🟢",
    color: "#34d399",
    background: "rgba(52,211,153,.12)",
    description: "Comfortable",
  },
  Medium: {
    icon: "🟡",
    color: "#fbbf24",
    background: "rgba(251,191,36,.12)",
    description: "Needs practice",
  },
  Hard: {
    icon: "🔴",
    color: "#fb7185",
    background: "rgba(251,113,133,.12)",
    description: "Needs more focus",
  },
};

const priorityInfo = {
  High: {
    icon: "🔴",
    className: "high",
  },
  Medium: {
    icon: "🟡",
    className: "medium",
  },
  Low: {
    icon: "🟢",
    className: "low",
  },
};

/* -----------------------------------------------------------
   HELPERS
----------------------------------------------------------- */

function readLegacyLocalValue(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Could not read legacy planner data (${key}).`, error);
    return fallback;
  }
}

function getLegacyPlanner() {
  return {
    profile: readLegacyLocalValue("studyFlowProfile", initialProfile),
    data: readLegacyLocalValue("studyFlowDataV2", initialData),
    dashboardPrefs: readLegacyLocalValue("studyFlowDashboardPrefs", initialDashboardPrefs),
    flashcardReviews: readLegacyLocalValue("studyFlowFlashcardReviews", {}),
  };
}

function saveLegacyPlanner(profile, data, dashboardPrefs, flashcardReviews) {
  const payload = {
    profile: profile || initialProfile,
    data: data || initialData,
    dashboardPrefs: dashboardPrefs || initialDashboardPrefs,
    flashcardReviews: flashcardReviews || {},
  };
  try {
    localStorage.setItem("studyFlowProfile", JSON.stringify(payload.profile));
    localStorage.setItem("studyFlowDataV2", JSON.stringify(payload.data));
    localStorage.setItem("studyFlowDashboardPrefs", JSON.stringify(payload.dashboardPrefs));
    localStorage.setItem("studyFlowFlashcardReviews", JSON.stringify(payload.flashcardReviews));
  } catch (error) {
    console.warn("Could not save the local planner backup.", error);
  }
  return payload;
}

function createLocalFallbackPlanner(email = null, profileOverrides = {}) {
  const legacy = getLegacyPlanner();
  const nextProfile = {
    ...initialProfile,
    ...legacy.profile,
    ...profileOverrides,
    name: profileOverrides.name || legacy.profile?.name || "Student",
    email: undefined,
  };
  const planner = {
    profile: nextProfile,
    data: legacy.data,
    dashboardPrefs: legacy.dashboardPrefs,
    flashcardReviews: legacy.flashcardReviews,
  };
  return {
    account: {
      id: `local-${Date.now()}`,
      isGuest: email === null,
      email,
    },
    profile: nextProfile,
    planner,
  };
}

function clearLegacyLocalValues() {
  let cleared = true;
  ["studyFlowProfile", "studyFlowDataV2", "studyFlowDashboardPrefs", "studyFlowFlashcardReviews"]
    .forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        cleared = false;
        console.warn(`Could not clear legacy local planner data (${key}).`, error);
      }
    });
  return cleared;
}

function getDifficultyInfo(level) {
  return difficultyInfo[level] || difficultyInfo.Medium;
}

function getPriorityInfo(priority) {
  return priorityInfo[priority] || priorityInfo.Medium;
}

function formatDate(date) {
  if (!date) return "No due date";
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isToday(date) {
  if (!date) return false;
  const today = new Date();
  const d = new Date(date + "T00:00:00");
  return (
    today.getFullYear() === d.getFullYear() &&
    today.getMonth() === d.getMonth() &&
    today.getDate() === d.getDate()
  );
}

function isPast(date) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date + "T00:00:00");
  return d < today;
}

function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date + "T00:00:00");
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function getTodayKey() {
  // Local calendar date. toISOString() is UTC and shifts the day for IST users
  // between 12:00 AM and 5:30 AM.
  return getLocalDateKey(new Date());
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function getMinutesForDate(sessions, key) {
  return (sessions || [])
    .filter((session) => session?.date === key)
    .reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
}

function getSessionTypeLabel(session) {
  const value = typeof session?.type === "string" ? session.type.trim() : "";
  return value || "Focus";
}

function getWeekData(sessions) {
  const today = new Date();
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftLocalDate(today, -i);
    const key = getLocalDateKey(date);
    result.push({
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      total: getMinutesForDate(sessions, key),
      isToday: i === 0,
    });
  }
  return result;
}

// A streak only counts if the student studied today or yesterday.
function getEffectiveStreak(profile) {
  const streak = Number(profile?.streak) || 0;
  if (!streak || !profile?.lastStudyDate) return 0;
  const today = new Date();
  if (profile.lastStudyDate === getLocalDateKey(today)) return streak;
  if (profile.lastStudyDate === getLocalDateKey(shiftLocalDate(today, -1))) return streak;
  return 0;
}

function getNextMilestone(streak) {
  return [3, 7, 14, 30, 60, 100, 180, 365].find((m) => m > streak) || streak + 100;
}

function getPasswordStrength(password) {
  if (!password) return { score: 0, label: "" };
  if (password.length < 12) return { score: 0, label: "Too short" };
  let score = 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return { score, label: ["", "Fair", "Good", "Strong", "Excellent"][score] };
}

const MAX_LOGIN_ATTEMPTS = 4;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const loginGuardKey = "studyFlowLoginGuard";

function readLoginGuard() {
  try {
    const guard = JSON.parse(window.localStorage.getItem(loginGuardKey) || "null");
    if (guard && guard.lockedUntil > Date.now()) {
      return { failed: MAX_LOGIN_ATTEMPTS, lockedUntil: Number(guard.lockedUntil) };
    }
    if (guard && !guard.lockedUntil && guard.failed > 0) {
      return { failed: Math.min(Number(guard.failed) || 0, MAX_LOGIN_ATTEMPTS - 1), lockedUntil: 0 };
    }
  } catch (error) {
    console.warn("Could not read the login attempt counter.", error);
  }
  return { failed: 0, lockedUntil: 0 };
}

function writeLoginGuard(guard) {
  try {
    window.localStorage.setItem(loginGuardKey, JSON.stringify(guard));
  } catch (error) {
    console.warn("Could not save the login attempt counter.", error);
  }
}

function getIndiaTimeGreeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  }).format(new Date()));

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftLocalDate(date, days) {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function calculateSubjectProgress(subjectId, tasks) {
  const subjectTasks = tasks.filter((task) => task.subjectId === subjectId);
  if (!subjectTasks.length) return 0;
  const completed = subjectTasks.filter((task) => task.done).length;
  return Math.round((completed / subjectTasks.length) * 100);
}

/* -----------------------------------------------------------
   STYLES
----------------------------------------------------------- */

const styles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #070914; color: #eef2ff; letter-spacing: -.01em; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
h1, h2, h3, h4, .brand, .stat-value, .card-title, .timer-face, .goal-number, .profile-avatar { font-family: "Manrope", sans-serif; }

.sf-app { min-height: 100vh; background: radial-gradient(circle at 10% 10%, rgba(124,92,255,.18), transparent 30%), radial-gradient(circle at 90% 20%, rgba(34,211,238,.12), transparent 28%), #070914; }
.sf-app.light { background: radial-gradient(circle at 10% 10%, rgba(124,92,255,.10), transparent 30%), #f5f7ff; color: #172033; }
.sf-app.light .panel, .sf-app.light .topbar, .sf-app.light .sidebar { background: rgba(255,255,255,.86); border-color: #e2e6f3; }
.sf-app.light .muted { color: #68738a; }
.sf-app.light input, .sf-app.light select, .sf-app.light textarea { background: white; color: #172033; border-color: #dce1ee; }
.sf-app.light .item { background: rgba(0,0,0,.02); border-color: #e2e6f3; }
.sf-app.light .nav-btn { color: #68738a; }
.sf-app.light .nav-btn.active { color: #172033; }
.sf-app.light .mobile-nav { background: rgba(255,255,255,.95); border-color: #dce1ee; }

.topbar { height: 72px; position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; background: rgba(7,9,20,.78); backdrop-filter: blur(20px); border-bottom: 1px solid #20263b; }
.brand { font-family: "Manrope", sans-serif; font-weight: 800; font-size: 21px; letter-spacing: -.5px; }
.brand span { color: #7c5cff; }
.top-actions { display: flex; gap: 9px; align-items: center; }

.icon-btn, .ghost-btn, .primary-btn, .danger-btn { border-radius: 12px; padding: 10px 14px; color: inherit; background: #151a2b; border: 1px solid #282f47; transition: .2s ease; }
.icon-btn:hover, .ghost-btn:hover, .primary-btn:hover, .danger-btn:hover { transform: translateY(-1px); }
.primary-btn { background: linear-gradient(135deg, #7c5cff, #4f8cff); border: 0; color: white; box-shadow: 0 10px 25px rgba(92,80,255,.25); }
.danger-btn { color: #ff8da1; }
.icon-btn { width: 42px; height: 42px; padding: 0; }

.shell {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: calc(100vh - 72px);
}
.sidebar {
  width: 245px;
  padding: 22px 14px;
  border-right: 1px solid #20263b;
  background: rgba(7,9,20,.55);
  backdrop-filter: blur(18px);
  position: sticky;
  left: 0;
  top: 72px;
  height: calc(100vh - 72px);
  overflow-y: auto;
  flex-shrink: 0;
}
.nav-section { font-size: 11px; color: #66708a; text-transform: uppercase; letter-spacing: 1.3px; padding: 14px 12px 7px; }
.nav-btn { display: flex; width: 100%; align-items: center; gap: 11px; padding: 11px 12px; margin: 3px 0; border: 0; border-radius: 11px; background: transparent; color: #9ca6bd; text-align: left; }
.nav-btn:hover { background: rgba(124,92,255,.08); }
.nav-btn.active { background: linear-gradient(90deg, rgba(124,92,255,.2), rgba(34,211,238,.05)); color: #fff; }

.content { flex: 1; padding: 30px; max-width: 1500px; margin: auto; width: 100%; }
.page-head { display: flex; justify-content: space-between; gap: 18px; align-items: end; margin-bottom: 24px; }
.eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #7c5cff; font-weight: 700; }
.title { font: 700 32px "Manrope", sans-serif; letter-spacing: -.045em; margin: 5px 0; }
.muted { color: #7e899f; }

.grid { display: grid; gap: 16px; }
.stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.two { grid-template-columns: 1.45fr 1fr; }
.three { grid-template-columns: repeat(3, 1fr); }
.panel {
  position: relative;
  background: linear-gradient(180deg, rgba(20, 24, 38, 0.8), rgba(12, 15, 25, 0.7));
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 18px 50px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.04);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.stat-value { font: 700 29px "Manrope", sans-serif; margin: 8px 0; }
.stat-label { color: #8993aa; font-size: 13px; }
.card-title { font: 700 17px "Manrope", sans-serif; letter-spacing: -.02em; margin: 0 0 15px; }

.progress { height: 8px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; }
.bar { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #7c5cff, #22d3ee); transition: width .4s ease; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.list { display: grid; gap: 10px; }
.item {
  padding: 13px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  background: rgba(255,255,255,0.025);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
  transition: transform .2s ease, border-color .2s ease, background-color .2s ease, box-shadow .2s ease;
}
.item:hover { transform: translateY(-1px); border-color: rgba(167,139,250,.32); }
.content-view { animation: page-enter .32s cubic-bezier(.2,.75,.25,1) both; }
.dashboard-stat-card, .note-card, .flashcard {
  transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
  background: linear-gradient(180deg, rgba(20,24,38,0.72), rgba(12,15,25,0.72));
}
.dashboard-stat-card:hover, .note-card:hover, .flashcard:hover { transform: translateY(-3px); border-color: rgba(167,139,250,.48); box-shadow: 0 16px 36px rgba(0,0,0,.22); }
.dashboard-stat-card:active, .note-card:active, .flashcard:active { transform: translateY(-1px) scale(.99); }

.check { width: 23px; height: 23px; border-radius: 7px; border: 1px solid #414b67; background: transparent; color: #fff; flex-shrink: 0; }
.check.done { background: #34d399; border-color: #34d399; }
.check.just-completed { animation: task-check .3s cubic-bezier(.2,.8,.2,1); }
.check:active { transform: scale(.9); }
.task-title { transition: opacity .2s ease, color .2s ease; }
.task-row.is-complete { background: rgba(52,211,153,.055); border-color: rgba(52,211,153,.24); }
.task-row.is-complete .task-title { opacity: .62; color: #b7c6c1; }
.tag { font-size: 11px; padding: 5px 8px; border-radius: 99px; background: #20273b; color: #aeb8cf; white-space: nowrap; }
.high { color: #ff9aa9; background: rgba(255,90,120,.1); }
.medium { color: #ffd58a; background: rgba(255,200,70,.1); }
.low { color: #6ee7b7; background: rgba(52,211,153,.1); }

input, select, textarea { width: 100%; padding: 11px 12px; border-radius: 11px; border: 1px solid #2a334d; background: #0b1020; color: #eef2ff; outline: none; }
textarea { resize: vertical; min-height: 130px; }
input:focus, select:focus, textarea:focus { border-color: #7c5cff; box-shadow: 0 0 0 3px rgba(124,92,255,.1); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid .full { grid-column: 1 / -1; }
.actions { display: flex; gap: 9px; flex-wrap: wrap; }

.chart { display: flex; align-items: end; gap: 10px; height: 190px; padding-top: 20px; }
.bar-col { flex: 1; text-align: center; height: 100%; display: flex; flex-direction: column; justify-content: end; gap: 7px; }
.bar-col i { display: block; min-height: 8px; border-radius: 8px 8px 2px 2px; background: linear-gradient(180deg, #22d3ee, #7c5cff); }
.bar-col small { font-size: 11px; color: #7e899f; }

.welcome { min-height: 100vh; display: grid; place-items: center; padding: 28px; }
.hero { max-width: 1050px; text-align: center; }
.orb { width: 100px; height: 100px; margin: 0 auto 22px; border-radius: 50%; background: radial-gradient(circle, #fff 0 5%, #7c5cff 25%, #22d3ee 45%, transparent 70%); filter: drop-shadow(0 0 35px #7c5cff); animation: pulse 3s infinite; }
.hero h1 { font: 800 clamp(44px,8vw,82px) "Manrope", sans-serif; letter-spacing: -.065em; margin: 0; }
.gradient { background: linear-gradient(90deg, #a78bfa, #22d3ee); color: transparent; background-clip: text; }
.hero p { max-width: 650px; margin: 18px auto 28px; color: #9ba5bd; font-size: 17px; line-height: 1.7; }
.feature-row { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin: 20px 0 30px; }
.pill { padding: 9px 12px; border: 1px solid #2a3150; border-radius: 99px; background: rgba(255,255,255,.035); color: #aab4cc; font-size: 12px; }
.feature-strip {
  overflow: hidden;
  background: linear-gradient(180deg, rgba(17,20,31,0.7), rgba(12,15,25,0.8));
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 18px 42px rgba(0,0,0,.14);
  backdrop-filter: blur(16px);
}
.feature-strip-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.feature-tile {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px 15px; border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.012));
  color: inherit; box-shadow: inset 0 1px 0 rgba(255,255,255,.04); transition: transform .2s ease, border-color .2s ease, background-color .2s ease, box-shadow .2s ease;
}
.feature-tile:hover { transform: translateY(-2px); border-color: rgba(167,139,250,.35); background: linear-gradient(180deg, rgba(167,139,250,.08), rgba(255,255,255,.02)); box-shadow: 0 14px 30px rgba(67,55,121,.2); }
.feature-tile-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; font-size: 20px; background: linear-gradient(135deg, rgba(124,92,255,.22), rgba(34,211,238,.12)); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
.feature-tile strong { display: block; font-size: 15px; margin-bottom: 2px; }
.feature-tile small { display: block; color: #8a94ad; }

.auth { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.auth-card { width: min(440px, 100%); }
.auth-card h1 { font: 700 35px "Manrope", sans-serif; letter-spacing: -.045em; margin: 5px 0 10px; }
.auth-card form { display: grid; gap: 13px; margin-top: 22px; }
.recovery-overlay { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 20px; background: rgba(4, 7, 17, .78); backdrop-filter: blur(12px); }
.recovery-dialog { width: min(480px, 100%); display: grid; gap: 14px; }
.recovery-dialog h2 { margin: 0; font: 700 28px "Manrope", sans-serif; letter-spacing: -.035em; }
.recovery-dialog p { margin: 0; }
.recovery-code-value { overflow-wrap: anywhere; padding: 14px; border: 1px solid #394362; border-radius: 12px; background: rgba(0, 0, 0, .22); color: #d8ccff; font-size: 15px; user-select: all; }
.welcome { background: radial-gradient(ellipse at 50% 35%, rgba(124,92,255,.14), transparent 52%); }
.welcome .hero { width: min(850px, 100%); }
.welcome .hero h1 { letter-spacing: -.065em; line-height: 1.05; }
.welcome .orb { width: 84px; height: 84px; }
.welcome-actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
.welcome-actions button { min-width: 170px; }
.auth-switch { border: 0; padding: 0; background: none; color: #b39aff; font-weight: 700; }
.auth-switch:hover { color: #d2c4ff; text-decoration: underline; }
.auth-error { color: #ff9aa9; font-size: 13px; }
.auth-back { margin-bottom: 24px; }

.timer { text-align: center; padding: 15px; }
.timer-face { font: 800 76px "Manrope", sans-serif; letter-spacing: -.06em; margin: 18px 0; }
.mode-row { display: flex; justify-content: center; gap: 8px; }
.mode-row button.active { background: #7c5cff; color: #fff; border-color: #7c5cff; }

.mobile-nav { display: none; }
.toast { position: fixed; right: 22px; bottom: 22px; z-index: 100; background: #11172a; border: 1px solid #313a57; border-radius: 14px; padding: 13px 16px; box-shadow: 0 18px 45px #0008; max-width: 350px; }

.subject-icon { width: 45px; height: 45px; display: grid; place-items: center; border-radius: 13px; font-size: 22px; flex-shrink: 0; }
.subject-card { position: relative; overflow: hidden; }
.subject-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--subject-color); }
.subject-mini { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #b8c1d6; }
.task-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 7px; align-items: center; }
.filter-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 16px; }
.filter-btn { border: 1px solid #2a334d; background: #11172a; color: #9ca6bd; padding: 8px 12px; border-radius: 10px; }
.filter-btn.active { background: #7c5cff; border-color: #7c5cff; color: white; }
.empty { text-align: center; padding: 35px 15px; color: #7e899f; }
.empty h3 { color: inherit; margin: 10px 0 5px; }

.ai-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.ai-tab { padding: 9px 12px; border-radius: 11px; border: 1px solid #2a334d; background: #101629; color: #aab4cc; }
.ai-tab.active { color: white; background: linear-gradient(135deg, #7c5cff, #4f8cff); border-color: transparent; }

.reminder-card { border-left: 4px solid #7c5cff; }
.reminder-card.overdue { border-left-color: #fb7185; }
.reminder-card.today { border-left-color: #fbbf24; }

.goal-circle { width: 130px; height: 130px; border-radius: 50%; display: grid; place-items: center; margin: 5px auto 18px; background: conic-gradient(#7c5cff 0 var(--goal), #20273b var(--goal) 100%); }
.goal-circle-inner { width: 104px; height: 104px; border-radius: 50%; background: #0e1221; display: grid; place-items: center; text-align: center; }
.light .goal-circle-inner { background: white; }
.goal-number { font: 700 25px "Manrope", sans-serif; }

.profile-avatar { width: 75px; height: 75px; border-radius: 22px; display: grid; place-items: center; font: 700 30px "Manrope", sans-serif; color: white; background: linear-gradient(135deg, #7c5cff, #22d3ee); box-shadow: 0 15px 35px rgba(124,92,255,.3); }
.stat-icon { font-size: 22px; }
.reminder-list { display: grid; gap: 10px; }
.ai-suggestion { padding: 12px; border-radius: 12px; background: rgba(34,211,238,.05); border: 1px solid rgba(34,211,238,.12); }
.quiz-question { padding: 15px; border-radius: 14px; border: 1px solid #28314a; margin-bottom: 10px; }
.quiz-option { width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px; margin-top: 7px; border: 1px solid #2a334d; background: #101629; color: #cbd3e5; }
.quiz-option:hover { border-color: #7c5cff; }

@keyframes pulse { 50% { transform: scale(1.08); opacity: .8; } }
@keyframes page-enter {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes task-check {
  0% { transform: scale(.72); }
  65% { transform: scale(1.14); }
  100% { transform: scale(1); }
}

@media(max-width: 980px) {
  .sidebar { display: none; }
  .mobile-nav { display: flex; position: fixed; bottom: 14px; left: 14px; right: 14px; z-index: 30; background: #101629eF; border: 1px solid #2b3450; border-radius: 16px; padding: 7px; justify-content: space-around; }
  .mobile-nav .nav-btn { justify-content: center; width: auto; }
  .stats, .three, .feature-strip-grid { grid-template-columns: 1fr 1fr; }
  .content { padding: 20px; }
}

@media(max-width: 650px) {
  .stats, .two, .three, .form-grid, .feature-strip-grid { grid-template-columns: 1fr; }
  .topbar { padding: 0 14px; }
  .content { padding: 15px; }
  .title { font-size: 27px; }
  .hero h1 { letter-spacing: -2px; }
  .timer-face { font-size: 58px; }
  .hide-mobile { display: none; }
  .page-head { align-items: flex-start; flex-direction: column; }
}

/* Real-time AI Assistant UI */
.ai-shell { overflow: hidden; }
.ai-status-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
.ai-status { display:flex; align-items:center; gap:9px; font-weight:700; }
.ai-status small { color:#7e899f; font-weight:500; }
.ai-live-dot { width:9px; height:9px; border-radius:50%; background:#34d399; box-shadow:0 0 0 5px rgba(52,211,153,.10), 0 0 18px rgba(52,211,153,.7); animation:aiPulse 1.8s infinite; }
.ai-live-dot.offline { background:#fb7185; box-shadow:0 0 0 5px rgba(251,113,133,.1),0 0 18px rgba(251,113,133,.55); }
.ai-live-dot.unconfigured { background:#fbbf24; box-shadow:0 0 0 5px rgba(251,191,36,.1),0 0 18px rgba(251,191,36,.5); }
.ai-context-tags { display:flex; gap:7px; flex-wrap:wrap; }
.ai-chat-window { min-height:360px; max-height:540px; overflow:auto; padding:8px 4px 12px; display:grid; gap:14px; scrollbar-width:thin; }
.ai-message { display:flex; gap:10px; max-width:88%; animation:aiIn .25s ease; }
.ai-message.user { margin-left:auto; flex-direction:row-reverse; }
.ai-message-avatar { width:36px; height:36px; flex:0 0 36px; display:grid; place-items:center; border-radius:12px; background:linear-gradient(135deg,#7c5cff,#22d3ee); color:#fff; font-weight:800; box-shadow:0 8px 20px rgba(124,92,255,.22); }
.ai-message.user .ai-message-avatar { background:#20273b; }
.ai-message-body { min-width:0; }
.ai-message-name { font-size:11px; color:#7e899f; margin:2px 0 5px; font-weight:700; }
.ai-message.user .ai-message-name { text-align:right; }
.ai-message-text { white-space:pre-wrap; line-height:1.7; padding:13px 15px; border:1px solid #28314a; border-radius:16px 16px 16px 5px; background:rgba(255,255,255,.035); }
.ai-message.user .ai-message-text { border-radius:16px 16px 5px 16px; background:linear-gradient(135deg,rgba(124,92,255,.20),rgba(79,140,255,.10)); border-color:rgba(124,92,255,.28); }
.ai-message-actions { display:flex; gap:8px; margin-top:8px; }
.ai-message-save { padding:6px 9px; border:1px solid rgba(255,255,255,.09); border-radius:9px; background:rgba(255,255,255,.035); color:#bcb4d2; font-size:11px; }
.ai-message-save:hover:not(:disabled) { border-color:rgba(167,139,250,.35); color:#e8ddff; background:rgba(167,139,250,.08); }
.ai-typing { display:flex; align-items:center; gap:5px; color:#8993aa; padding:10px 0; }
.ai-typing i { width:7px; height:7px; border-radius:50%; background:#7c5cff; animation:aiBounce 1s infinite; }
.ai-typing i:nth-child(2){animation-delay:.15s}.ai-typing i:nth-child(3){animation-delay:.3s}
.ai-quick-row { display:flex; gap:8px; flex-wrap:wrap; padding:12px 0; }
.ai-quick { border:1px solid #2a334d; background:rgba(255,255,255,.025); color:#aab4cc; padding:8px 11px; border-radius:99px; font-size:12px; transition:.2s; }
.ai-quick:hover { transform:translateY(-2px); border-color:#7c5cff; color:#fff; background:rgba(124,92,255,.09); }
.ai-composer { border:1px solid #28314a; background:rgba(8,12,25,.55); border-radius:18px; padding:13px; }
.ai-composer-top { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.ai-composer-top select { flex:1; }
.ai-mode-label { color:#7e899f; font-size:12px; white-space:nowrap; }
.ai-mode-label b { color:#cfd7e8; }
.ai-composer textarea { min-height:95px; border:0; background:transparent; padding:8px 2px; box-shadow:none; resize:vertical; }
.ai-composer textarea:focus { border:0; box-shadow:none; }
.ai-compose-footer { display:flex; justify-content:space-between; align-items:center; gap:12px; padding-top:8px; border-top:1px solid #222a42; }
.ai-compose-footer small { color:#66708a; }
.ai-score-badge { padding:9px 13px; border-radius:99px; background:rgba(52,211,153,.10); color:#6ee7b7; border:1px solid rgba(52,211,153,.18); font-weight:800; }
.quiz-option.selected { border-color:#7c5cff; background:rgba(124,92,255,.14); }
.quiz-option.correct { border-color:#34d399; background:rgba(52,211,153,.10); }
.quiz-option span { display:inline-grid; place-items:center; width:24px; height:24px; margin-right:9px; border-radius:7px; background:#20273b; font-size:11px; font-weight:800; }
@keyframes aiPulse { 50% { opacity:.55; transform:scale(.82); } }
@keyframes aiBounce { 0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)} }
@keyframes aiIn { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:none; } }
@media(max-width:650px){ .ai-message{max-width:96%}.ai-composer-top{align-items:stretch; flex-direction:column}.ai-mode-label{padding:4px 0}.ai-compose-footer{align-items:stretch; flex-direction:column}.ai-compose-footer .primary-btn{width:100%}.ai-chat-window{min-height:300px} }

/* Premium visual refresh */
:root {
  color-scheme: dark;
  --sf-bg: #090b12;
  --sf-surface: rgba(17, 20, 31, .84);
  --sf-border: rgba(255, 255, 255, .085);
  --sf-muted: #9298aa;
  --sf-accent: #a78bfa;
  --sf-cyan: #67e8d2;
}
body {
  background: var(--sf-bg);
  color: #f4f2fa;
  font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: -.01em;
}
button, input, select, textarea { font-family: inherit; }
.sf-app {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(ellipse at 18% 12%, rgba(76, 79, 185, .2), transparent 34rem),
    radial-gradient(ellipse at 84% 24%, rgba(var(--theme-rgb), .18), transparent 31rem),
    radial-gradient(ellipse at 40% 88%, rgba(35, 139, 159, .14), transparent 38rem),
    linear-gradient(135deg, #070914, #0c1020 52%, #080a14);
}
.sf-app.theme-violet, .sf-app.theme-ocean, .sf-app.theme-rose, .sf-app.theme-amber {
  background:
    radial-gradient(ellipse at 18% 12%, rgba(76, 79, 185, .2), transparent 34rem),
    radial-gradient(ellipse at 84% 24%, var(--theme-glow), transparent 31rem),
    radial-gradient(ellipse at 40% 88%, rgba(35, 139, 159, .14), transparent 38rem),
    linear-gradient(135deg, #070914, #0c1020 52%, #080a14);
}
.sf-app > .welcome-atmosphere { position: fixed; z-index: 0; }
.sf-app .background-transition {
  position: absolute;
  z-index: 0;
  inset: -8%;
  background:
    radial-gradient(ellipse at 22% 28%, rgba(var(--theme-rgb), .32), transparent 38%),
    radial-gradient(ellipse at 76% 68%, rgba(45, 197, 201, .22), transparent 42%),
    linear-gradient(112deg, transparent 34%, rgba(var(--theme-rgb), .12) 50%, transparent 66%);
  filter: blur(14px);
  pointer-events: none;
  animation: background-enter 1.25s cubic-bezier(.2,.75,.25,1) both;
}
.sf-app.light { --background-glow-opacity: .42; }
.sf-app > .topbar { position: sticky; z-index: 50; }
.sf-app > .shell { position: relative; z-index: 1; }
.sf-app .welcome-atmosphere-orbit { right: -260px; }
.sf-app .welcome-star-orbit { left: 78%; width: min(76vw, 980px); opacity: .76; }
.sf-app .welcome-atmosphere-glow { top: 13%; right: 8%; width: min(32vw, 440px); opacity: .78; }
.sf-app .welcome-atmosphere::before { opacity: .72; }
.sf-app .welcome-atmosphere::after { opacity: .7; }
.sf-app .space-planet { top: 20%; right: 17%; width: min(20vw, 240px); opacity: .22; }
.sf-app .welcome-atmosphere-orbit { right: -180px; width: min(74vw, 920px); }
.sf-app .welcome-star-orbit { opacity: .62; }
.sf-app .topbar { background: rgba(8, 10, 19, .74); backdrop-filter: blur(24px); }
.sf-app .sidebar { background: rgba(8, 10, 19, .48); backdrop-filter: blur(16px); }
.sf-app.light {
  background:
    radial-gradient(ellipse at 18% 12%, rgba(113, 126, 219, .2), transparent 35rem),
    radial-gradient(ellipse at 84% 22%, rgba(var(--theme-rgb), .14), transparent 32rem),
    radial-gradient(ellipse at 40% 88%, rgba(63, 177, 190, .12), transparent 38rem),
    linear-gradient(135deg, #f3f4fc, #eef3fa 55%, #f5f4fa);
}
.sf-app.light .welcome-atmosphere::before { opacity: .42; }
.sf-app.light .welcome-atmosphere::after { opacity: .3; }
.sf-app.light .space-planet { opacity: .11; }
.sf-app.light .topbar, .sf-app.light .sidebar { backdrop-filter: blur(20px); }
.sf-app .content > * { animation: dashboardEnter .48s both; }
.sf-app .content > *:nth-child(2) { animation-delay: .045s; }
.sf-app .content > *:nth-child(3) { animation-delay: .09s; }
.sf-app .content > *:nth-child(4) { animation-delay: .135s; }
.sf-app .content > *:nth-child(5) { animation-delay: .18s; }
.sf-app .content > *:nth-child(n+6) { animation-delay: .22s; }
.sf-app .dashboard-stat-card {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  transition: transform .24s cubic-bezier(.2,.75,.3,1), border-color .24s ease, box-shadow .24s ease, background .24s ease;
}
.sf-app .dashboard-stat-card::after {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: radial-gradient(ellipse at 100% 0, rgba(var(--theme-rgb), .15), transparent 62%);
  content: "";
  opacity: 0;
  transition: opacity .24s ease;
  pointer-events: none;
}
.sf-app .dashboard-stat-card:hover {
  transform: translateY(-4px);
  border-color: rgba(var(--theme-rgb), .32);
  box-shadow: 0 20px 45px rgba(0,0,0,.24), 0 0 26px rgba(var(--theme-rgb), .07);
}
.sf-app .dashboard-stat-card:hover::after { opacity: 1; }
.sf-app .dashboard-stat-card .stat-icon { transition: transform .24s cubic-bezier(.2,.75,.3,1); }
.sf-app .dashboard-stat-card:hover .stat-icon { transform: translateY(-2px) scale(1.08); }
.sf-app .dashboard-settings, .sf-app .grid.two > .panel, .sf-app .content > .panel:not(.dashboard-quote) {
  transition: border-color .22s ease, box-shadow .22s ease;
}
.sf-app .dashboard-settings:hover, .sf-app .grid.two > .panel:hover, .sf-app .content > .panel:not(.dashboard-quote):hover {
  border-color: rgba(var(--theme-rgb), .2);
  box-shadow: 0 18px 55px rgba(0,0,0,.18), 0 0 22px rgba(var(--theme-rgb), .035);
}
.sf-app .nav-btn.active { position: relative; overflow: hidden; }
.sf-app .nav-btn.active::before {
  position: absolute;
  inset: 22% auto 22% 0;
  width: 2px;
  border-radius: 0 4px 4px 0;
  background: var(--theme-primary);
  box-shadow: 0 0 12px rgba(var(--theme-rgb), .75);
  content: "";
}
.sf-app .nav-btn.active b, .sf-app .nav-btn.active > span { color: var(--theme-primary); }
.sf-app .dashboard-quote { transition: border-color .22s ease, box-shadow .22s ease; }
.sf-app .dashboard-quote:hover { border-color: rgba(var(--theme-rgb), .3); box-shadow: 0 18px 48px rgba(0,0,0,.2), 0 0 30px rgba(var(--theme-rgb), .07); }
.sf-app .progress { position: relative; }
.sf-app .progress .bar { position: relative; overflow: hidden; }
.sf-app .progress .bar::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.38) 50%, transparent 70%);
  content: "";
  transform: translateX(-110%);
  animation: progressShine 4.5s 1s ease-in-out infinite;
}
.sf-app .primary-btn { transition: transform .2s ease, box-shadow .2s ease, filter .2s ease; }
.sf-app .primary-btn:hover { box-shadow: 0 13px 30px rgba(var(--theme-rgb), .3); }
.sf-app.light .dashboard-stat-card:hover, .sf-app.light .dashboard-quote:hover {
  box-shadow: 0 16px 38px rgba(var(--theme-rgb), .11);
}
.sf-app.light .dashboard-quote-text { color: #303447; }
.sf-app .nav-btn:focus-visible, .sf-app .dashboard-stat-card:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 3px;
}
@keyframes dashboardEnter { from { opacity: 0; translate: 0 9px; } to { opacity: 1; translate: 0 0; } }
@keyframes progressShine { 0%, 52%, 100% { transform: translateX(-110%); } 82% { transform: translateX(110%); } }
.sf-app.light {
  color-scheme: light;
  background:
    radial-gradient(ellipse at 18% 12%, rgba(113, 126, 219, .2), transparent 35rem),
    radial-gradient(ellipse at 84% 22%, rgba(var(--theme-rgb), .14), transparent 32rem),
    radial-gradient(ellipse at 40% 88%, rgba(63, 177, 190, .12), transparent 38rem),
    linear-gradient(135deg, #f3f4fc, #eef3fa 55%, #f5f4fa);
}
.topbar {
  height: 76px;
  padding: 0 clamp(18px, 4vw, 56px);
  background: rgba(9, 11, 18, .78);
  border-color: rgba(255, 255, 255, .07);
}
.brand {
  padding: 8px 0;
  border: 0;
  background: transparent;
  font-size: 20px;
}
.brand span { color: #a78bfa; }
.sidebar {
  width: 258px;
  padding: 26px 18px;
  background: rgba(10, 12, 19, .56);
  border-color: rgba(255, 255, 255, .07);
}
.nav-section {
  padding: 20px 12px 8px;
  color: #777d90;
  font-size: 10px;
  font-weight: 700;
}
.nav-btn {
  padding: 12px 13px;
  border-radius: 12px;
  color: #a2a6b6;
  transition: color .2s ease, background .2s ease, transform .2s ease;
}
.nav-btn:hover { color: #f6f2ff; transform: translateX(2px); }
.nav-btn.active {
  color: #f7f4ff;
  background: linear-gradient(100deg, rgba(145, 111, 237, .2), rgba(145, 111, 237, .055));
  box-shadow: inset 2px 0 #a78bfa;
}
.content { padding: clamp(22px, 3.2vw, 48px); }
.page-head { margin-bottom: 28px; }
.eyebrow {
  color: #b39aff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .17em;
}
.title { letter-spacing: -.045em; }
.panel {
  border-color: var(--sf-border);
  border-radius: 20px;
  background: linear-gradient(145deg, rgba(21, 24, 42, .84), rgba(12, 15, 29, .78));
  box-shadow: 0 18px 55px rgba(0, 0, 0, .16);
  backdrop-filter: blur(12px);
}
.stats .panel {
  position: relative;
  overflow: hidden;
  min-height: 150px;
  transition: transform .22s ease, border-color .22s ease;
}
.stats .panel:hover { transform: translateY(-3px); border-color: rgba(167, 139, 250, .25); }
.stat-icon { margin-bottom: 12px; opacity: .9; }
.stat-value { letter-spacing: -.055em; }
.card-title { letter-spacing: -.025em; }
.item {
  border-color: rgba(255, 255, 255, .075);
  border-radius: 13px;
  background: rgba(255, 255, 255, .025);
  transition: border-color .2s ease, background .2s ease;
}
.item:hover { border-color: rgba(167, 139, 250, .2); background: rgba(255, 255, 255, .04); }
.primary-btn {
  padding: 12px 17px;
  border-radius: 12px;
  background: linear-gradient(110deg, #9a79f4, #7558d8);
  box-shadow: 0 9px 25px rgba(117, 88, 216, .22);
  font-weight: 700;
  transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
}
.primary-btn:hover { transform: translateY(-2px); box-shadow: 0 13px 30px rgba(117, 88, 216, .3); filter: brightness(1.07); }
.ghost-btn, .icon-btn, .danger-btn {
  border-color: rgba(255, 255, 255, .1);
  border-radius: 12px;
  background: rgba(255, 255, 255, .035);
}
.ghost-btn:hover, .icon-btn:hover { border-color: rgba(167, 139, 250, .3); background: rgba(167, 139, 250, .08); }
input, select, textarea {
  border-color: rgba(255, 255, 255, .11);
  border-radius: 12px;
  background: rgba(8, 10, 17, .72);
}
input:focus, select:focus, textarea:focus {
  border-color: rgba(167, 139, 250, .72);
  box-shadow: 0 0 0 4px rgba(167, 139, 250, .1);
}
.auth-card { padding: clamp(26px, 5vw, 42px); }
.auth-card h1 { letter-spacing: -.045em; }
.auth-card form { gap: 12px; }
.auth-card .muted { line-height: 1.7; }
.progress { background: rgba(255, 255, 255, .08); }
.bar { background: linear-gradient(90deg, #a78bfa, #67e8d2); }
.mobile-nav {
  background: rgba(15, 17, 27, .94);
  border-color: rgba(255, 255, 255, .1);
  box-shadow: 0 16px 45px rgba(0, 0, 0, .35);
  backdrop-filter: blur(18px);
}
.toast {
  background: #171925;
  border-color: rgba(255, 255, 255, .12);
  border-radius: 14px;
}

.welcome {
  position: relative;
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  padding: 28px clamp(22px, 7vw, 108px);
  background:
    radial-gradient(ellipse at 78% 43%, rgba(109, 77, 197, .18), transparent 33rem),
    radial-gradient(ellipse at 16% 88%, rgba(57, 171, 155, .09), transparent 27rem),
    #090b12;
}
.welcome-atmosphere {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 73% 31%, rgba(var(--theme-rgb), .1), transparent 34rem),
    radial-gradient(ellipse at 25% 82%, rgba(38, 163, 175, .08), transparent 30rem);
}
.welcome-atmosphere::before {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1.5px 1.5px at 8% 19%, rgba(255,255,255,.9) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 17% 72%, rgba(196,181,253,.92) 50%, transparent 100%),
    radial-gradient(1px 1px at 32% 11%, rgba(255,255,255,.82) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 61% 17%, rgba(103,232,210,.9) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 89% 25%, rgba(255,255,255,.9) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 95% 71%, rgba(196,181,253,.88) 50%, transparent 100%),
    radial-gradient(1px 1px at 49% 88%, rgba(255,255,255,.76) 50%, transparent 100%),
    radial-gradient(1px 1px at 20px 36px, rgba(255,255,255,.62) 50%, transparent 100%),
    radial-gradient(1px 1px at 84px 112px, rgba(161,190,255,.68) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 146px 78px, rgba(255,255,255,.76) 50%, transparent 100%),
    radial-gradient(1px 1px at 202px 164px, rgba(103,232,210,.68) 50%, transparent 100%),
    radial-gradient(1px 1px at 250px 42px, rgba(255,255,255,.58) 50%, transparent 100%);
  background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 280px 220px, 340px 280px, 390px 320px, 460px 360px, 520px 420px;
  content: "";
  opacity: .76;
  animation: starTwinkle 5.5s ease-in-out infinite alternate;
}
.welcome-atmosphere::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -35%;
  width: 24%;
  background: linear-gradient(90deg, transparent, rgba(var(--theme-rgb), .11), transparent);
  content: "";
  transform: skewX(-18deg);
  animation: ambientSweep 15s 2s ease-in-out infinite;
}
.welcome-star {
  position: absolute;
  z-index: 1;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--theme-secondary);
  box-shadow: 0 0 12px 2px rgba(var(--theme-rgb), .48);
  opacity: 0;
  animation: starTravel 8s ease-in-out infinite;
}
.welcome-star-one { top: 24%; left: 43%; }
.welcome-star-two { top: 71%; left: 58%; width: 2px; height: 2px; animation-delay: -2.5s; animation-duration: 10s; }
.welcome-star-three { top: 37%; left: 92%; width: 2px; height: 2px; animation-delay: -5s; animation-duration: 9s; }
.welcome-star-four { top: 84%; left: 28%; animation-delay: -4s; animation-duration: 11s; }
.welcome-star-five { top: 13%; left: 73%; width: 2px; height: 2px; animation-delay: -1.5s; animation-duration: 9.5s; }
.welcome-star-six { top: 56%; left: 8%; width: 2px; height: 2px; animation-delay: -6s; animation-duration: 10.5s; }
.welcome-star-seven { top: 91%; left: 81%; width: 2px; height: 2px; animation-delay: -3s; animation-duration: 12s; }
.welcome-star-eight { top: 45%; left: 66%; width: 2px; height: 2px; animation-delay: -7s; animation-duration: 8.5s; }
.welcome-star-orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(62vw, 760px);
  aspect-ratio: 1;
  border: 1px solid rgba(var(--theme-rgb), .28);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotate(-24deg) scaleY(.32);
  animation: orbitPulse 7s ease-in-out infinite alternate;
}
.welcome-star-orbit::after {
  position: absolute;
  top: 50%;
  left: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-secondary);
  box-shadow: 0 0 18px 4px rgba(var(--theme-rgb), .55);
  content: "";
  transform: translate(-50%, -50%);
}
.welcome-atmosphere-orbit {
  position: absolute;
  top: 50%;
  right: -220px;
  width: min(62vw, 760px);
  aspect-ratio: 1;
  border: 1px solid rgba(var(--theme-rgb), .16);
  border-radius: 50%;
  transform: translateY(-50%);
  animation: orbitTurn 32s linear infinite;
}
.welcome-atmosphere-orbit::before, .welcome-atmosphere-orbit::after {
  position: absolute;
  inset: 9%;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 50%;
  content: "";
}
.welcome-atmosphere-orbit::after { inset: 21%; border-color: rgba(var(--theme-rgb), .13); }
.space-planet {
  position: absolute;
  top: 8%;
  right: 12%;
  width: min(24vw, 300px);
  aspect-ratio: 1;
  border: 1px solid rgba(218, 226, 255, .22);
  border-radius: 50%;
  background:
    radial-gradient(circle at 33% 27%, rgba(255, 255, 255, .52), transparent 2%),
    radial-gradient(ellipse at 34% 30%, rgba(181, 199, 255, .52), transparent 31%),
    radial-gradient(ellipse at 66% 66%, rgba(8, 14, 38, .92), transparent 62%),
    radial-gradient(circle at 42% 40%, rgba(var(--theme-rgb), .8), rgba(39, 75, 138, .58) 51%, rgba(12, 18, 43, .9) 72%);
  box-shadow: inset -24px -18px 42px rgba(2, 4, 16, .62), 0 0 72px rgba(var(--theme-rgb), .24);
  opacity: .48;
  animation: planetFloat 17s ease-in-out infinite alternate;
  pointer-events: none;
}
.space-planet::before {
  position: absolute;
  inset: 23% -38%;
  border: 1px solid rgba(210, 225, 255, .34);
  border-radius: 50%;
  content: "";
  transform: rotate(-24deg) scaleY(.36);
  box-shadow: 0 0 18px rgba(var(--theme-rgb), .14);
}
.space-planet::after {
  position: absolute;
  inset: 31% -30%;
  border: 1px solid rgba(var(--theme-rgb), .38);
  border-radius: 50%;
  content: "";
  transform: rotate(-24deg) scaleY(.36);
}
.auth.theme-violet, .auth.theme-ocean, .auth.theme-rose, .auth.theme-amber {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 78% 43%, var(--theme-glow), transparent 37rem),
    radial-gradient(ellipse at 16% 88%, rgba(var(--theme-rgb), .12), transparent 30rem),
    radial-gradient(ellipse at 35% 8%, rgba(77, 102, 196, .12), transparent 30rem),
    #080a15;
}
.auth::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  background-image: linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
  background-size: 58px 58px;
  content: "";
  mask-image: linear-gradient(to bottom, black, transparent 85%);
  pointer-events: none;
}
.auth .auth-card {
  position: relative;
  z-index: 2;
  border-color: rgba(var(--theme-rgb), .2);
  background: linear-gradient(145deg, rgba(22, 24, 37, .96), rgba(13, 15, 25, .96));
  box-shadow: 0 30px 90px rgba(0,0,0,.42), 0 0 70px rgba(var(--theme-rgb), .1);
  animation: welcomeRise .55s ease both;
}
.auth .auth-card .eyebrow, .auth .auth-switch { color: var(--theme-primary); }
.auth .auth-switch:hover { color: var(--theme-secondary); }
.auth.theme-violet input:focus, .auth.theme-ocean input:focus,
.auth.theme-rose input:focus, .auth.theme-amber input:focus {
  border-color: rgba(var(--theme-rgb), .7);
  box-shadow: 0 0 0 4px rgba(var(--theme-rgb), .11);
}
.auth .auth-back { transition: transform .2s ease, border-color .2s ease, color .2s ease; }
.auth .auth-back:hover { transform: translateX(-3px); border-color: rgba(var(--theme-rgb), .35); }
.auth-theme-picker { position: absolute; z-index: 3; top: 28px; right: clamp(22px, 7vw, 108px); }
.auth .welcome-atmosphere-orbit { right: -260px; }
.auth .welcome-star-orbit { width: min(72vw, 860px); }
.auth .welcome-atmosphere-glow { top: 14%; right: 14%; }
.auth .welcome-star-orbit::after { width: 6px; height: 6px; }
.welcome-atmosphere-glow {
  position: absolute;
  top: 19%;
  right: 8%;
  width: min(28vw, 360px);
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(ellipse at 55% 45%, rgba(var(--theme-rgb), .27), transparent 68%),
    radial-gradient(ellipse at 35% 68%, rgba(49, 174, 190, .14), transparent 70%);
  filter: blur(48px);
  animation: atmosphereDrift 11s ease-in-out infinite alternate;
}
.welcome-preview-float {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 14px;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 13px;
  background: rgba(20,22,34,.86);
  box-shadow: 0 15px 45px rgba(0,0,0,.25);
  color: #ddd9e8;
  font-size: 10px;
  backdrop-filter: blur(16px);
  animation: floatBadge 6s ease-in-out infinite;
}
.welcome-preview-float strong { display: block; color: #f1edf8; font-size: 11px; }
.welcome-preview-float small { color: #9296a7; }
.welcome-preview-float i { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border-radius: 9px; background: rgba(var(--theme-rgb), .13); color: var(--theme-secondary); font-style: normal; }
.welcome-preview-float.focus { top: -7%; right: -4%; }
.welcome-preview-float.ai { bottom: -4%; left: -8%; animation-delay: -2.4s; }
.welcome-preview-float.focus i { color: var(--theme-primary); }
.welcome-preview { isolation: isolate; }
.welcome-preview::after {
  position: absolute;
  z-index: -1;
  inset: -8px;
  border: 1px solid rgba(var(--theme-rgb), .09);
  border-radius: 29px;
  content: "";
}
.welcome .welcome-header-note { padding: 9px 13px; border: 1px solid rgba(255,255,255,.06); border-radius: 99px; background: rgba(255,255,255,.025); }
.welcome .welcome-footer { border-top: 1px solid rgba(255,255,255,.06); }
.dashboard-quote {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 86px;
  margin: 0 0 16px;
  padding: 17px 20px;
  overflow: hidden;
  border-color: rgba(var(--theme-rgb), .16);
  background:
    radial-gradient(ellipse at 100% 50%, rgba(var(--theme-rgb), .11), transparent 52%),
    linear-gradient(110deg, rgba(var(--theme-rgb), .055), rgba(255,255,255,.015));
}
.dashboard-quote-mark { align-self: flex-start; color: var(--theme-primary); font: 700 46px/1 Georgia, serif; opacity: .8; }
.dashboard-quote-copy { flex: 1; min-width: 0; }
.dashboard-quote-label { margin-bottom: 5px; color: var(--theme-primary); font-size: 9px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.dashboard-quote-text { color: #e8e5ef; font: 500 14px/1.6 "DM Sans", sans-serif; animation: welcomeContentIn .3s ease both; }
.dashboard-quote button { flex: 0 0 auto; }
.theme-violet .dashboard-quote, .theme-ocean .dashboard-quote, .theme-rose .dashboard-quote, .theme-amber .dashboard-quote { --quote-color: var(--theme-primary); }
@keyframes atmosphereDrift { from { transform: translate3d(-24px, -16px, 0) scale(.9); opacity: .55; } to { transform: translate3d(28px, 20px, 0) scale(1.12); opacity: 1; } }
@keyframes planetFloat { from { translate: 0 0; } to { translate: -14px 12px; } }
@keyframes floatBadge { 0%, 100% { translate: 0 0; } 50% { translate: 0 -10px; } }
@keyframes starTwinkle { from { opacity: .2; } to { opacity: .78; } }
@keyframes background-enter {
  0% { opacity: 0; transform: scale(.84) translate3d(-2%, 1%, 0) rotate(-2deg); }
  32% { opacity: var(--background-glow-opacity, .78); transform: scale(1) translate3d(0, 0, 0); }
  100% { opacity: 0; transform: scale(1.16) translate3d(3%, -2%, 0) rotate(2deg); }
}
@keyframes orbitTurn { from { rotate: 0deg; } to { rotate: 360deg; } }
@keyframes orbitPulse { from { scale: .92 1; opacity: .55; } to { scale: 1.08 1; opacity: 1; } }
@keyframes starTravel {
  0%, 100% { opacity: 0; translate: 0 14px; scale: .55; }
  20%, 78% { opacity: .8; }
  50% { opacity: .35; translate: 18px -22px; scale: 1.2; }
}
@keyframes ambientSweep { 0%, 64%, 100% { left: -35%; opacity: 0; } 70% { opacity: 1; } 88% { left: 115%; opacity: .35; } }
@keyframes welcomeReveal { from { opacity: 0; translate: 0 10px; } to { opacity: 1; translate: 0 0; } }
@keyframes welcomeRise { from { opacity: 0; translate: 0 18px; } to { opacity: 1; translate: 0 0; } }
@keyframes buttonShine { 0%, 72%, 100% { left: -45%; } 88% { left: 125%; } }
.welcome::before {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
  background-size: 58px 58px;
  content: "";
  mask-image: linear-gradient(to bottom, black, transparent 85%);
  pointer-events: none;
}
.welcome-header, .welcome-layout, .welcome-footer { position: relative; z-index: 1; }
.welcome-header {
  display: flex;
  width: 100%;
  max-width: 1280px;
  align-items: center;
  justify-content: space-between;
  margin: 0 auto auto;
  padding: 4px 0 34px;
}
.welcome-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #f5f2fb;
  font: 700 19px "Manrope", sans-serif;
  letter-spacing: -.04em;
}
.welcome-brand-mark {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(190, 169, 255, .23);
  border-radius: 11px;
  background: linear-gradient(145deg, rgba(167, 139, 250, .24), rgba(103, 232, 210, .08));
  color: #c4b5fd;
}
.welcome-header-note { color: #8f93a3; font-size: 12px; }
.welcome-layout {
  display: grid;
  width: 100%;
  max-width: 1280px;
  grid-template-columns: minmax(0, 1.05fr) minmax(380px, .95fr);
  align-items: center;
  gap: clamp(46px, 8vw, 120px);
  margin: 0 auto;
}
.hero { max-width: 610px; text-align: left; }
.welcome-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 22px;
  color: #c1aaff;
  font-size: 10px;
}
.eyebrow-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #67e8d2;
  box-shadow: 0 0 14px rgba(103, 232, 210, .75);
}
.hero h1 {
  margin: 0;
  font-size: clamp(52px, 6.4vw, 82px);
  font-weight: 600;
  letter-spacing: -.075em;
  line-height: 1.02;
}
.gradient {
  background: linear-gradient(100deg, #c8b5ff 5%, #a890f5 48%, #83e1d0 100%);
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero p {
  max-width: 500px;
  margin: 24px 0 28px;
  color: #a1a4b3;
  font-size: 16px;
  line-height: 1.8;
}
.welcome-actions { display: flex; align-items: center; gap: 16px; }
.welcome-cta { flex-shrink: 0; padding: 14px 20px; white-space: nowrap; }
.welcome-note { color: #777c8b; font-size: 11px; }
.feature-row {
  justify-content: flex-start;
  gap: 8px;
  margin: 30px 0 0;
}
.pill {
  padding: 8px 11px;
  border-color: rgba(255, 255, 255, .075);
  background: rgba(255, 255, 255, .025);
  color: #a3a6b4;
  font-size: 10px;
}
.welcome-preview {
  position: relative;
  padding: 25px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(26, 28, 42, .94), rgba(15, 17, 27, .91));
  box-shadow: 0 36px 100px rgba(0, 0, 0, .42), 0 0 90px rgba(134, 98, 218, .1);
  transform: rotate(1.1deg);
}
.welcome-preview::before {
  position: absolute;
  z-index: -1;
  inset: 15% -12% -13% 20%;
  border-radius: 50%;
  background: rgba(133, 99, 222, .15);
  content: "";
  filter: blur(60px);
}
.preview-top, .preview-heading, .preview-stats, .preview-next { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.preview-top { padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,.075); }
.preview-brand { color: #f4f0fc; font: 700 12px "Manrope", sans-serif; }
.preview-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(135deg, #a78bfa, #63cbbd);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}
.preview-heading { align-items: end; margin: 22px 0 15px; }
.preview-label { color: #9296a7; font-size: 11px; }
.preview-time { margin-top: 6px; color: #f3effa; font: 600 29px "Manrope", sans-serif; letter-spacing: -.05em; }
.preview-period { color: #67e8d2; font-size: 10px; }
.preview-chart {
  display: flex;
  height: 126px;
  align-items: end;
  gap: 12px;
  padding: 14px 8px 0;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.preview-day { display: flex; height: 100%; flex: 1; flex-direction: column; justify-content: end; gap: 8px; text-align: center; }
.preview-day i {
  display: block;
  min-height: 9px;
  border-radius: 6px 6px 2px 2px;
  background: linear-gradient(180deg, #8ce1d3, #8c72dd);
  opacity: .84;
}
.preview-day small { padding-bottom: 8px; color: #7f8392; font-size: 9px; }
.preview-stats { justify-content: flex-start; gap: 22px; padding: 17px 0; }
.preview-stat strong { display: block; color: #f1edf8; font: 600 15px "Manrope", sans-serif; }
.preview-stat small { color: #818595; font-size: 9px; }
.preview-next {
  justify-content: flex-start;
  padding: 13px;
  border: 1px solid rgba(255,255,255,.075);
  border-radius: 13px;
  background: rgba(255,255,255,.028);
}
.preview-next-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 10px;
  background: rgba(167,139,250,.13);
  color: #c3afff;
}
.preview-next-copy { flex: 1; }
.preview-next-copy strong { display: block; color: #ebe8f2; font-size: 10px; }
.preview-next-copy small, .preview-next-time { color: #898d9c; font-size: 9px; }
.welcome-footer {
  display: flex;
  width: 100%;
  max-width: 1280px;
  justify-content: space-between;
  margin: auto auto 0;
  padding-top: 44px;
  color: #6f7382;
  font-size: 10px;
}
.welcome-footer span:last-child { color: #8a8e9d; }

.theme-violet { --theme-primary: #a78bfa; --theme-secondary: #67e8d2; --theme-rgb: 167, 139, 250; --theme-glow: rgba(116, 82, 210, .25); }
.theme-ocean { --theme-primary: #38bdf8; --theme-secondary: #5eead4; --theme-rgb: 56, 189, 248; --theme-glow: rgba(14, 116, 168, .27); }
.theme-rose { --theme-primary: #fb7185; --theme-secondary: #c084fc; --theme-rgb: 251, 113, 133; --theme-glow: rgba(190, 46, 106, .25); }
.theme-amber { --theme-primary: #fbbf24; --theme-secondary: #fb923c; --theme-rgb: 251, 191, 36; --theme-glow: rgba(174, 105, 20, .24); }
.theme-violet .primary-btn, .theme-ocean .primary-btn, .theme-rose .primary-btn, .theme-amber .primary-btn {
  background: linear-gradient(110deg, var(--theme-primary), var(--theme-secondary));
  box-shadow: 0 9px 25px rgba(var(--theme-rgb), .2);
}
.theme-violet .brand span, .theme-ocean .brand span, .theme-rose .brand span, .theme-amber .brand span,
.theme-violet .eyebrow, .theme-ocean .eyebrow, .theme-rose .eyebrow, .theme-amber .eyebrow,
.theme-violet .welcome-eyebrow, .theme-ocean .welcome-eyebrow, .theme-rose .welcome-eyebrow, .theme-amber .welcome-eyebrow {
  color: var(--theme-primary);
}
.theme-violet .gradient, .theme-ocean .gradient, .theme-rose .gradient, .theme-amber .gradient {
  background-image: linear-gradient(100deg, var(--theme-primary), var(--theme-secondary));
}
.theme-violet .nav-btn.active, .theme-ocean .nav-btn.active, .theme-rose .nav-btn.active, .theme-amber .nav-btn.active {
  background: linear-gradient(100deg, rgba(var(--theme-rgb), .2), rgba(var(--theme-rgb), .055));
  box-shadow: inset 2px 0 var(--theme-primary);
}
.theme-violet .bar, .theme-ocean .bar, .theme-rose .bar, .theme-amber .bar {
  background: linear-gradient(90deg, var(--theme-primary), var(--theme-secondary));
}
.welcome.theme-violet, .welcome.theme-ocean, .welcome.theme-rose, .welcome.theme-amber,
.theme-violet .welcome, .theme-ocean .welcome, .theme-rose .welcome, .theme-amber .welcome {
  background:
    radial-gradient(ellipse at 78% 38%, var(--theme-glow), transparent 37rem),
    radial-gradient(ellipse at 16% 88%, rgba(var(--theme-rgb), .12), transparent 30rem),
    radial-gradient(ellipse at 34% 8%, rgba(77, 102, 196, .12), transparent 30rem),
    #080a15;
}
.welcome-header .theme-picker { z-index: 2; }
.theme-picker { position: relative; }
.theme-picker-trigger { display: inline-flex; align-items: center; gap: 9px; }
.theme-picker-trigger i, .theme-swatch i { display: block; width: 13px; height: 13px; border-radius: 50%; background: linear-gradient(135deg, var(--swatch-primary), var(--swatch-secondary)); }
.theme-menu {
  position: absolute;
  z-index: 80;
  top: calc(100% + 10px);
  right: 0;
  width: 228px;
  padding: 14px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 16px;
  background: rgba(18, 20, 31, .97);
  box-shadow: 0 18px 48px rgba(0,0,0,.35);
  backdrop-filter: blur(18px);
}
.theme-menu-title { margin: 0 0 10px; color: #ece9f5; font-size: 12px; font-weight: 700; }
.theme-menu-options { display: grid; gap: 5px; }
.theme-swatch {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #b9bbca;
  text-align: left;
}
.theme-swatch:hover, .theme-swatch[aria-pressed="true"] { border-color: rgba(var(--theme-rgb), .4); background: rgba(var(--theme-rgb), .09); color: #fff; }
.theme-swatch i { width: 16px; height: 16px; }
.theme-swatch-check { margin-left: auto; color: var(--theme-primary); }
.welcome-header .theme-picker-trigger { background: rgba(255,255,255,.035); }
.welcome-brand { border: 0; padding: 0; background: none; }
.welcome-brand-mark { background: linear-gradient(145deg, rgba(var(--theme-rgb), .24), rgba(var(--theme-rgb), .08)); color: var(--theme-primary); }
.welcome-preview {
  border-color: rgba(255,255,255,.16);
  background:
    radial-gradient(ellipse at 88% 4%, rgba(var(--theme-rgb), .11), transparent 45%),
    linear-gradient(145deg, rgba(26, 28, 42, .9), rgba(15, 17, 27, .86));
  backdrop-filter: blur(18px);
  box-shadow: 0 30px 80px rgba(0,0,0,.38), 0 0 70px rgba(var(--theme-rgb), .09);
  transform: none;
  animation: none;
}
.welcome-preview:hover { animation-play-state: paused; border-color: rgba(var(--theme-rgb), .28); box-shadow: 0 42px 110px rgba(0,0,0,.46), 0 0 105px rgba(var(--theme-rgb), .14); }
.welcome-preview .preview-top { padding-bottom: 18px; }
.welcome-preview .preview-brand { font-size: 13px; }
.welcome-preview .preview-avatar { width: 34px; height: 34px; font-size: 12px; }
.welcome-preview .welcome-demo-tab { padding: 8px 12px; font-size: 11px; }
.welcome-preview .preview-heading { margin: 20px 0 16px; }
.welcome-preview .preview-label { color: #c0c3d0; font-size: 13px; }
.welcome-preview .preview-time { font-size: 34px; }
.welcome-preview .preview-period { font-size: 11px; }
.welcome-preview .preview-chart { height: 142px; }
.welcome-preview .preview-day { gap: 9px; }
.welcome-preview .preview-day i { min-height: 11px; opacity: 1; animation: none; box-shadow: 0 3px 12px rgba(var(--theme-rgb), .12); }
.welcome-preview .preview-day small { color: #c0c3d0; font-size: 10px; }
.welcome-preview .preview-stats { gap: 28px; padding: 20px 0; }
.welcome-preview .preview-stat strong { color: #fff; font-size: 18px; }
.welcome-preview .preview-stat small { color: #b2b5c3; font-size: 11px; }
.welcome-preview .preview-next { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.045); }
.welcome-preview .preview-next-icon { width: 38px; height: 38px; flex-basis: 38px; }
.welcome-preview .preview-next-copy strong { color: #fff; font-size: 12px; }
.welcome-preview .preview-next-copy small, .welcome-preview .preview-next-time { color: #b2b5c3; font-size: 10px; }
.welcome-preview .welcome-demo-content { animation: welcomeContentIn .25s ease both; }
.welcome-cta { position: relative; overflow: hidden; padding: 14px 20px; white-space: nowrap; }
.welcome-cta::after {
  position: absolute;
  inset: -60% auto -60% -45%;
  width: 32%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.26), transparent);
  content: "";
  transform: skewX(-22deg);
  animation: buttonShine 6.5s 1.4s ease-in-out infinite;
}
.welcome-cta span { display: inline-block; transition: transform .2s ease; }
.welcome-cta:hover span { transform: translateX(4px); }
.welcome .hero > .welcome-eyebrow { animation: welcomeRise .65s .05s both; }
.welcome .hero h1 { animation: welcomeRise .75s .12s both; }
.welcome .hero p { animation: welcomeRise .75s .2s both; }
.welcome .hero .welcome-actions { animation: welcomeRise .75s .28s both; }
.welcome .hero .feature-row { animation: welcomeRise .75s .36s both; }
.welcome-header { animation: welcomeReveal .7s ease both; }
.welcome-footer { animation: welcomeReveal .8s .45s ease both; }
.welcome .pill { transition: transform .2s ease, border-color .2s ease, color .2s ease, background .2s ease; }
.welcome .pill:hover { transform: translateY(-3px); border-color: rgba(var(--theme-rgb), .3); background: rgba(var(--theme-rgb), .07); color: #e9e5f3; }
.welcome-demo-controls { display: flex; gap: 6px; margin-bottom: 19px; }
.welcome-demo-tab {
  padding: 7px 10px;
  border: 1px solid rgba(255,255,255,.075);
  border-radius: 9px;
  background: transparent;
  color: #9296a7;
  font-size: 10px;
  transition: .2s ease;
}
.welcome-demo-tab:hover, .welcome-demo-tab[aria-pressed="true"] { border-color: rgba(var(--theme-rgb), .4); background: rgba(var(--theme-rgb), .1); color: #f4f0fc; }
.welcome-demo-tab:hover { transform: translateY(-2px); }
.welcome-demo-tab:focus-visible, .theme-picker-trigger:focus-visible, .theme-swatch:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 3px;
}
.welcome-preview .preview-avatar, .welcome-preview .preview-day i {
  background: linear-gradient(145deg, var(--theme-primary), var(--theme-secondary));
}
.welcome-preview .preview-period, .welcome-preview .preview-next-icon { color: var(--theme-secondary); }
.welcome-preview .preview-next-icon { background: rgba(var(--theme-rgb), .13); }
.welcome-demo-content { animation: welcomeContentIn .35s ease both; }
.welcome-header-note { display: inline-flex; align-items: center; gap: 8px; }
.welcome-online-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--theme-secondary); box-shadow: 0 0 12px var(--theme-secondary); animation: onlinePulse 2s ease-in-out infinite; }
.welcome-footer { align-items: center; }
.sf-app, .welcome, .auth { transition: background .35s ease, color .25s ease; }
@keyframes previewFloat { 0%, 100% { transform: rotate(1.25deg) translateY(0); } 50% { transform: rotate(-.25deg) translateY(-12px); } }
@keyframes welcomeContentIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes onlinePulse { 50% { opacity: .45; } }
@keyframes chartGrow { from { transform: scaleY(.08); opacity: .4; } to { transform: scaleY(1); opacity: .84; } }

@media(max-width: 900px) {
  .welcome { padding: 24px 7vw; }
  .welcome-layout { grid-template-columns: minmax(0, 1fr) minmax(300px, .85fr); gap: 32px; }
  .welcome-preview { padding: 19px; }
  .welcome-preview-float.focus { right: 0; }
  .welcome-preview-float.ai { left: 0; }
  .hero h1 { font-size: clamp(48px, 7vw, 68px); }
}
@media(max-width: 700px) {
  .welcome { justify-content: flex-start; padding: 20px 22px 24px; }
  .welcome-header { padding-bottom: 48px; }
  .welcome-header-note { display: none; }
  .welcome-layout { grid-template-columns: 1fr; gap: 38px; }
  .hero { max-width: none; }
  .hero h1 { font-size: clamp(48px, 13vw, 68px); }
  .hero p { margin: 18px 0 22px; font-size: 14px; }
  .welcome-note { display: none; }
  .feature-row { margin-top: 22px; }
  .welcome-preview { width: min(100%, 460px); justify-self: center; transform: none; }
  .welcome-footer { margin-top: 38px; padding-top: 0; }
  .welcome-demo-controls { overflow-x: auto; }
  .welcome-demo-tab { white-space: nowrap; }
  .welcome-atmosphere-orbit { right: -58%; width: 105vw; }
  .welcome-preview-float { display: none; }
  .dashboard-quote { align-items: flex-start; padding: 15px; }
  .dashboard-quote-mark { font-size: 34px; }
  .dashboard-quote-text { font-size: 12px; }
}
@media(prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}

.notes-layout { display:grid; grid-template-columns:minmax(280px,.78fr) minmax(0,1.22fr); gap:18px; align-items:start; }
.notes-form { display:grid; gap:13px; }
.notes-form textarea { min-height:260px; line-height:1.7; }
.notes-list { display:grid; gap:10px; max-height:660px; overflow-y:auto; padding-right:3px; }
.notes-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:14px; }
.notes-toolbar input { min-width:0; }
.note-card { width:100%; text-align:left; color:inherit; cursor:pointer; }
.note-card.selected { border-color:rgba(167,139,250,.55); background:rgba(167,139,250,.09); }
.note-content { max-height:340px; overflow:auto; white-space:pre-wrap; color:#c5c8d4; line-height:1.8; }
.note-subject { color:#c4b5fd; }
.notes-status { min-height:20px; font-size:12px; }
@media(max-width:800px) { .notes-layout { grid-template-columns:1fr; } .notes-list { max-height:430px; } }
.dashboard-settings {
  display:grid; gap:12px; margin-bottom:16px;
  background: linear-gradient(180deg, rgba(18,21,34,0.76), rgba(10,13,22,0.72));
  border: 1px solid rgba(255,255,255,.07);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 16px 42px rgba(0,0,0,.14);
  backdrop-filter: blur(16px);
}
.dashboard-setting-group { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.dashboard-setting-label { width:100%; color:#9298aa; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
.dashboard-setting-chip {
  display:inline-flex; align-items:center; gap:7px; padding:7px 10px; border:1px solid rgba(255,255,255,.09); border-radius:12px; background: rgba(255,255,255,.025);
  color:#c4c8d4; font-size:12px; box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
}
.dashboard-stat-card { width:100%; color:inherit; cursor:pointer; text-align:left; }
.dashboard-stat-card:focus-visible, .schedule-drop:focus-visible, .flashcard:focus-visible { outline:2px solid #a78bfa; outline-offset:3px; }
.dashboard-task { display:flex; align-items:center; gap:11px; }
.dashboard-task-copy { flex:1; min-width:0; }
.dashboard-task-copy b { display:block; overflow-wrap:anywhere; }
.dashboard-toggle { border-radius:8px; }
.schedule-week { display:grid; grid-template-columns:repeat(7,minmax(160px,1fr)); gap:11px; overflow-x:auto; padding:3px 3px 12px; }
.schedule-drop { min-height:205px; padding:11px; border:1px dashed rgba(255,255,255,.14); border-radius:15px; background:rgba(255,255,255,.015); transition:background .2s,border-color .2s; }
.schedule-drop.drag-over { border-color:#a78bfa; background:rgba(167,139,250,.09); }
.schedule-day-title { margin:0 0 10px; }
.schedule-task-card { display:grid; gap:8px; margin-bottom:8px; cursor:grab; }
.schedule-task-card:active { cursor:grabbing; }
.schedule-task-card select,.schedule-task-card input { padding:7px 8px; font-size:11px; }
.flashcard { display:grid; min-height:230px; width:100%; place-items:center; padding:26px; border:1px solid rgba(167,139,250,.22); border-radius:20px; background:radial-gradient(ellipse at 85% 15%,rgba(167,139,250,.13),transparent 48%),rgba(255,255,255,.025); color:inherit; text-align:center; cursor:pointer; }
.flashcard-answer { color:#c1c4d1; line-height:1.8; white-space:pre-wrap; }
.flashcard-rating { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; }
.flashcard-rating button { min-width:85px; }
.mobile-nav { overflow-x:auto; justify-content:flex-start; gap:4px; scrollbar-width:none; }
.mobile-nav::-webkit-scrollbar { display:none; }
.mobile-nav .nav-btn { flex:0 0 42px; }

body { font-size: 15px; line-height: 1.6; }
.muted { font-size: 14px; }
.sf-app .title { color: #f7f5fc; }
.sf-app .card-title { color: #f1eef8; font-size: 18px; }
.sf-app .stat-value, .sf-app .goal-number { color: var(--theme-primary, #c4b5fd); }
.sf-app .stat-label { color: #b7bbca; font-size: 14px; }
.nav-section, .eyebrow { font-size: 11px; }
.nav-btn { font-size: 14px; font-weight: 600; }
.tag, .subject-mini, .ai-quick, .ai-mode-label, .dashboard-setting-chip { font-size: 13px; }
.ai-message-name, .ai-message-save { font-size: 12px; }
.dashboard-quote-label, .dashboard-setting-label { font-size: 12px; }
.welcome-eyebrow, .welcome .pill, .welcome-footer { font-size: 12px; }
.welcome-preview .welcome-demo-tab { font-size: 12px; }
.welcome-preview .preview-label, .welcome-preview .preview-period { font-size: 13px; }
.welcome-preview .preview-day small { font-size: 11px; }
.welcome-preview .preview-stat small { color: #c0c2ce; font-size: 12px; }
.welcome-preview .preview-next-copy strong { font-size: 13px; }
.welcome-preview .preview-next-copy small, .welcome-preview .preview-next-time { color: #c0c2ce; font-size: 12px; }
.notes-status { font-size: 13px; }
.schedule-task-card select, .schedule-task-card input { font-size: 13px; }
.welcome .welcome-brand { color: #fbfaff; font-size: 21px; font-weight: 800; }
.welcome .welcome-header-note { color: #c4c7d4; font-size: 13px; }
.welcome .hero h1 {
  color: #fbfaff;
  font-family: "Manrope", sans-serif;
  font-size: clamp(54px, 6.5vw, 86px);
  font-weight: 800;
  letter-spacing: -.07em;
  line-height: 1.04;
  text-shadow: 0 8px 38px rgba(8, 9, 18, .45);
}
.welcome .gradient {
  background-image: linear-gradient(100deg, #f1eaff 0%, var(--theme-primary, #c4b5fd) 45%, var(--theme-secondary, #67e8d2) 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 5px 18px rgba(var(--theme-rgb, 167, 139, 250), .15));
}
.welcome .hero p { color: #c4c7d4; font-size: 17px; line-height: 1.8; }
.welcome .welcome-eyebrow { color: #d4c8ff; font-size: 13px; font-weight: 700; }
.welcome .pill {
  border-color: rgba(202, 190, 255, .18);
  background: rgba(22, 22, 36, .72);
  color: #e0ddec;
  font-size: 13px;
  font-weight: 600;
}
.welcome .backend-status {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-top: 16px;
  padding: 10px 13px;
  border: 1px solid rgba(202, 190, 255, .18);
  border-radius: 99px;
  background: rgba(22, 22, 36, .72);
  color: #d7d8e3;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: border-color .2s ease, background .2s ease;
}
.welcome .backend-status:hover { border-color: rgba(var(--theme-rgb), .5); background: rgba(var(--theme-rgb), .08); }
.welcome .backend-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; }
.welcome .backend-status.ready .backend-status-dot { background: #34d399; box-shadow: 0 0 10px rgba(52, 211, 153, .55); }
.welcome .backend-status.ai-unconfigured .backend-status-dot { background: #fbbf24; }
.welcome .backend-status.offline .backend-status-dot { background: #fb7185; }
.welcome .welcome-footer { color: #a7aaba; font-size: 12px; }
.welcome .welcome-footer span:last-child { color: #c4c7d4; }
.welcome-preview .preview-brand { color: #fbfaff; font-size: 14px; }
.welcome-preview .preview-label, .welcome-preview .preview-period,
.welcome-preview .preview-day small, .welcome-preview .preview-stat small,
.welcome-preview .preview-next-copy small, .welcome-preview .preview-next-time { color: #c5c7d3; }
.welcome-preview .preview-day small, .welcome-preview .preview-stat small,
.welcome-preview .preview-next-copy small, .welcome-preview .preview-next-time { font-size: 12px; }
.welcome-preview .preview-next-copy strong { font-size: 14px; font-weight: 700; }
.welcome-preview .welcome-demo-tab { color: #d6d5e0; font-size: 13px; }
@media(max-width: 700px) {
  .welcome .hero h1 { font-size: clamp(48px, 12.5vw, 68px); }
  .welcome .hero p { color: #c9cbd7; font-size: 16px; }
  .welcome .welcome-eyebrow, .welcome .pill { font-size: 12px; }
  .welcome .welcome-footer { font-size: 11px; }
  .dashboard-quote-text { font-size: 14px; }
  .welcome-footer { font-size: 11px; }
}
@media(prefers-reduced-motion: reduce) {
  .content-view { animation: none; }
  .background-transition { animation: none; }
  .item, .dashboard-stat-card, .note-card, .flashcard, .check, .task-title {
    transition-duration: .01ms;
    animation-duration: .01ms;
  }
}

/* ---------- Premium polish (additive) ---------- */
.pw-field { position: relative; }
.pw-field input { padding-right: 76px; }
.pw-toggle { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); min-width: 64px; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 10px; background: rgba(148, 163, 184, 0.12); color: #c7d2fe; transition: color .18s ease, background-color .18s ease, transform .18s ease; }
.pw-toggle:hover:not(:disabled) { color: var(--theme-primary, #a78bfa); background: rgba(var(--theme-rgb, 167, 139, 250), .12); }
.pw-toggle:focus-visible, .chip-btn:focus-visible { outline: 2px solid var(--theme-primary, #a78bfa); outline-offset: 2px; }
.pw-toggle-text { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; }
.pw-hint { margin-top: 6px; font-size: 12.5px; color: #f5c26b; }
.pw-meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 9px; }
.pw-meter span { height: 4px; border-radius: 99px; background: rgba(255,255,255,.09); transition: background-color .25s ease; }
.pw-meter span.on.s1 { background: #fb7185; }
.pw-meter span.on.s2 { background: #fbbf24; }
.pw-meter span.on.s3 { background: #67e8d2; }
.pw-meter span.on.s4 { background: #34d399; }
.pw-meter-label { margin-top: 6px; font-size: 12.5px; color: #8f9ab2; }
.attempts { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #b7bbca; line-height: 1.5; }
.attempt-dots { display: flex; gap: 5px; flex-shrink: 0; }
.attempt-dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.14); }
.attempt-dots i.used { background: #fb7185; box-shadow: 0 0 9px rgba(251,113,133,.6); }
.lock-banner { border: 1px solid rgba(251,113,133,.35); background: rgba(251,113,133,.08); color: #ffb3bf; padding: 12px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.6; }
.lock-banner b { font-variant-numeric: tabular-nums; font-size: 15px; }

.focus-panel {
  display: grid; grid-template-columns: auto minmax(0, 1.25fr) minmax(0, 1fr); gap: clamp(18px, 3vw, 36px); align-items: center; margin-bottom: 16px; position: relative; overflow: hidden;
  background:
    linear-gradient(135deg, rgba(18,21,33,0.9), rgba(10,13,22,0.76) 42%, rgba(13,17,28,0.86)),
    radial-gradient(circle at 18% 18%, rgba(var(--theme-rgb, 167, 139, 250), 0.18), transparent 33%),
    radial-gradient(circle at 78% 100%, rgba(34,211,238,0.12), transparent 30%);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 20px 50px rgba(0,0,0,.18), 0 0 0 1px rgba(var(--theme-rgb, 167, 139, 250), .04);
  backdrop-filter: blur(16px);
}
.focus-panel::before {
  content: ""; position: absolute; inset: auto 18px 18px auto; width: 170px; height: 170px; border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--theme-rgb, 167, 139, 250), .17), transparent 70%);
  filter: blur(18px); pointer-events: none;
}
.focus-panel::after { content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(var(--theme-rgb, 167, 139, 250), .75), transparent); pointer-events: none; }
.focus-ring {
  width: 138px; height: 138px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--theme-primary, #a78bfa) 0 var(--goal, 0%), rgba(255,255,255,.08) var(--goal, 0%) 100%);
  box-shadow: 0 0 0 8px rgba(var(--theme-rgb, 167, 139, 250), .05), 0 0 40px rgba(var(--theme-rgb, 167, 139, 250), .18), inset 0 1px 0 rgba(255,255,255,.18);
  flex-shrink: 0; position: relative; isolation: isolate;
}
.focus-ring::before {
  content: ""; position: absolute; inset: -8px; border-radius: 50%; border: 1px solid rgba(var(--theme-rgb, 167, 139, 250), .18); background: transparent;
}
.focus-ring-inner {
  width: 112px; height: 112px; border-radius: 50%; background: linear-gradient(180deg, rgba(17,20,32,0.96), rgba(8,11,18,0.96)); display: grid; place-content: center; text-align: center; gap: 2px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
}
.sf-app.light .focus-ring-inner { background: linear-gradient(180deg, #ffffff, #f6f8ff); }
.focus-ring-inner b { font: 800 28px "Manrope", sans-serif; letter-spacing: -.04em; color: var(--theme-primary, #c4b5fd); }
.focus-ring-inner span { font-size: 12px; color: #8f9ab2; }
.focus-main {
  display: flex; flex-direction: column; justify-content: center; min-width: 0; padding-right: 6px;
}
.focus-main .card-title {
  margin-bottom: 4px; font-size: 1.05rem;
}
.focus-main h2.card-title { font-size: clamp(1.35rem, 2vw, 2rem); letter-spacing: -.04em; }
.focus-main p { max-width: 48ch; margin: 0; }
.focus-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 10px; }
.chip-btn {
  border: 1px solid rgba(var(--theme-rgb, 167, 139, 250), .28);
  background: rgba(var(--theme-rgb, 167, 139, 250), .08); color: inherit; padding: 7px 14px; border-radius: 99px; font-weight: 600; font-size: 13px;
  transition: background-color .18s ease, border-color .18s ease, transform .18s ease, box-shadow .18s ease;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
}
.chip-btn:hover:not(:disabled) { background: rgba(var(--theme-rgb, 167, 139, 250), .18); border-color: rgba(var(--theme-rgb, 167, 139, 250), .55); box-shadow: 0 0 0 1px rgba(var(--theme-rgb, 167, 139, 250), .12); }
.chip-btn:active { transform: scale(.97); }
.chip-btn.active {
  background: linear-gradient(135deg, rgba(var(--theme-rgb, 167, 139, 250), .28), rgba(var(--theme-rgb, 167, 139, 250), .14)); border-color: rgba(var(--theme-rgb, 167, 139, 250), .68);
  box-shadow: 0 0 18px rgba(var(--theme-rgb, 167, 139, 250), .1);
}
.focus-meta {
  display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 13.5px; color: #a8b0c4;
}
.focus-meta span {
  display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.05);
}
.focus-meta b { color: #eef2ff; }
.sf-app.light .focus-meta b { color: #172033; }
.focus-week {
  display: flex; flex-direction: column; justify-content: center; min-width: 0; padding-left: 10px; border-left: 1px solid rgba(255,255,255,.08);
  background: linear-gradient(90deg, rgba(255,255,255,.015), rgba(255,255,255,0));
}
.focus-week-head { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: #8f9ab2; margin-bottom: 6px; }
.focus-week-head b { color: var(--theme-primary, #c4b5fd); font-weight: 700; }

.wb { width: 100%; padding-top: 18px; }
.wb-plot { position: relative; display: flex; align-items: flex-end; gap: 8px; height: 72px; border-bottom: 1px solid rgba(255,255,255,.1); }
.wb.tall .wb-plot { height: 170px; gap: 14px; }
.wb-col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.wb-col i { display: block; width: 100%; min-height: 3px; border-radius: 7px 7px 2px 2px; background: rgba(var(--theme-rgb, 167, 139, 250), .38); transition: height .5s ease; }
.wb-col i.empty { background: rgba(255,255,255,.08); }
.wb-col i.met { background: linear-gradient(180deg, var(--theme-secondary, #67e8d2), var(--theme-primary, #a78bfa)); box-shadow: 0 0 14px rgba(var(--theme-rgb, 167, 139, 250), .35); }
.wb-col i.today { outline: 1px solid rgba(var(--theme-rgb, 167, 139, 250), .9); outline-offset: 2px; }
.wb-goal { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(var(--theme-rgb, 167, 139, 250), .55); pointer-events: none; z-index: 1; }
.wb-goal em { position: absolute; right: 0; top: -17px; font-size: 10.5px; font-style: normal; color: var(--theme-primary, #a78bfa); }
.wb-labels { display: flex; gap: 8px; margin-top: 8px; }
.wb.tall .wb-labels { gap: 14px; }
.wb-label { flex: 1; text-align: center; display: grid; gap: 2px; }
.wb-label small { font-size: 11px; color: #7e899f; }
.wb-label small.is-today { color: var(--theme-primary, #a78bfa); font-weight: 700; }
.wb-label strong { font-size: 12.5px; font-weight: 700; }

.week-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 6px 0 12px; }
.week-stat { padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,.07); background: rgba(255,255,255,.025); }
.week-stat span { display: block; font-size: 12.5px; color: #8f9ab2; }
.week-stat b { display: block; margin-top: 4px; font: 700 20px "Manrope", sans-serif; letter-spacing: -.03em; }
.sf-app.light .week-stat { border-color: #e2e6f3; background: #fff; }
.goal-setter { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.07); }
.inline-form { display: flex; gap: 8px; }
.inline-form input { flex: 1; min-width: 0; }

.sf-app .primary-btn { position: relative; overflow: hidden; }
.sf-app .primary-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.18) 50%, transparent 65%); transform: translateX(-120%); transition: transform .6s ease; pointer-events: none; }
.sf-app .primary-btn:hover:not(:disabled)::after { transform: translateX(120%); }
.primary-btn:focus-visible, .ghost-btn:focus-visible { outline: 2px solid var(--theme-primary, #a78bfa); outline-offset: 2px; }
.sf-app *::-webkit-scrollbar, .auth *::-webkit-scrollbar { width: 10px; height: 10px; }
.sf-app *::-webkit-scrollbar-thumb { background: rgba(var(--theme-rgb, 167, 139, 250), .25); border-radius: 99px; }
.sf-app ::selection, .auth ::selection { background: rgba(var(--theme-rgb, 167, 139, 250), .35); }

@media (max-width: 960px) {
  .focus-panel { grid-template-columns: auto minmax(0, 1fr); }
  .focus-week { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
  .focus-panel { grid-template-columns: 1fr; justify-items: center; text-align: center; }
  .focus-panel .focus-chips, .focus-panel .focus-meta { justify-content: center; }
  .focus-week { width: 100%; }
  .week-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .wb-col i, .chip-btn, .pw-toggle, .sf-app .primary-btn::after { transition-duration: .01ms; }
}
`;

/* -----------------------------------------------------------
   LAYOUT
----------------------------------------------------------- */

function ThemePicker({ theme, setTheme, menuId }) {
  const [open, setOpen] = useState(false);
  const activeTheme = studyThemes.find((option) => option.id === theme) || studyThemes[0];

  return (
    <div className="theme-picker">
      <button
        className="ghost-btn theme-picker-trigger"
        type="button"
        aria-label={`Customize appearance. Current theme: ${activeTheme.name}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <i style={{ "--swatch-primary": activeTheme.primary, "--swatch-secondary": activeTheme.secondary }} />
        <span className="hide-mobile">Theme</span>
      </button>
      {open && (
        <div className="theme-menu" id={menuId}>
          <p className="theme-menu-title">Choose your accent</p>
          <div className="theme-menu-options" role="group" aria-label="Color themes">
            {studyThemes.map((option) => (
              <button
                className={`theme-swatch theme-${option.id}`}
                key={option.id}
                type="button"
                aria-pressed={theme === option.id}
                onClick={() => {
                  setTheme(option.id);
                  setOpen(false);
                }}
              >
                <i style={{ "--swatch-primary": option.primary, "--swatch-secondary": option.secondary }} />
                <span>{option.name}</span>
                {theme === option.id && <span className="theme-swatch-check" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Atmosphere({ transitionKey }) {
  return (
    <div className="welcome-atmosphere" aria-hidden="true">
      {transitionKey !== undefined && <span className="background-transition" key={transitionKey} />}
      <span className="welcome-atmosphere-orbit" />
      <span className="welcome-atmosphere-glow" />
      <span className="space-planet" />
      <span className="welcome-star-orbit" />
      <span className="welcome-star welcome-star-one" />
      <span className="welcome-star welcome-star-two" />
      <span className="welcome-star welcome-star-three" />
      <span className="welcome-star welcome-star-four" />
      <span className="welcome-star welcome-star-five" />
      <span className="welcome-star welcome-star-six" />
      <span className="welcome-star welcome-star-seven" />
      <span className="welcome-star welcome-star-eight" />
    </div>
  );
}

function Layout({ children, page, navigate, dark, setDark, syncStatus, retrySync, accountEmail, onLogout, signingOut, theme, setTheme }) {
  const items = [
    ["dashboard", "⌂", "Dashboard"],
    ["subjects", "◈", "Subjects"],
    ["tasks", "✓", "Tasks"],
    ["notes", "▤", "Study Notes"],
    ["flashcards", "▣", "Flashcards"],
    ["schedule", "◷", "Schedule"],
    ["progress", "◔", "Progress"],
    ["reminders", "!", "Reminders"],
    ["ai", "✦", "AI Assistant"],
  ];

  return (
    <div className={`sf-app theme-${theme} ${!dark ? "light" : ""}`}>
      <Atmosphere transitionKey={page} />
      <header className="topbar">
        <button className="ghost-btn brand" onClick={() => navigate("dashboard")}>
          ✦ Study<span>Flow</span>
        </button>

        <div className="top-actions">
          <span className="muted hide-mobile" title={accountEmail || "Planner data is private to this browser session"}>
            {accountEmail
              ? syncStatus === "saving" ? "↻ Syncing…" : syncStatus === "error" ? "⚠ Sync issue" : "✓ Account synced"
              : syncStatus === "saving" ? "↻ Syncing…" : syncStatus === "error" ? "⚠ Sync issue" : "✓ Synced · Private browser planner"}
          </span>
          {syncStatus === "error" && <button className="ghost-btn" onClick={retrySync}>Retry sync</button>}
          <button className="icon-btn" onClick={() => setDark((v) => !v)}>
            {dark ? "☀" : "☾"}
          </button>
          <ThemePicker theme={theme} setTheme={setTheme} menuId="app-theme-menu" />
          {accountEmail && <button className="ghost-btn" onClick={onLogout} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>}
          <button className="ghost-btn hide-mobile" onClick={() => navigate("profile")}>
            Profile
          </button>
        </div>
      </header>

      <div className="shell">
        <aside className="sidebar">
          <div className="nav-section">Workspace</div>
          {items.map(([id, icon, label]) => (
            <button
              key={id}
              className={"nav-btn " + (page === id ? "active" : "")}
              onClick={() => navigate(id)}
            >
              <b>{icon}</b>
              {label}
            </button>
          ))}
          <div className="nav-section">Tools</div>
          <button
            className={"nav-btn " + (page === "pomodoro" ? "active" : "")}
            onClick={() => navigate("pomodoro")}
          >
            <b>◉</b> Pomodoro
          </button>
          <button
            className={"nav-btn " + (page === "profile" ? "active" : "")}
            onClick={() => navigate("profile")}
          >
            <b>◉</b> Profile
          </button>
        </aside>

        <main className="content"><div className="content-view" key={page}>{children}</div></main>
      </div>

      <div className="mobile-nav">
        {items.map(([id, icon, label]) => (
          <button
            key={id}
            className={"nav-btn " + (page === id ? "active" : "")}
            aria-label={label}
            title={label}
            onClick={() => navigate(id)}
          >
            <span>{icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------
   ACCOUNT ENTRY
----------------------------------------------------------- */

function Welcome({ onLogin, onRegister, theme, setTheme }) {
  const [preview, setPreview] = useState(0);
  const [backendStatus, setBackendStatus] = useState("checking");
  const loadBackendStatus = useCallback(async () => {
    const response = await fetch("/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const health = await response.json();
    if (!response.ok || !health.success || health.database !== "connected") {
      throw new Error("StudyFlow backend is unavailable.");
    }
    return health.aiConfigured ? "ready" : "ai-unconfigured";
  }, []);

  const checkBackend = async () => {
    setBackendStatus("checking");
    try {
      setBackendStatus(await loadBackendStatus());
    } catch {
      setBackendStatus("offline");
    }
  };

  useEffect(() => {
    let active = true;
    loadBackendStatus()
      .then((status) => {
        if (active) setBackendStatus(status);
      })
      .catch(() => {
        if (active) setBackendStatus("offline");
      });
    return () => {
      active = false;
    };
  }, [loadBackendStatus]);

  const previews = [
    {
      label: "This week",
      heading: "Your week at a glance",
      highlight: "4.5 hrs",
      highlightLabel: "focused this week",
      bars: [35, 55, 42, 78, 50, 92, 64],
      nextTitle: "Biology · Cell structure",
      nextMeta: "Today · 25 min focus session",
      nextIcon: "◉",
    },
    {
      label: "Your streak",
      heading: "Small steps add up",
      highlight: "7 days",
      highlightLabel: "study streak",
      bars: [40, 52, 68, 56, 82, 71, 94],
      nextTitle: "Daily goal · almost there",
      nextMeta: "One focused session to go",
      nextIcon: "✦",
    },
    {
      label: "Focus mode",
      heading: "Make room for focus",
      highlight: "25:00",
      highlightLabel: "until your next break",
      bars: [85, 58, 77, 48, 93, 66, 80],
      nextTitle: "Pomodoro · deep work",
      nextMeta: "Pick a task and get started",
      nextIcon: "◷",
    },
  ];
  const activePreview = previews[preview];

  return (
    <div className={`welcome theme-${theme}`}>
      <Atmosphere />
      <header className="welcome-header">
        <div className="welcome-brand">
          <span className="welcome-brand-mark" aria-hidden="true">✦</span>
          <span>StudyFlow</span>
        </div>
        <div className="welcome-header-note"><span className="welcome-online-dot" /> Your personal study space</div>
        <ThemePicker theme={theme} setTheme={setTheme} menuId="welcome-theme-menu" />
      </header>

      <main className="welcome-layout">
        <section className="hero">
          <div className="welcome-eyebrow"><span className="eyebrow-dot" /> A calmer way to reach your goals</div>
          <h1>Make every study session <span className="gradient">count.</span></h1>
          <p>Plan your week, stay on top of assignments, and learn with an AI study partner — all in one focused space.</p>
          <div className="welcome-actions">
            <button className="primary-btn welcome-cta" onClick={onRegister}>Create your free study space <span aria-hidden="true">→</span></button>
            <button className="ghost-btn" onClick={onLogin}>Log in</button>
          </div>
          <div className="feature-row">
            <span className="pill">✦ AI study assistant</span>
            <span className="pill">◷ Focus sessions</span>
            <span className="pill">▤ Notes & flashcards</span>
          </div>
          <button
            className={`backend-status ${backendStatus}`}
            type="button"
            onClick={checkBackend}
            aria-live="polite"
          >
            <span className="backend-status-dot" aria-hidden="true" />
            {backendStatus === "checking"
              ? "Checking backend…"
              : backendStatus === "ready"
              ? "Backend and AI are ready"
              : backendStatus === "ai-unconfigured"
              ? "Backend connected · AI setup needed"
              : "Backend unavailable · Tap to retry"}
          </button>
        </section>

        <section className="welcome-preview" aria-label="Interactive StudyFlow planner preview">
          <div className="welcome-preview-float focus">
            <i>◷</i>
            <span><strong>25 min focus</strong><small>One session at a time</small></span>
          </div>
          <div className="welcome-preview-float ai">
            <i>✦</i>
            <span><strong>Your AI study partner</strong><small>Ready when you are</small></span>
          </div>
          <div className="preview-top">
            <span className="preview-brand">✦ StudyFlow <span className="muted">/ overview</span></span>
            <span className="preview-avatar">S</span>
          </div>
          <div className="welcome-demo-controls" role="group" aria-label="Planner preview">
            {previews.map((item, index) => (
              <button
                className="welcome-demo-tab"
                key={item.label}
                type="button"
                aria-pressed={preview === index}
                onClick={() => setPreview(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="welcome-demo-content" key={activePreview.label}>
            <div className="preview-heading">
              <div>
                <div className="preview-label">{activePreview.heading}</div>
                <div className="preview-time">{activePreview.highlight}</div>
              </div>
              <div className="preview-period">{activePreview.highlightLabel}</div>
            </div>
            <div className="preview-chart" aria-label={`${activePreview.label} study activity`}>
              {activePreview.bars.map((height, index) => (
                <div className="preview-day" key={`${activePreview.label}-${index}`}>
                  <i style={{ height: `${height}%`, animationDelay: `${index * 55}ms` }} />
                  <small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small>
                </div>
              ))}
            </div>
            <div className="preview-stats">
              <div className="preview-stat"><strong>4</strong><small>subjects</small></div>
              <div className="preview-stat"><strong>82%</strong><small>weekly goal</small></div>
              <div className="preview-stat"><strong>12</strong><small>tasks done</small></div>
            </div>
            <div className="preview-next">
              <span className="preview-next-icon">{activePreview.nextIcon}</span>
              <span className="preview-next-copy"><strong>{activePreview.nextTitle}</strong><small>{activePreview.nextMeta}</small></span>
              <span className="preview-next-time">→</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="welcome-footer">
        <span>Designed for steady progress, not pressure.</span>
        <span>One plan. A little more clarity.</span>
      </footer>
    </div>
  );
}

function EyeIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c5.5 0 9 5.2 10 7-.5.9-1.6 2.5-3.2 3.9M6.6 6.6C4.4 8 2.9 10.2 2 12c1 1.8 4.5 7 10 7 1.6 0 3-.4 4.3-1" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

function PasswordField({ label, value, onChange, placeholder, autoComplete, minLength, disabled, showStrength }) {
  const [visible, setVisible] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const strength = showStrength ? getPasswordStrength(value) : null;
  const trackCaps = (event) => {
    if (event.getModifierState) setCapsOn(event.getModifierState("CapsLock"));
  };

  return (
    <label>
      <div className="muted">{label}</div>
      <div className="pw-field">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          onKeyDown={trackCaps}
          onKeyUp={trackCaps}
          onBlur={() => setCapsOn(false)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={128}
          disabled={disabled}
          spellCheck={false}
          required
        />
        <button
          type="button"
          className="pw-toggle"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
          disabled={disabled}
        >
          <EyeIcon off={visible} />
          <span className="pw-toggle-text">{visible ? "Hide" : "Show"}</span>
        </button>
      </div>
      {capsOn && <div className="pw-hint" role="status">Caps Lock is on.</div>}
      {strength && value && (
        <>
          <div className="pw-meter" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span key={step} className={step <= strength.score ? `on s${strength.score}` : ""} />
            ))}
          </div>
          <div className="pw-meter-label">Password strength: {strength.label}</div>
        </>
      )}
    </label>
  );
}

function AuthScreen({ mode, busy, error, onSubmit, onRecover, onToggleMode, onBack, theme, setTheme, loginGuard, onLockExpired }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [course, setCourse] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isRegistering = mode === "register";
  const isLogin = !isRegistering && !recovering;
  const lockedUntil = loginGuard?.lockedUntil || 0;
  const locked = isLogin && lockedUntil > now;
  const failed = loginGuard?.failed || 0;
  const attemptsLeft = Math.max(0, MAX_LOGIN_ATTEMPTS - failed);
  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  useEffect(() => {
    if (!lockedUntil) return undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) onLockExpired();
    };
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [lockedUntil, onLockExpired]);

  const submit = (event) => {
    event.preventDefault();
    if (locked) return;
    if (recovering) onRecover({ email, recoveryCode, newPassword });
    else onSubmit({ email, password, name, studentClass, course });
  };

  return (
    <div className={`auth theme-${theme}`}>
      <Atmosphere />
      <div className="auth-theme-picker">
        <ThemePicker theme={theme} setTheme={setTheme} menuId="auth-theme-menu" />
      </div>
      <div className="panel auth-card">
        <button className="ghost-btn auth-back" onClick={onBack}>← Welcome</button>
        <div className="eyebrow">STUDYFLOW ACCOUNT</div>
        <h1>{recovering ? "Reset your password." : isRegistering ? "Create your account" : "Welcome back."}</h1>
        <p className="muted">{recovering ? "Use the recovery code you saved to securely reset your password." : isRegistering ? "Save your study space and pick up where you left off." : "Log in to continue to your study planner."}</p>
        <form onSubmit={submit}>
          <label>
            <div className="muted">Email address</div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          {isRegistering && (
            <>
              <label>
                <div className="muted">Your name</div>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" maxLength={80} required />
              </label>
              <label>
                <div className="muted">Standard / Class</div>
                <input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="e.g. Class 12 or 2nd year" maxLength={120} required />
              </label>
              <label>
                <div className="muted">Course</div>
                <input value={course} onChange={(event) => setCourse(event.target.value)} placeholder="e.g. Computer Science" maxLength={160} required />
              </label>
            </>
          )}
          {recovering ? (
            <>
              <label>
                <div className="muted">Recovery code</div>
                <input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="Paste your recovery code" autoComplete="off" required />
              </label>
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 12 characters"
                autoComplete="new-password"
                minLength={12}
                showStrength
              />
            </>
          ) : (
            <PasswordField
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegistering ? "At least 12 characters" : "Enter your password"}
              autoComplete={isRegistering ? "new-password" : "current-password"}
              minLength={isRegistering ? 12 : undefined}
              disabled={locked}
              showStrength={isRegistering}
            />
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {isLogin && !locked && failed > 0 && (
            <div className="attempts" role="status">
              <span className="attempt-dots" aria-hidden="true">
                {Array.from({ length: MAX_LOGIN_ATTEMPTS }, (_, index) => (
                  <i key={index} className={index < failed ? "used" : ""} />
                ))}
              </span>
              {attemptsLeft} {attemptsLeft === 1 ? "attempt" : "attempts"} left before login pauses for 5 minutes.
            </div>
          )}
          {locked && (
            <div className="lock-banner" role="alert">
              Too many incorrect passwords. Login is paused for <b>{countdown}</b>. If you forgot it, use Forgot password with your recovery code.
            </div>
          )}
          <button className="primary-btn" disabled={busy || locked}>
            {locked ? `Try again in ${countdown}` : busy ? "Please wait…" : recovering ? "Reset password →" : isRegistering ? "Create account →" : "Log in →"}
          </button>
        </form>
        {!recovering && !isRegistering && <button className="auth-switch" type="button" onClick={() => setRecovering(true)} style={{ display: "block", margin: "16px auto" }}>Forgot password?</button>}
        {recovering && <button className="auth-switch" type="button" onClick={() => setRecovering(false)} style={{ display: "block", margin: "16px auto" }}>Back to log in</button>}
        {!recovering && (
        <p className="muted" style={{ textAlign: "center", marginBottom: 0 }}>
          {isRegistering ? "Already have an account? " : "New to StudyFlow? "}
          <button className="auth-switch" type="button" onClick={onToggleMode} disabled={busy}>
            {isRegistering ? "Log in" : "Create an account"}
          </button>
        </p>
        )}
      </div>
    </div>
  );
}

function StudentSetup({ profile, onContinue, theme }) {
  const [name, setName] = useState(profile.name === "Student" ? "" : profile.name);
  const [studentClass, setStudentClass] = useState(profile.studentClass || "");
  const [course, setCourse] = useState(profile.course || "");

  const submit = (event) => {
    event.preventDefault();
    onContinue({ name: name.trim(), studentClass: studentClass.trim(), course: course.trim() });
  };

  return (
    <div className={`auth theme-${theme}`}>
      <Atmosphere />
      <div className="panel auth-card">
        <div className="eyebrow">YOUR PRIVATE STUDY SPACE</div>
        <h1>First, a little about you.</h1>
        <p className="muted">Add your student details to personalize your planner. Your details will be saved with your account.</p>
        <form className="list" onSubmit={submit}>
          <label>
            <div className="muted">Your name</div>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Anamika" autoComplete="given-name" maxLength={80} required />
          </label>
          <label>
            <div className="muted">Class / Year <span className="muted">(optional)</span></div>
            <input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="e.g. Class 12 or 2nd year" maxLength={120} />
          </label>
          <label>
            <div className="muted">Course / Program <span className="muted">(optional)</span></div>
            <input value={course} onChange={(event) => setCourse(event.target.value)} placeholder="e.g. Computer Science" maxLength={160} />
          </label>
          <button className="primary-btn">Save details & open planner →</button>
        </form>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------
   DASHBOARD
----------------------------------------------------------- */

function WeekBars({ data, goal, tall }) {
  const max = Math.max(goal, ...data.map((day) => day.total), 1);
  return (
    <div className={"wb" + (tall ? " tall" : "")} role="img" aria-label={`Study minutes for the last 7 days against a ${goal} minute goal`}>
      <div className="wb-plot">
        <span className="wb-goal" style={{ bottom: `${(goal / max) * 100}%` }}><em>{goal} min goal</em></span>
        {data.map((day) => (
          <div className="wb-col" key={day.key} title={`${day.label}: ${day.total} min`}>
            <i
              className={(day.total === 0 ? "empty " : "") + (day.total >= goal ? "met " : "") + (day.isToday ? "today" : "")}
              style={{ height: day.total ? `${Math.max(6, (day.total / max) * 100)}%` : undefined }}
            />
          </div>
        ))}
      </div>
      <div className="wb-labels">
        {data.map((day) => (
          <span className="wb-label" key={day.key}>
            <small className={day.isToday ? "is-today" : ""}>{day.isToday ? "Today" : day.label}</small>
            {tall && <strong>{day.total}</strong>}
          </span>
        ))}
      </div>
    </div>
  );
}

function Dashboard({
  profile,
  navigate,
  subjects,
  tasks,
  exams,
  studySessions,
  setTasks,
  notify,
  preferences,
  setPreferences,
  onRecordStudy,
  onExport,
  onImport,
}) {
  const [timeGreeting, setTimeGreeting] = useState(getIndiaTimeGreeting);
  const [quoteIndex, setQuoteIndex] = useState(() => new Date().getDate() % motivationalQuotes.length);
  const completed = tasks.filter((task) => task.done).length;
  const pending = tasks.filter((task) => !task.done).length;
  const recentSessionTypes = ["Focus", "Revision", "Reading", "Practice", "Deep work"];

  useEffect(() => {
    const updateGreeting = () => setTimeGreeting(getIndiaTimeGreeting());
    const intervalId = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const todayMinutes = getMinutesForDate(studySessions, getTodayKey());

  const goal = Number(profile.dailyGoal) || 60;
  const goalPercent = Math.min(100, Math.round((todayMinutes / goal) * 100));
  const remaining = Math.max(0, goal - todayMinutes);
  const streak = getEffectiveStreak(profile);
  const weekData = useMemo(() => getWeekData(studySessions), [studySessions]);
  const weekTotal = weekData.reduce((sum, day) => sum + day.total, 0);
  const dueToday = tasks.filter((task) => !task.done && task.due && isToday(task.due)).length;
  const overdue = tasks.filter((task) => !task.done && task.due && isPast(task.due)).length;

  const quickLog = (amount, type = "Focus") => {
    onRecordStudy(amount, type);
    notify(todayMinutes < goal && todayMinutes + amount >= goal ? "Daily goal reached 🎉" : `${amount} minutes recorded 🔥`);
  };

  const quickActions = [
    { icon: "⏱️", label: "Focus timer", meta: "Start a sprint", action: () => navigate("pomodoro") },
    { icon: "✓", label: "Add task", meta: "Plan your day", action: () => navigate("tasks") },
    { icon: "📚", label: "Subjects", meta: "Track modules", action: () => navigate("subjects") },
    { icon: "▤", label: "Daily review", meta: "Quick recap", action: () => navigate("flashcards") },
  ];

  const upcomingTasks = tasks
    .filter((task) => !task.done && task.due)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 4);

  const upcomingExams = [...exams]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const examAlerts = upcomingExams.filter((exam) => {
    const days = daysUntil(exam.date);
    return days >= 0 && days <= 7;
  });
  const dashboardAlerts = [
    overdue > 0 ? `${overdue} task${overdue === 1 ? "" : "s"} overdue` : "",
    dueToday > 0 ? `${dueToday} task${dueToday === 1 ? " is" : "s are"} due today` : "",
    examAlerts.length > 0 ? `${examAlerts.length} exam${examAlerts.length === 1 ? "" : "s"} within 7 days` : "",
    goalPercent < 100 && todayMinutes === 0 ? "No study session logged today" : "",
  ].filter(Boolean);
  const statCards = {
    streak: {
      icon: "🔥",
      label: "Study streak",
      value: `${streak} days`,
      detail: streak ? "Keep your momentum" : "Study today to start one",
      page: "progress",
    },
    today: {
      icon: "⏱️",
      label: "Today's study",
      value: `${todayMinutes} min`,
      detail: `${goalPercent}% of your daily goal`,
      page: "progress",
    },
    tasks: {
      icon: "✓",
      label: "Tasks completed",
      value: completed,
      detail: `${pending} pending`,
      page: "tasks",
    },
    subjects: {
      icon: "📚",
      label: "My subjects",
      value: subjects.length,
      detail: "Student-created courses",
      page: "subjects",
    },
  };
  const visibleStats = preferences.stats
    .filter((id) => statCards[id])
    .map((id) => [id, statCards[id]]);
  const sectionEnabled = (id) => preferences.sections[id] !== false;

  const moveStat = (id, direction) => {
    setPreferences((current) => {
      const stats = current.stats.filter((key) => statCards[key]);
      const index = stats.indexOf(id);
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= stats.length) return current;
      [stats[index], stats[nextIndex]] = [stats[nextIndex], stats[index]];
      return { ...current, stats };
    });
  };

  const toggleStat = (id) => {
    setPreferences((current) => ({
      ...current,
      stats: current.stats.includes(id)
        ? current.stats.filter((key) => key !== id)
        : [...current.stats, id],
    }));
  };

  const toggleSection = (id) => {
    setPreferences((current) => ({
      ...current,
      sections: { ...current.sections, [id]: !sectionEnabled(id) },
    }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{timeGreeting}</div>
          <h1 className="title">{profile.name || "Student"}'s command center</h1>
          <div className="muted">{profile.course ? profile.course : "Your personalized study workspace"}</div>
        </div>
        <div className="actions">
          <button className="ghost-btn" onClick={onExport}>↓ Export data</button>
          <label className="ghost-btn" style={{ cursor: "pointer" }}>↑ Import data<input type="file" accept="application/json" onChange={onImport} style={{ display: "none" }} /></label>
          <button className="ghost-btn" onClick={() => navigate("flashcards")}>▤ Daily review</button>
          <button className="ghost-btn" onClick={() => navigate("schedule")}>◷ Plan week</button>
          <button className="ghost-btn" onClick={() => navigate("subjects")}>+ Subject</button>
          <button className="primary-btn" onClick={() => navigate("tasks")}>+ Add task</button>
        </div>
      </div>

      <section className="panel dashboard-quote" aria-label="Motivational thought">
        <span className="dashboard-quote-mark" aria-hidden="true">“</span>
        <div className="dashboard-quote-copy" key={quoteIndex}>
          <div className="dashboard-quote-label">A thought for today</div>
          <div className="dashboard-quote-text">{motivationalQuotes[quoteIndex]}</div>
        </div>
        <button
          className="ghost-btn"
          type="button"
          aria-label="Show another motivational thought"
          onClick={() => setQuoteIndex((index) => (index + 1) % motivationalQuotes.length)}
        >
          <span className="hide-mobile">Another thought</span>
          <span aria-hidden="true"> ↗</span>
        </button>
      </section>

      <section className="panel" aria-label="Study alerts">
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Needs attention</div>
            <h2 className="card-title" style={{ margin: 0 }}>Today’s alerts</h2>
          </div>
          <span className={`tag ${dashboardAlerts.length ? "high" : ""}`}>{dashboardAlerts.length ? `${dashboardAlerts.length} active` : "All clear"}</span>
        </div>
        {dashboardAlerts.length ? (
          <div className="alert-list">
            {dashboardAlerts.map((alert) => <div className="item" key={alert}>⚠ <b>{alert}</b></div>)}
          </div>
        ) : <div className="muted">Your tasks, exams, and study goal are on track.</div>}
      </section>

      <section className="panel feature-strip">
        <div className="row" style={{ marginBottom: 16 }}>
          <div>
            <div className="eyebrow">Quick workflow</div>
            <h2 className="card-title" style={{ margin: 0 }}>Start your next move</h2>
          </div>
          <button className="ghost-btn" onClick={() => navigate("progress")}>Open analytics →</button>
        </div>
        <div className="feature-strip-grid">
          {quickActions.map((item) => (
            <button key={item.label} type="button" className="feature-tile" onClick={item.action}>
              <span className="feature-tile-icon">{item.icon}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.meta}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <details className="panel dashboard-settings">
        <summary className="card-title" style={{ cursor: "pointer", margin: 0 }}>Customize dashboard</summary>
        <div className="dashboard-setting-group">
          <div className="dashboard-setting-label">Stats · use arrows to reorder</div>
          {Object.entries(statCards).map(([id, card]) => {
            const index = preferences.stats.indexOf(id);
            return (
              <span className="dashboard-setting-chip" key={id}>
                <label><input type="checkbox" checked={preferences.stats.includes(id)} onChange={() => toggleStat(id)} style={{ width: "auto" }} /> {card.label}</label>
                <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label={`Move ${card.label} up`} disabled={index <= 0} onClick={() => moveStat(id, -1)}>↑</button>
                <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label={`Move ${card.label} down`} disabled={index < 0 || index >= preferences.stats.length - 1} onClick={() => moveStat(id, 1)}>↓</button>
              </span>
            );
          })}
        </div>
        <div className="dashboard-setting-group">
          <div className="dashboard-setting-label">Dashboard sections</div>
          {[
            ["tasks", "Upcoming tasks"],
            ["exams", "Exam radar"],
            ["subjects", "Subject pulse"],
          ].map(([id, label]) => (
            <label className="dashboard-setting-chip" key={id}>
              <input type="checkbox" checked={sectionEnabled(id)} onChange={() => toggleSection(id)} style={{ width: "auto" }} />
              {label}
            </label>
          ))}
        </div>
      </details>

      <div className="grid stats">
        {visibleStats.map(([id, card]) => (
          <button
            type="button"
            className="panel dashboard-stat-card"
            key={id}
            aria-label={`Open ${card.label}`}
            onClick={() => navigate(card.page)}
          >
            <div className="stat-icon">{card.icon}</div>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{card.value}</div>
            {id === "today" && (
              <div className="progress">
                <div className="bar" style={{ width: `${goalPercent}%` }} />
              </div>
            )}
            <div className="muted">{card.detail}</div>
          </button>
        ))}
        {!visibleStats.length && (
          <div className="panel muted">All stats are hidden. Open Customize dashboard to show one.</div>
        )}
      </div>

      {(sectionEnabled("tasks") || sectionEnabled("exams")) && (
        <div className="grid two" style={{ marginTop: 16 }}>
          {sectionEnabled("tasks") && (
            <div className="panel">
              <div className="row">
                <h2 className="card-title">Upcoming tasks</h2>
                <button className="ghost-btn" onClick={() => navigate("tasks")}>View all</button>
              </div>
              <div className="list">
                {upcomingTasks.map((task) => {
                  const subject = subjects.find((s) => s.id === task.subjectId);
                  const priority = getPriorityInfo(task.priority);
                  return (
                    <div className="item dashboard-task" key={task.id}>
                      <button
                        type="button"
                        className="check dashboard-toggle"
                        aria-label={`Mark ${task.title} complete`}
                        onClick={() => {
                          setTasks((current) => current.map((item) =>
                            item.id === task.id ? { ...item, done: true, completedAt: new Date().toISOString() } : item
                          ));
                          notify(`Task completed: ${task.title} ✓`);
                        }}
                      />
                      <button type="button" className="ghost-btn dashboard-task-copy" onClick={() => navigate("tasks")}>
                        <b>{task.title}</b>
                        <div className="task-meta">
                          {subject && <span className="subject-mini">{getDifficultyInfo(subject.difficulty).icon} {subject.name}</span>}
                          <span className="muted">Due {formatDate(task.due)}</span>
                        </div>
                      </button>
                      <span className={"tag " + priority.className}>{priority.icon} {task.priority}</span>
                    </div>
                  );
                })}
                {!upcomingTasks.length && <div className="empty">🎉<br />No pending tasks.</div>}
              </div>
            </div>
          )}

          {sectionEnabled("exams") && (
            <div className="panel">
              <div className="row">
                <h2 className="card-title">Exam radar</h2>
                <button className="ghost-btn" onClick={() => navigate("reminders")}>Manage</button>
              </div>
              <div className="reminder-list">
                {upcomingExams.map((exam) => {
                  const days = daysUntil(exam.date);
                  return (
                    <div className={"item reminder-card " + (days === 0 ? "today" : "")} key={exam.id}>
                      <div className="row">
                        <div><b>{exam.title}</b><div className="muted">{formatDate(exam.date)}</div></div>
                        <span className="tag high">{days === 0 ? "Today" : days < 0 ? "Passed" : `${days} days`}</span>
                      </div>
                    </div>
                  );
                })}
                {!upcomingExams.length && <div className="empty">📅<br />No exams added yet.</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {sectionEnabled("subjects") && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="row">
            <h2 className="card-title">Subject pulse</h2>
            <button className="ghost-btn" onClick={() => navigate("subjects")}>Manage subjects →</button>
          </div>
          {!subjects.length ? (
            <div className="empty">
              <div style={{ fontSize: 40 }}>📚</div>
              <h3>Create your first subject</h3>
              <p>There are no predefined courses. Add whatever you are studying.</p>
              <button className="primary-btn" onClick={() => navigate("subjects")}>+ Add my subject</button>
            </div>
          ) : (
            <div className="grid three">
              {subjects.slice(0, 6).map((subject) => {
                const difficulty = getDifficultyInfo(subject.difficulty);
                const progress = calculateSubjectProgress(subject.id, tasks);
                return (
                  <button className="item dashboard-stat-card" type="button" key={subject.id} onClick={() => navigate("subjects")}>
                    <div className="row">
                      <div className="row" style={{ justifyContent: "flex-start" }}>
                        <div className="subject-icon" style={{ background: difficulty.background }}>{difficulty.icon}</div>
                        <div><b>{subject.name}</b><div className="muted">{subject.difficulty}</div></div>
                      </div>
                      <b>{progress}%</b>
                    </div>
                    <div className="progress" style={{ marginTop: 12 }}>
                      <div className="bar" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${subject.color}, #22d3ee)` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <section className="panel focus-panel" aria-label="Daily goal" style={{ marginTop: 16 }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <div className="eyebrow">Today’s priority</div>
            <h2 className="card-title" style={{ margin: 0 }}>Focus overview</h2>
          </div>
          <span className="tag">{goalPercent >= 100 ? "Goal done" : "On track"}</span>
        </div>
        <div
          className="focus-ring"
          style={{ "--goal": goalPercent + "%" }}
          role="progressbar"
          aria-label="Daily study goal progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={goalPercent}
        >
          <div className="focus-ring-inner">
            <b>{goalPercent}%</b>
            <span>{todayMinutes}/{goal} min</span>
          </div>
        </div>
        <div className="focus-main">
          <h2 className="card-title" style={{ margin: 0 }}>
            {goalPercent >= 100 ? "Daily goal complete" : `${remaining} min to reach today's goal`}
          </h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {goalPercent >= 100
              ? "Anything extra today is a bonus."
              : todayMinutes === 0
                ? "Log a session or start the focus timer to get moving."
                : "Good progress. One more session gets you there."}
          </p>
          <div className="focus-chips">
            {[15, 25, 45].map((amount) => (
              <button key={amount} type="button" className="chip-btn" onClick={() => quickLog(amount, "Focus")}>+{amount} min</button>
            ))}
            <button type="button" className="chip-btn active" onClick={() => navigate("pomodoro")}>Start focus timer</button>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            {recentSessionTypes.map((type) => (
              <button key={type} type="button" className="chip-btn" onClick={() => quickLog(20, type)}>{type}</button>
            ))}
          </div>
          <div className="focus-meta">
            <span>🔥 <b>{streak}</b> day streak</span>
            <span>✓ <b>{dueToday}</b> due today</span>
            {overdue > 0 && <span style={{ color: "#fb7185" }}>⚠ <b style={{ color: "inherit" }}>{overdue}</b> overdue</span>}
          </div>
        </div>
        <div className="focus-week">
          <div className="focus-week-head"><span>Last 7 days</span><b>{weekTotal} min total</b></div>
          <WeekBars data={weekData} goal={goal} />
        </div>
      </section>
    </>
  );
}

/* -----------------------------------------------------------
   SUBJECTS
----------------------------------------------------------- */

function Subjects({ subjects, setSubjects, tasks, notify }) {
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("Medium");

  const addSubject = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      notify("Please enter a subject name");
      return;
    }
    const info = getDifficultyInfo(difficulty);
    const newSubject = {
      id: Date.now(),
      name: name.trim(),
      difficulty,
      color: info.color,
      createdAt: new Date().toISOString(),
    };
    setSubjects((current) => [...current, newSubject]);
    setName("");
    setDifficulty("Medium");
    notify(`${newSubject.name} added ✦`);
  };

  const startEdit = (subject) => {
    setEditingId(subject.id);
    setEditName(subject.name);
    setEditDifficulty(subject.difficulty);
  };

  const saveEdit = (id) => {
    if (!editName.trim()) {
      notify("Subject name cannot be empty");
      return;
    }
    const info = getDifficultyInfo(editDifficulty);
    setSubjects((current) =>
      current.map((subject) =>
        subject.id === id
          ? { ...subject, name: editName.trim(), difficulty: editDifficulty, color: info.color }
          : subject
      )
    );
    setEditingId(null);
    notify("Subject updated");
  };

  const deleteSubject = (id) => {
    const subject = subjects.find((s) => s.id === id);
    const relatedTasks = tasks.filter((task) => task.subjectId === id);
    const message = relatedTasks.length
      ? `This subject has ${relatedTasks.length} task(s). Delete the subject and its tasks?`
      : "Delete this subject?";

    if (!window.confirm(message)) return;

    setSubjects((current) => current.filter((s) => s.id !== id));
    notify(`${subject?.name || "Subject"} deleted`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Knowledge map</div>
          <h1 className="title">My Subjects</h1>
          <div className="muted">Add any course or subject you are studying. Nothing is predefined.</div>
        </div>
      </div>

      <div className="panel">
        <h2 className="card-title">+ Add a new subject</h2>
        <form className="form-grid" onSubmit={addSubject}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: Machine Learning, Biology, Accounting..." />
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="Easy">🟢 Easy</option>
            <option value="Medium">🟡 Medium</option>
            <option value="Hard">🔴 Hard</option>
          </select>
          <button className="primary-btn full">+ Add Subject</button>
        </form>
      </div>

      <div className="grid three" style={{ marginTop: 16 }}>
        {!subjects.length && (
          <div className="panel" style={{ gridColumn: "1 / -1" }}>
            <div className="empty">
              <div style={{ fontSize: 50 }}>📚</div>
              <h3>No subjects yet</h3>
              <p>Add your own subjects above. You can add as many as you need.</p>
            </div>
          </div>
        )}

        {subjects.map((subject) => {
          const info = getDifficultyInfo(subject.difficulty);
          const progress = calculateSubjectProgress(subject.id, tasks);
          const taskCount = tasks.filter((task) => task.subjectId === subject.id).length;
          const completed = tasks.filter((task) => task.subjectId === subject.id && task.done).length;

          if (editingId === subject.id) {
            return (
              <div className="panel" key={subject.id}>
                <h2 className="card-title">Edit subject</h2>
                <div className="list">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <select value={editDifficulty} onChange={(e) => setEditDifficulty(e.target.value)}>
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                  <div className="actions">
                    <button className="primary-btn" onClick={() => saveEdit(subject.id)}>Save</button>
                    <button className="ghost-btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="panel subject-card" key={subject.id} style={{ "--subject-color": subject.color }}>
              <div className="row">
                <div className="row" style={{ justifyContent: "flex-start" }}>
                  <div className="subject-icon" style={{ background: info.background }}>{info.icon}</div>
                  <div>
                    <h2 className="card-title" style={{ marginBottom: 3 }}>{subject.name}</h2>
                    <div style={{ color: info.color, fontSize: 12 }}>
                      {info.icon} {subject.difficulty} · {info.description}
                    </div>
                  </div>
                </div>
                <span className="tag">{progress}%</span>
              </div>

              <div className="progress" style={{ marginTop: 17 }}>
                <div className="bar" style={{ width: progress + "%", background: `linear-gradient(90deg, ${subject.color}, #22d3ee)` }} />
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <span className="muted">{completed}/{taskCount} tasks</span>
                <span className="muted">{taskCount ? "In progress" : "No tasks yet"}</span>
              </div>

              <div className="actions" style={{ marginTop: 15 }}>
                <button className="ghost-btn" onClick={() => startEdit(subject)}>✎ Edit</button>
                <button className="danger-btn" onClick={() => deleteSubject(subject.id)}>× Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* -----------------------------------------------------------
   TASKS
----------------------------------------------------------- */

function Tasks({ tasks, setTasks, subjects, notify }) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [filter, setFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [animatingTaskId, setAnimatingTaskId] = useState(null);

  const addTask = (e) => {
    e.preventDefault();
    if (!subjects.length) {
      notify("Please add a subject first");
      return;
    }
    if (!title.trim()) {
      notify("Please enter a task name");
      return;
    }
    if (!subjectId) {
      notify("Please select a subject");
      return;
    }
    if (!due) {
      notify("Please select a due date");
      return;
    }

    const newTask = {
      id: Date.now(),
      title: title.trim(),
      subjectId: Number(subjectId),
      due,
      priority,
      done: false,
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [...current, newTask]);
    setTitle("");
    setDue("");
    setPriority("Medium");
    notify("Task added successfully ✦");
  };

  const toggleTask = (id) => {
    const task = tasks.find((item) => item.id === id);
    setAnimatingTaskId(task && !task.done ? id : null);
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : null }
          : task
      )
    );
  };

  const deleteTask = (id) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    notify("Task deleted");
  };

  const filteredTasks = tasks.filter((task) => {
    const statusMatch =
      filter === "all" ||
      (filter === "pending" && !task.done) ||
      (filter === "completed" && task.done);

    const subjectMatch =
      subjectFilter === "all" ||
      task.subjectId === Number(subjectFilter);

    return statusMatch && subjectMatch;
  });

  const getSubject = (id) => subjects.find((subject) => subject.id === id);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Execution</div>
          <h1 className="title">Tasks</h1>
          <div className="muted">Add tasks to any subject, set deadlines and choose priority.</div>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <h2 className="card-title">+ Add Task</h2>
          {!subjects.length ? (
            <div className="empty">
              <div style={{ fontSize: 40 }}>📚</div>
              <h3>Add a subject first</h3>
              <p>Tasks are connected to the subjects you create.</p>
            </div>
          ) : (
            <form className="form-grid" onSubmit={addTask}>
              <div className="full">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example: Finish chapter 4 notes" />
              </div>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {getDifficultyInfo(subject.difficulty).icon} {subject.name}
                  </option>
                ))}
              </select>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="High">🔴 High Priority</option>
                <option value="Medium">🟡 Medium Priority</option>
                <option value="Low">🟢 Low Priority</option>
              </select>
              <button className="primary-btn">+ Add Task</button>
            </form>
          )}
        </div>

        <div className="panel">
          <h2 className="card-title">Task Overview</h2>
          <div className="grid three">
            <div className="item">
              <div className="muted">Total</div>
              <b style={{ fontSize: 22 }}>{tasks.length}</b>
            </div>
            <div className="item">
              <div className="muted">Pending</div>
              <b style={{ fontSize: 22, color: "#ffd58a" }}>{tasks.filter((task) => !task.done).length}</b>
            </div>
            <div className="item">
              <div className="muted">Completed</div>
              <b style={{ fontSize: 22, color: "#6ee7b7" }}>{tasks.filter((task) => task.done).length}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 className="card-title">Your Tasks</h2>
          <span className="tag">{filteredTasks.length} shown</span>
        </div>

        <div className="filter-row">
          {[["all", "All"], ["pending", "Pending"], ["completed", "Completed"]].map(([id, label]) => (
            <button
              key={id}
              className={"filter-btn " + (filter === id ? "active" : "")}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <button
            className={"filter-btn " + (subjectFilter === "all" ? "active" : "")}
            onClick={() => setSubjectFilter("all")}
          >
            All Subjects
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.id}
              className={"filter-btn " + (subjectFilter === String(subject.id) ? "active" : "")}
              onClick={() => setSubjectFilter(String(subject.id))}
            >
              {getDifficultyInfo(subject.difficulty).icon} {subject.name}
            </button>
          ))}
        </div>

        <div className="list">
          {filteredTasks
            .sort((a, b) => (a.due || "").localeCompare(b.due || ""))
            .map((task) => {
              const subject = getSubject(task.subjectId);
              const difficulty = subject ? getDifficultyInfo(subject.difficulty) : null;
              const priority = getPriorityInfo(task.priority);

              return (
                <div className={"item row task-row " + (task.done ? "is-complete" : "")} key={task.id}>
                  <div className="row" style={{ justifyContent: "flex-start", alignItems: "flex-start" }}>
                    <button type="button" className={"check " + (task.done ? "done " + (animatingTaskId === task.id ? "just-completed" : "") : "")} aria-label={task.done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`} onClick={() => toggleTask(task.id)} onAnimationEnd={() => setAnimatingTaskId(null)}>
                      {task.done ? "✓" : ""}
                    </button>
                    <div>
                      <b className="task-title" style={{ textDecoration: task.done ? "line-through" : "none" }}>
                        {task.title}
                      </b>
                      <div className="task-meta">
                        {subject && (
                          <span className="subject-mini">
                            {difficulty.icon} {subject.name}
                          </span>
                        )}
                        <span className="muted">Due: {formatDate(task.due)}</span>
                        <span className={"tag " + priority.className}>{priority.icon} {task.priority}</span>
                        {isToday(task.due) && <span className="tag medium">Today</span>}
                        {isPast(task.due) && !task.done && <span className="tag high">Overdue</span>}
                      </div>
                    </div>
                  </div>
                  <button className="danger-btn" onClick={() => deleteTask(task.id)}>×</button>
                </div>
              );
            })}
          {!filteredTasks.length && (
            <div className="empty">
              <div style={{ fontSize: 35 }}>✓</div>
              <h3>No tasks found</h3>
              <p>Add a task or change your filters.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* -----------------------------------------------------------
   PROGRESS
----------------------------------------------------------- */

function Progress({ profile, setProfile, tasks, subjects, studySessions, notify, onRecordStudy }) {
  const [minutes, setMinutes] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [sessionType, setSessionType] = useState("Focus");
  const today = getTodayKey();

  const todayMinutes = getMinutesForDate(studySessions, today);
  const goal = Number(profile.dailyGoal) || 60;
  const goalPercent = Math.min(100, Math.round((todayMinutes / goal) * 100));
  const remaining = Math.max(0, goal - todayMinutes);
  const completed = tasks.filter((task) => task.done).length;
  const completionPercent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const overdue = tasks.filter((task) => !task.done && task.due && isPast(task.due)).length;

  const streak = getEffectiveStreak(profile);
  const bestStreak = Math.max(Number(profile.bestStreak) || 0, streak);
  const nextMilestone = getNextMilestone(streak);
  const studiedToday = profile.lastStudyDate === today;

  const weekData = useMemo(() => getWeekData(studySessions), [studySessions]);
  const weekTotal = weekData.reduce((sum, day) => sum + day.total, 0);
  const weekAverage = Math.round(weekTotal / 7);
  const bestDay = weekData.reduce((best, day) => (day.total > best.total ? day : best), weekData[0]);
  const goalDays = weekData.filter((day) => day.total >= goal).length;

  const recordMinutes = (raw) => {
    const value = Math.round(Number(raw));
    if (!Number.isFinite(value) || value <= 0) {
      notify("Enter valid study minutes");
      return false;
    }
    if (value > 720) {
      notify("A single entry can be up to 720 minutes");
      return false;
    }
    const nextTotal = todayMinutes + value;
    onRecordStudy(value, sessionType);
    notify(nextTotal >= goal ? `Daily goal reached with ${sessionType.toLowerCase()} study 🎉` : `${value} minutes recorded in ${sessionType.toLowerCase()} mode 🔥`);
    return true;
  };

  const addStudyTime = (event) => {
    event.preventDefault();
    if (recordMinutes(minutes)) setMinutes("");
  };

  const setGoal = (value) => {
    const next = Math.round(Number(value));
    if (!Number.isFinite(next) || next < 10 || next > 720) {
      notify("Choose a goal between 10 and 720 minutes");
      return;
    }
    setProfile((current) => ({ ...current, dailyGoal: next }));
    notify(`Daily goal set to ${next} minutes`);
  };

  const submitCustomGoal = (event) => {
    event.preventDefault();
    setGoal(customGoal);
    setCustomGoal("");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Analytics</div>
          <h1 className="title">Progress Tracker</h1>
          <div className="muted">Track study time, streaks, goals and subject progress.</div>
        </div>
      </div>

      <div className="grid three">
        <div className="panel">
          <h2 className="card-title">Today's Goal</h2>
          <div className="goal-circle" style={{ "--goal": goalPercent + "%" }}>
            <div className="goal-circle-inner">
              <div>
                <div className="goal-number">{goalPercent}%</div>
                <div className="muted">{todayMinutes}/{goal} min</div>
              </div>
            </div>
          </div>
          <p className="muted" style={{ textAlign: "center", margin: "0 0 14px" }}>
            {goalPercent >= 100 ? "Goal complete. Extra time is a bonus." : `${remaining} min left to reach your goal.`}
          </p>
          <div className="focus-chips" style={{ justifyContent: "center", margin: "0 0 12px" }}>
            {[15, 25, 45].map((amount) => (
              <button key={amount} type="button" className="chip-btn" onClick={() => recordMinutes(amount)}>+{amount}</button>
            ))}
          </div>
          <form className="list" onSubmit={addStudyTime}>
            <div className="row" style={{ gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
              <input
                type="number"
                min="1"
                max="720"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="Add study minutes"
                aria-label="Study minutes to record"
                style={{ flex: 1, minWidth: 140 }}
              />
              <select value={sessionType} onChange={(e) => setSessionType(e.target.value)} style={{ maxWidth: 180 }}>
                <option>Focus</option>
                <option>Revision</option>
                <option>Reading</option>
                <option>Practice</option>
                <option>Deep work</option>
              </select>
            </div>
            <button className="primary-btn">Record Study Time</button>
          </form>
          <div className="goal-setter">
            <div className="muted" style={{ fontSize: 13 }}>Daily goal</div>
            <div className="focus-chips" style={{ margin: "8px 0" }}>
              {[30, 60, 90, 120].map((value) => (
                <button key={value} type="button" className={"chip-btn" + (goal === value ? " active" : "")} onClick={() => setGoal(value)}>{value}m</button>
              ))}
            </div>
            <form className="inline-form" onSubmit={submitCustomGoal}>
              <input type="number" min="10" max="720" value={customGoal} onChange={(e) => setCustomGoal(e.target.value)} placeholder="Custom minutes" aria-label="Custom daily goal in minutes" />
              <button className="ghost-btn" type="submit">Set</button>
            </form>
          </div>
        </div>

        <div className="panel">
          <h2 className="card-title">🔥 Study Streak</h2>
          <div style={{ font: '800 55px "Manrope"', textAlign: "center", marginTop: 25 }}>
            {streak}
          </div>
          <p className="muted" style={{ textAlign: "center" }}>consecutive study days</p>
          <div className="ai-suggestion">
            {studiedToday
              ? "Today is counted. Come back tomorrow to keep it going."
              : streak > 0
                ? `Study today to keep your ${streak}-day streak alive.`
                : "Record a session to start a new streak."}
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="muted">Next milestone</span>
              <b>{streak}/{nextMilestone} days</b>
            </div>
            <div className="progress" style={{ marginTop: 8 }}>
              <div className="bar" style={{ width: `${Math.min(100, (streak / nextMilestone) * 100)}%` }} />
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Longest streak: {bestStreak} {bestStreak === 1 ? "day" : "days"}</p>
          </div>
        </div>

        <div className="panel">
          <h2 className="card-title">Task Completion</h2>
          <div style={{ font: '700 45px "Manrope"' }}>{completionPercent}%</div>
          <div className="progress" style={{ marginTop: 15 }}>
            <div className="bar" style={{ width: completionPercent + "%" }} />
          </div>
          <p className="muted">{completed} completed out of {tasks.length} tasks.</p>
          {overdue > 0 && <div className="lock-banner" style={{ marginTop: 12 }}>{overdue} overdue {overdue === 1 ? "task needs" : "tasks need"} attention.</div>}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 className="card-title">Session health</h2>
          <span className="tag">{studySessions.filter((session) => session.date === today).length} entries today</span>
        </div>
        <div className="week-stats">
          <div className="week-stat"><span>Total this week</span><b>{weekTotal} min</b></div>
          <div className="week-stat"><span>Daily average</span><b>{weekAverage} min</b></div>
          <div className="week-stat"><span>Best day</span><b>{bestDay.total ? `${bestDay.isToday ? "Today" : bestDay.label} · ${bestDay.total}m` : "None yet"}</b></div>
          <div className="week-stat"><span>Goal reached</span><b>{goalDays}/7 days</b></div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 className="card-title">Recent study sessions</h2>
        <div className="list">
          {[...studySessions]
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
            .slice(0, 5)
            .map((session) => (
              <div className="item" key={session.id || `${session.date}-${session.minutes}`}>
                <div className="row">
                  <div>
                    <b>{getSessionTypeLabel(session)}</b>
                    <div className="muted">{session.date ? formatDate(session.date) : "No date"}</div>
                  </div>
                  <span className="tag">{Number(session.minutes) || 0} min</span>
                </div>
              </div>
            ))}
          {!studySessions.length && <div className="empty">No study sessions logged yet. Start with a 15-minute focus block.</div>}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 className="card-title">Weekly Study Time</h2>
        <WeekBars data={weekData} goal={goal} tall />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 className="card-title">Subject Progress</h2>
          <span className="tag">{subjects.length} subjects</span>
        </div>
        {!subjects.length ? (
          <div className="empty">Add subjects to start tracking them.</div>
        ) : (
          <div className="list">
            {subjects.map((subject) => {
              const info = getDifficultyInfo(subject.difficulty);
              const progress = calculateSubjectProgress(subject.id, tasks);
              return (
                <div className="item" key={subject.id}>
                  <div className="row">
                    <div>
                      <b>{info.icon} {subject.name}</b>
                      <div className="muted">{subject.difficulty}</div>
                    </div>
                    <b>{progress}%</b>
                  </div>
                  <div className="progress" style={{ marginTop: 10 }}>
                    <div className="bar" style={{ width: progress + "%", background: `linear-gradient(90deg, ${subject.color}, #22d3ee)` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* -----------------------------------------------------------
   REMINDERS
----------------------------------------------------------- */

function Reminders({ exams, setExams, tasks, subjects, notify }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [priority, setPriority] = useState("High");

  const addExam = (e) => {
    e.preventDefault();
    if (!title.trim() || !date) {
      notify("Enter exam name and date");
      return;
    }
    setExams((current) => [
      ...current,
      { id: Date.now(), title: title.trim(), date, priority },
    ]);
    setTitle("");
    setDate("");
    setPriority("High");
    notify("Exam reminder added 📅");
  };

  const deleteExam = (id) => {
    setExams((current) => current.filter((exam) => exam.id !== id));
    notify("Exam reminder deleted");
  };

  const sortedExams = [...exams].sort((a, b) => a.date.localeCompare(b.date));
  const upcomingTasks = [...tasks]
    .filter((task) => !task.done && task.due)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 10);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Smart alerts</div>
          <h1 className="title">Reminders</h1>
          <div className="muted">Exams and upcoming tasks in one place.</div>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <h2 className="card-title">📅 Add Exam Reminder</h2>
          <form className="list" onSubmit={addExam}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Exam / assignment / test name"
            />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
            <button className="primary-btn">+ Add Reminder</button>
          </form>
        </div>

        <div className="panel">
          <h2 className="card-title">🔔 Upcoming Task Reminders</h2>
          <div className="reminder-list">
            {upcomingTasks.map((task) => {
              const subject = subjects.find((s) => s.id === task.subjectId);
              const days = daysUntil(task.due);
              return (
                <div
                  className={"item reminder-card " + (isPast(task.due) ? "overdue" : isToday(task.due) ? "today" : "")}
                  key={task.id}
                >
                  <div className="row">
                    <div>
                      <b>{task.title}</b>
                      <div className="muted">{subject ? subject.name : "Unknown subject"} · {formatDate(task.due)}</div>
                    </div>
                    <span className={"tag " + getPriorityInfo(task.priority).className}>
                      {days === 0 ? "Today" : days < 0 ? "Overdue" : `${days}d`}
                    </span>
                  </div>
                </div>
              );
            })}
            {!upcomingTasks.length && <div className="empty">No upcoming tasks.</div>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 className="card-title">Exam Calendar</h2>
        <div className="list">
          {sortedExams.map((exam) => {
            const days = daysUntil(exam.date);
            return (
              <div
                className={"item reminder-card " + (days < 0 ? "overdue" : days === 0 ? "today" : "")}
                key={exam.id}
              >
                <div className="row">
                  <div>
                    <b>{exam.title}</b>
                    <div className="task-meta">
                      <span className="muted">{formatDate(exam.date)}</span>
                      <span className={"tag " + getPriorityInfo(exam.priority).className}>
                        {getPriorityInfo(exam.priority).icon} {exam.priority}
                      </span>
                    </div>
                  </div>
                  <div className="actions">
                    <span className="tag">
                      {days < 0 ? "Passed" : days === 0 ? "Today" : `${days} days left`}
                    </span>
                    <button className="danger-btn" onClick={() => deleteExam(exam.id)}>×</button>
                  </div>
                </div>
              </div>
            );
          })}
          {!sortedExams.length && <div className="empty">📅<br />No exams or deadlines added yet.</div>}
        </div>
      </div>
    </>
  );
}

/* -----------------------------------------------------------
   STUDY NOTES
----------------------------------------------------------- */

async function fetchStudyNotes() {
  const response = await fetch("/api/notes", { credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.notes)) {
    const error = new Error(data.error || `Unable to load notes (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data.notes;
}

function StudyNotes({ subjects, onSessionExpired }) {
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("General");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadNotes = async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
      setError("");
    }
    try {
      setNotes(await fetchStudyNotes());
    } catch (err) {
      if (err.status === 401) onSessionExpired();
      setError(err.message || "Unable to load saved notes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchStudyNotes()
      .then((loadedNotes) => {
        if (active) setNotes(loadedNotes);
      })
      .catch((err) => {
        if (err.status === 401) onSessionExpired();
        if (active) setError(err.message || "Unable to load saved notes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onSessionExpired]);

  const clearEditor = () => {
    setSelectedId(null);
    setTitle("");
    setSubject("");
    setCategory("General");
    setTags("");
    setContent("");
    setError("");
    setNotice("");
  };

  const selectNote = (note) => {
    setSelectedId(note._id);
    setTitle(note.prompt || "");
    setSubject(note.subject || "");
    setCategory(note.category || "General");
    setTags(Array.isArray(note.tags) ? note.tags.join(", ") : "");
    setContent(note.content || "");
    setError("");
    setNotice("");
  };

  const persistNote = useCallback(async (silent = false) => {
    if (!title.trim() || !content.trim()) {
      if (!silent) setError("Add a title and some note content before saving.");
      return false;
    }
    setSaving(true);
    if (!silent) {
      setError("");
      setNotice("");
    }
    try {
      const editing = Boolean(selectedId);
      const response = await fetch(editing ? `/api/notes/${selectedId}` : "/api/notes", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          prompt: title.trim(),
          subject: subject.trim(),
          category: category.trim() || "General",
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          content: content.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.note) {
        const error = new Error(data.error || `Unable to save note (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      setNotes((current) => [
        data.note,
        ...current.filter((note) => note._id !== data.note._id),
      ]);
      setSelectedId(data.note._id);
      setTitle(data.note.prompt || "");
      setSubject(data.note.subject || "");
      setCategory(data.note.category || "General");
      setTags(Array.isArray(data.note.tags) ? data.note.tags.join(", ") : "");
      setContent(data.note.content || "");
      setNotice(silent ? "Saved just now." : editing ? "Note updated." : "Note saved.");
      return true;
    } catch (err) {
      if (err.status === 401) onSessionExpired();
      setError(err.message || "Unable to save note.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedId, title, subject, category, tags, content, onSessionExpired]);

  const saveNote = async (event) => {
    event.preventDefault();
    await persistNote(false);
  };

  useEffect(() => {
    if (!selectedId || !title.trim() || !content.trim()) return undefined;
    const timer = window.setTimeout(() => {
      persistNote(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [persistNote, selectedId, title, content]);

  const deleteNote = async () => {
    if (!selectedId) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/notes/${selectedId}`, { method: "DELETE", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || `Unable to delete note (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      setNotes((current) => current.filter((note) => note._id !== selectedId));
      clearEditor();
    } catch (err) {
      if (err.status === 401) onSessionExpired();
      setError(err.message || "Unable to delete note.");
    }
  };

  const filteredNotes = notes.filter((note) =>
    (categoryFilter === "All" || (note.category || "General") === categoryFilter) &&
    `${note.prompt || ""} ${note.subject || ""} ${note.category || ""} ${(note.tags || []).join(" ")} ${note.content || ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  const noteCategories = ["All", ...new Set(notes.map((note) => note.category || "General"))];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your knowledge library</div>
          <h1 className="title">Study Notes</h1>
          <div className="muted">Capture explanations, revision notes, and the ideas you want to remember.</div>
        </div>
        <button className="primary-btn" onClick={clearEditor}>＋ New note</button>
      </div>

      <div className="notes-layout">
        <section className="panel">
          <div className="row" style={{ marginBottom: 16 }}>
            <h2 className="card-title" style={{ margin: 0 }}>{selectedId ? "Edit note" : "Write a note"}</h2>
            {selectedId && <button className="danger-btn" onClick={deleteNote}>Delete</button>}
          </div>
          <form className="notes-form" onSubmit={saveNote}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" maxLength={160} required />
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option value="">General</option>
              {subjects.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Note category">
              <option>General</option>
              <option>Revision</option>
              <option>Definitions</option>
              <option>Exam prep</option>
              <option>Ideas</option>
            </select>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, separated by commas" maxLength={360} />
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write a concept summary, key points, or revision notes…" maxLength={20000} required />
            <div className={`notes-status ${error ? "high" : "muted"}`} role={error ? "alert" : "status"}>
              {error || notice || `${content.length.toLocaleString()} / 20,000 characters`}
            </div>
            <button className="primary-btn" disabled={saving}>{saving ? "Saving…" : selectedId ? "Save changes" : "Save note"}</button>
          </form>
        </section>

        <section className="panel">
          <div className="row" style={{ marginBottom: 14 }}>
            <h2 className="card-title" style={{ margin: 0 }}>Saved notes <span className="muted">({notes.length})</span></h2>
            <button className="ghost-btn" onClick={() => loadNotes(true)} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>
          </div>
          <div className="notes-toolbar">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes…" aria-label="Search notes" />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter notes by category">
              {noteCategories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          {error && !selectedId && <div className="ai-suggestion high" role="alert">{error}</div>}
          {loading ? (
            <div className="empty">Loading your notes…</div>
          ) : !filteredNotes.length ? (
            <div className="empty">
              <div style={{ fontSize: 36 }}>▤</div>
              <h3>{search ? "No matching notes" : "Your library is ready"}</h3>
              <p>{search ? "Try another search term." : "Save your first note and it will be here whenever you need it."}</p>
            </div>
          ) : (
            <div className="notes-list">
              {filteredNotes.map((note) => (
                <button
                  key={note._id}
                  type="button"
                  className={`item note-card ${selectedId === note._id ? "selected" : ""}`}
                  onClick={() => selectNote(note)}
                >
                  <span className="row">
                    <b>{note.prompt || "Untitled note"}</b>
                    <small className="muted">{note.createdAt ? new Date(note.createdAt).toLocaleDateString() : ""}</small>
                  </span>
                  <span className="task-meta">
                    <span className="tag note-subject">{note.category || "General"}</span>
                    {note.subject && <span className="tag">{note.subject}</span>}
                    {(note.tags || []).slice(0, 3).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
                  </span>
                  <span className="muted">{(note.content || "").slice(0, 140)}{(note.content || "").length > 140 ? "…" : ""}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Flashcards({ navigate, notify, review, setReview }) {
  const [notes, setNotes] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = getLocalDateKey(new Date());

  useEffect(() => {
    let active = true;
    fetchStudyNotes()
      .then((savedNotes) => {
        if (active) setNotes(savedNotes);
      })
      .catch((err) => {
        if (active) setError(err.message || "Could not load notes for review.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const dueCards = notes.filter((note) => {
    const state = review[note._id];
    return state?.reviewedOn !== today && (!state?.dueOn || state.dueOn <= today);
  });
  const reviewedToday = notes.filter((note) => review[note._id]?.reviewedOn === today).length;
  const card = dueCards[0];
  const intervals = { Again: 0, Hard: 1, Good: 3, Easy: 7 };

  const rateCard = (rating) => {
    if (!card) return;
    const dueOn = getLocalDateKey(shiftLocalDate(new Date(), intervals[rating]));
    setReview((current) => ({
      ...current,
      [card._id]: { reviewedOn: today, dueOn, rating },
    }));
    setShowAnswer(false);
    notify(`${rating === "Again" ? "Card marked for another review tomorrow" : `Marked ${rating.toLowerCase()}`} ✓`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Active recall · Spaced repetition</div>
          <h1 className="title">Daily Flashcards</h1>
          <div className="muted">Review your saved notes, reveal what you remember, then choose when to see each card again.</div>
        </div>
        <button className="ghost-btn" onClick={() => navigate("notes")}>▤ Open Study Notes</button>
      </div>

      <section className="panel" style={{ maxWidth: 820, margin: "0 auto" }}>
        <div className="row" style={{ marginBottom: 18 }}>
          <div>
            <h2 className="card-title" style={{ marginBottom: 4 }}>Today's review</h2>
            <span className="muted">{reviewedToday} of {notes.length} notes reviewed today</span>
          </div>
          <span className="tag">{dueCards.length} due</span>
        </div>
        <div className="progress" aria-label={`${notes.length ? Math.round((reviewedToday / notes.length) * 100) : 0}% of notes reviewed today`}>
          <div className="bar" style={{ width: `${notes.length ? Math.round((reviewedToday / notes.length) * 100) : 0}%` }} />
        </div>

        {loading ? (
          <div className="empty">Loading your note cards…</div>
        ) : error ? (
          <div className="empty high" role="alert">{error}</div>
        ) : !notes.length ? (
          <div className="empty">
            <div style={{ fontSize: 38 }}>▣</div>
            <h3>No flashcards yet</h3>
            <p>Save some study notes and they will automatically become review cards.</p>
            <button className="primary-btn" onClick={() => navigate("notes")}>Create a study note</button>
          </div>
        ) : !card ? (
          <div className="empty">
            <div style={{ fontSize: 38 }}>🎉</div>
            <h3>You're all caught up</h3>
            <p>You reviewed every note due today. Your next review will be ready when its interval comes around.</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="flashcard"
              aria-label={showAnswer ? "Hide note answer" : "Reveal note answer"}
              onClick={() => setShowAnswer((current) => !current)}
              onKeyDown={(event) => {
                if (event.key === " ") {
                  event.preventDefault();
                  setShowAnswer((current) => !current);
                }
              }}
              style={{ marginTop: 20 }}
            >
              <span>
                <span className="eyebrow">{showAnswer ? (card.subject || "General") : `CARD ${reviewedToday + 1}`}</span>
                {showAnswer ? (
                  <span className="flashcard-answer" style={{ display: "block", marginTop: 16 }}>{card.content}</span>
                ) : (
                  <>
                    <strong style={{ display: "block", margin: "14px 0", font: '600 clamp(22px,4vw,32px) "Manrope"' }}>{card.prompt || "Untitled note"}</strong>
                    <span className="muted">Recall the key idea, then tap to reveal your note.</span>
                  </>
                )}
              </span>
            </button>
            {!showAnswer ? (
              <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
                <button className="primary-btn" onClick={() => setShowAnswer(true)}>Reveal answer</button>
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                <p className="muted" style={{ textAlign: "center" }}>How well did you remember this?</p>
                <div className="flashcard-rating">
                  <button className="danger-btn" onClick={() => rateCard("Again")}>Again · 1d</button>
                  <button className="ghost-btn" onClick={() => rateCard("Hard")}>Hard · 1d</button>
                  <button className="ghost-btn" onClick={() => rateCard("Good")}>Good · 3d</button>
                  <button className="primary-btn" onClick={() => rateCard("Easy")}>Easy · 7d</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

/* -----------------------------------------------------------
   AI ASSISTANT (SMART DUAL REAL-TIME SOLVER)
----------------------------------------------------------- */

function AIAssistant({ subjects, tasks, profile }) {
  const [mode, setMode] = useState("ask");
  const [input, setInput] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [serviceStatus, setServiceStatus] = useState("checking");
  const [saveNotice, setSaveNotice] = useState("");
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [savedAnswerIds, setSavedAnswerIds] = useState([]);
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      text: `Hi ${profile.name || "there"}! 👋\n\nI'm your StudyFlow AI. Ask me anything about your studies, ask for a study plan, explain a difficult topic, or generate a quiz.`,
    },
  ]);
  const [typing, setTyping] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);

  const selectedSubject = subjects.find((subject) => subject.id === Number(subjectId));
  const subjectName = selectedSubject?.name || "your subjects";

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Server returned status ${response.status}`);
        return response.json();
      })
      .then((health) => {
        if (!active) return;
        setServiceStatus(health.aiConfigured ? "ready" : "unconfigured");
      })
      .catch(() => {
        if (active) setServiceStatus("offline");
      });

    return () => {
      active = false;
    };
  }, []);

  const context = useMemo(() => ({
    student: profile.name || "Student",
    course: profile.course || "",
    streak: profile.streak || 0,
    selectedSubject: selectedSubject?.name || "",
    subjects: subjects.map((s) => ({
      name: s.name,
      difficulty: s.difficulty,
    })),
    pendingTasks: tasks
      .filter((task) => !task.done)
      .slice(0, 8)
      .map((task) => ({
        title: task.title,
        due: task.due,
        priority: task.priority,
      })),
  }), [profile, selectedSubject, subjects, tasks]);

  const askAI = async () => {
    const question = input.trim();
    if (!question && !["tips", "plan"].includes(mode)) return;

    const prompt = question || `Create a personalized ${mode} session for ${subjectName}.`;
    const modePrompt = mode === "ask" ? prompt : `${mode}: ${prompt}`;
    setInput("");
    setQuizScore(null);

    const userMsgId = Date.now();
    const botMsgId = Date.now() + 1;

    setMessages((current) => [
      ...current,
      { id: userMsgId, role: "user", text: prompt },
      { id: botMsgId, role: "assistant", text: "" },
    ]);
    setTyping(true);

    try {
      const standardRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          prompt: modePrompt,
          context,
          history: messages.slice(-10).map(({ role, text }) => ({ role, text })),
        }),
      });

      const data = await standardRes.json();
      if (!standardRes.ok || !data.answer) {
        throw new Error(data.error || `Server returned status ${standardRes.status}`);
      }

      setServiceStatus("ready");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMsgId ? { ...msg, text: data.answer } : msg
        )
      );
    } catch (err) {
      console.error("AI Error:", err);
      setServiceStatus(err.message.includes("not configured") ? "unconfigured" : "offline");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMsgId
            ? {
                ...msg,
                text: `I couldn't get a response from the AI service. ${err.message}\n\nCheck that the backend is running and GEMINI_API_KEY is set in frontend/backend/.env, then try again.`,
              }
            : msg
        )
      );
    } finally {
      setTyping(false);
    }
  };

  const generateQuiz = async () => {
    const topic = input.trim() || subjectName;
    if (typing) return;
    const userMsgId = Date.now();
    const botMsgId = userMsgId + 1;
    setInput("");
    setQuiz([]);
    setQuizAnswers({});
    setQuizScore(null);
    setMessages((current) => [
      ...current,
      { id: userMsgId, role: "user", text: `Generate a quiz about ${topic}.` },
      { id: botMsgId, role: "assistant", text: "" },
    ]);
    setTyping(true);

    try {
      const response = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ topic, context }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.questions)) {
        throw new Error(data.error || `Server returned status ${response.status}`);
      }

      const generatedQuiz = data.questions.map((question, index) => ({
        ...question,
        id: userMsgId + index + 2,
      }));
      setQuiz(generatedQuiz);
      setQuizAnswers({});
      setQuizScore(null);
      setServiceStatus("ready");
      setMessages((current) =>
        current.map((message) =>
          message.id === botMsgId
            ? { ...message, text: `🧠 Your ${generatedQuiz.length}-question quiz about “${topic}” is ready. Choose an answer for each question, then check your score.` }
            : message
        )
      );
    } catch (err) {
      console.error("AI quiz error:", err);
      setServiceStatus(err.message.includes("not configured") ? "unconfigured" : "offline");
      setMessages((current) =>
        current.map((message) =>
          message.id === botMsgId
            ? { ...message, text: `I couldn't generate the quiz. ${err.message}\n\nCheck that the backend is running and GEMINI_API_KEY is set in frontend/backend/.env, then try again.` }
            : message
        )
      );
    } finally {
      setTyping(false);
    }
  };

  const scoreQuiz = () => {
    const score = quiz.reduce(
      (total, question) => total + (quizAnswers[question.id] === question.answer ? 1 : 0),
      0
    );
    const review = quiz
      .filter((question) => quizAnswers[question.id] !== question.answer)
      .map((question) => `• ${question.question}\n${question.explanation}`)
      .join("\n\n");
    setQuizScore(score);
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "assistant",
        text: `🎯 Quiz result: ${score}/${quiz.length}. ${
          score === quiz.length
            ? "Excellent — you are ready for a harder set!"
            : score >= Math.ceil(quiz.length / 2)
            ? "Good job. Review the questions you missed and try again."
            : "No problem. Do a quick revision, then retake the quiz."
        }${review ? `\n\nReview your missed questions:\n${review}` : ""}`,
      },
    ]);
  };

  const clearChat = () => {
    setMessages([
      {
        id: Date.now(),
        role: "assistant",
        text: "Chat cleared. ✨ What would you like to study now?",
      },
    ]);
    setQuiz([]);
    setQuizAnswers({});
    setQuizScore(null);
  };

  const copyLast = async () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    try {
      await navigator.clipboard.writeText(last.text);
    } catch {
      // Clipboard may be restricted
    }
  };

  const saveAnswer = async (answerIndex) => {
    if (
      answerIndex < 0 ||
      !messages[answerIndex]?.text.trim() ||
      !messages.slice(0, answerIndex).some((message) => message.role === "user")
    ) {
      setSaveNotice("Ask a question first, then save the answer here.");
      return;
    }
    if (savingAnswer || savedAnswerIds.includes(messages[answerIndex].id)) return;

    const answer = messages[answerIndex];
    const question = messages
      .slice(0, answerIndex)
      .reverse()
      .find((message) => message.role === "user");
    const title = `${selectedSubject ? `${selectedSubject.name} — ` : ""}${(question?.text || "StudyFlow AI answer").slice(0, 140)}`;
    setSaveNotice("Saving answer…");
    setSavingAnswer(true);

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: title.slice(0, 160),
          subject: selectedSubject?.name || "",
          content: answer.text,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.note) {
        throw new Error(data.error || `Unable to save answer (${response.status}).`);
      }
      setSavedAnswerIds((current) => [...current, answer.id]);
      setSaveNotice("Answer saved to Study Notes.");
    } catch (err) {
      setSaveNotice(err.message || "Unable to save this answer.");
    } finally {
      setSavingAnswer(false);
    }
  };

  const latestSavableAnswer = messages.findLastIndex(
    (message, index) =>
      message.role === "assistant" &&
      message.text.trim() &&
      messages.slice(0, index).some((previous) => previous.role === "user")
  );

  const quickPrompts = [
    "Explain this topic like I'm a beginner",
    "Make a study plan for today",
    "Give me 5 exam tips",
    "Quiz me on my subject",
  ];

  const tabs = [
    ["ask", "💬 Chat"],
    ["explain", "📘 Explain"],
    ["plan", "🗓️ Study Plan"],
    ["revision", "⚡ Revision"],
    ["tips", "💡 Coaching"],
    ["quiz", "🧠 Quiz"],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">AI Study Lab · Real Time</div>
          <h1 className="title">Study Assistant <span className="gradient">✦</span></h1>
          <div className="muted">A smarter study companion that uses your subjects, tasks, streak and questions in real time.</div>
        </div>
        <div className="actions">
          <button className="ghost-btn" onClick={copyLast}>⧉ Copy answer</button>
          <button
            className="ghost-btn"
            onClick={() => saveAnswer(latestSavableAnswer)}
            disabled={savingAnswer || typing || latestSavableAnswer < 0 || savedAnswerIds.includes(messages[latestSavableAnswer]?.id)}
          >
            {savingAnswer ? "Saving…" : "▤ Save answer"}
          </button>
          <button className="ghost-btn" onClick={clearChat}>↺ Clear chat</button>
        </div>
      </div>
      {saveNotice && <div className="ai-suggestion" role="status" style={{ marginBottom: 12 }}>{saveNotice}</div>}

      <div className="ai-shell panel">
        <div className="ai-status-row">
          <div className="ai-status">
            <span className={`ai-live-dot ${serviceStatus}`} />
            <span>StudyFlow AI</span>
            <small>
              {serviceStatus === "checking"
                ? "Checking connection…"
                : serviceStatus === "ready"
                ? "AI ready"
                : serviceStatus === "unconfigured"
                ? "API key needed"
                : "AI offline"}
            </small>
          </div>
          <div className="ai-context-tags">
            <span className="tag">📚 {subjects.length} subjects</span>
            <span className="tag">✓ {tasks.filter((task) => !task.done).length} pending</span>
            <span className="tag">🔥 {profile.streak} day streak</span>
          </div>
        </div>

        <div className="ai-tabs">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={`ai-tab ${mode === id ? "active" : ""}`}
              onClick={() => {
                setMode(id);
                setQuiz([]);
                setQuizScore(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ai-chat-window">
          {messages.map((message, index) => (
            <div key={message.id} className={`ai-message ${message.role}`}>
              <div className="ai-message-avatar">
                {message.role === "assistant" ? "✦" : (profile.name || "S").charAt(0).toUpperCase()}
              </div>
              <div className="ai-message-body">
                <div className="ai-message-name">{message.role === "assistant" ? "StudyFlow AI" : "You"}</div>
                <div className="ai-message-text">{message.text}</div>
                {message.role === "assistant" &&
                  message.text.trim() &&
                  messages.slice(0, index).some((previous) => previous.role === "user") && (
                    <div className="ai-message-actions">
                      <button
                        className="ai-message-save"
                        onClick={() => saveAnswer(index)}
                        disabled={savingAnswer || typing || savedAnswerIds.includes(message.id)}
                      >
                        {savedAnswerIds.includes(message.id) ? "✓ Saved to notes" : savingAnswer ? "Saving…" : "▤ Save to notes"}
                      </button>
                    </div>
                  )}
              </div>
            </div>
          ))}
          {typing && !messages[messages.length - 1]?.text && (
            <div className="ai-message assistant">
              <div className="ai-message-avatar">✦</div>
              <div className="ai-message-body">
                <div className="ai-message-name">StudyFlow AI</div>
                <div className="ai-typing"><i /><i /><i /> Solving live…</div>
              </div>
            </div>
          )}
        </div>

        <div className="ai-quick-row">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              className="ai-quick"
              onClick={() => {
                if (prompt.startsWith("Quiz")) setMode("quiz");
                else if (prompt.includes("study plan")) setMode("plan");
                else if (prompt.includes("exam")) setMode("tips");
                else setMode("explain");
                setInput(prompt.startsWith("Quiz") ? "" : prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="ai-composer">
          <div className="ai-composer-top">
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Use all subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {getDifficultyInfo(subject.difficulty).icon} {subject.name}
                </option>
              ))}
            </select>
            <span className="ai-mode-label">Mode: <b>{tabs.find(([id]) => id === mode)?.[1]}</b></span>
          </div>

          {mode === "quiz" && (
            <div className="ai-suggestion">Choose a subject, enter a topic, and generate practice questions.</div>
          )}

          {mode !== "tips" && mode !== "plan" && (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  mode === "quiz" ? generateQuiz() : askAI();
                }
              }}
              placeholder={mode === "quiz" ? "Enter topic for quiz…" : "Ask any question… e.g. Solve 2x + 5 = 15 or explain Mitosis"}
            />
          )}

          {(mode === "tips" || mode === "plan") && (
            <div className="ai-suggestion">
              {mode === "tips"
                ? `Personalized study coaching for ${subjectName}.`
                : `Prioritizing your pending tasks to build a study plan.`}
            </div>
          )}

          <div className="ai-compose-footer">
            <small>Tip: Press Ctrl + Enter to send</small>
            <button
              className="primary-btn"
              disabled={typing}
              onClick={mode === "quiz" ? generateQuiz : askAI}
            >
              {typing ? "Generating…" : mode === "quiz" ? "🧠 Generate Quiz" : "✦ Ask StudyFlow AI"}
            </button>
          </div>
        </div>
      </div>

      {quiz.length > 0 && (
        <div className="panel ai-quiz-panel" style={{ marginTop: 16 }}>
          <div className="row">
            <div>
              <div className="eyebrow">Knowledge check</div>
              <h2 className="card-title">🧠 Interactive Practice Quiz</h2>
            </div>
            {quizScore !== null && <span className="ai-score-badge">{quizScore}/{quiz.length}</span>}
          </div>

          {quiz.map((question, index) => (
            <div className="quiz-question" key={question.id}>
              <b>{index + 1}. {question.question}</b>
              {question.options.map((option, optionIndex) => {
                const selected = quizAnswers[question.id] === optionIndex;
                const correct = quizScore !== null && question.answer === optionIndex;
                return (
                  <button
                    className={`quiz-option ${selected ? "selected" : ""} ${correct ? "correct" : ""}`}
                    key={option}
                    onClick={() => setQuizAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                  >
                    <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
                  </button>
                );
              })}
            </div>
          ))}

          <button className="primary-btn" onClick={scoreQuiz}>
            Check My Score →
          </button>
        </div>
      )}
    </>
  );
}

/* -----------------------------------------------------------
   POMODORO
----------------------------------------------------------- */

function Pomodoro({ notify, onStudyComplete }) {
  const [mode, setMode] = useState("Focus");
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          setRunning(false);
          if (mode === "Focus") {
            onStudyComplete(25);
            notify("Focus session complete 🔥");
          } else {
            notify("Break complete ✦");
          }
          return mode === "Focus" ? 5 * 60 : 25 * 60;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [running, mode, notify, onStudyComplete]);

  const selectMode = (newMode) => {
    setMode(newMode);
    setRunning(false);
    setSeconds(newMode === "Focus" ? 25 * 60 : 5 * 60);
  };

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Deep work</div>
          <h1 className="title">Pomodoro Focus Lab</h1>
        </div>
      </div>

      <div className="panel timer">
        <div className="mode-row">
          {["Focus", "Break"].map((item) => (
            <button
              key={item}
              className={"ghost-btn " + (mode === item ? "active" : "")}
              onClick={() => selectMode(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="timer-face">{minutes}:{secs}</div>
        <p className="muted">
          {mode === "Focus" ? "Focus on one task. Notifications off." : "Give your brain a short reset."}
        </p>
        <div className="actions" style={{ justifyContent: "center" }}>
          <button className="primary-btn" onClick={() => setRunning((v) => !v)}>
            {running ? "Pause" : "Start session"}
          </button>
          <button className="ghost-btn" onClick={() => selectMode(mode)}>Reset</button>
        </div>
      </div>
    </>
  );
}

/* -----------------------------------------------------------
   SCHEDULE
----------------------------------------------------------- */

function Schedule({ tasks, setTasks, exams, subjects, notify }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const startOfWeek = useMemo(() => {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    return shiftLocalDate(today, mondayOffset * -1 + weekOffset * 7);
  }, [weekOffset]);
  const days = Array.from({ length: 7 }, (_, index) => shiftLocalDate(startOfWeek, index));
  const scheduledTasks = [...tasks].filter((task) => task.due).sort((a, b) => a.due.localeCompare(b.due));
  const unscheduledTasks = tasks.filter((task) => !task.due);
  const weekEnd = days[6];
  const firstDayKey = getLocalDateKey(startOfWeek);
  const lastDayKey = getLocalDateKey(weekEnd);
  const outsideWeekTasks = scheduledTasks.filter((task) => task.due < firstDayKey || task.due > lastDayKey);
  const weekLabel = `${startOfWeek.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const moveTask = (taskId, due) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.due === due) return;
    setTasks((current) => current.map((item) => item.id === taskId ? { ...item, due: due || "" } : item));
    setDraggedTaskId(null);
    setDragOverDate(null);
    notify(due ? `Rescheduled “${task.title}” to ${formatDate(due)}.` : `Removed “${task.title}” from the schedule.`);
  };

  const renderTask = (task) => {
    const subject = subjects.find((item) => item.id === task.subjectId);
    const priority = getPriorityInfo(task.priority);
    return (
      <article
        className="item schedule-task-card"
        key={task.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", String(task.id));
          event.dataTransfer.effectAllowed = "move";
          setDraggedTaskId(task.id);
        }}
        onDragEnd={() => {
          setDraggedTaskId(null);
          setDragOverDate(null);
        }}
        aria-label={`Draggable task ${task.title}`}
      >
        <div className="row">
          <b style={{ textDecoration: task.done ? "line-through" : "none", opacity: task.done ? 0.65 : 1 }}>{task.title}</b>
          <span className={`tag ${priority.className}`}>{priority.icon}</span>
        </div>
        <small className="muted">{subject?.name || "General"}{task.done ? " · Completed" : ""}</small>
        {!task.done && (
          <label className="muted">
            Move date
            <input
              aria-label={`Move ${task.title} to date`}
              type="date"
              value={task.due || ""}
              onChange={(event) => moveTask(task.id, event.target.value)}
            />
          </label>
        )}
      </article>
    );
  };

  const sortedExams = [...exams].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your week</div>
          <h1 className="title">Smart Schedule</h1>
          <div className="muted">Drag a task to another day, or change its date from the task card.</div>
        </div>
        <div className="actions">
          <button className="ghost-btn" onClick={() => setWeekOffset((current) => current - 1)}>← Previous</button>
          <button className="ghost-btn" onClick={() => setWeekOffset(0)}>This week</button>
          <button className="ghost-btn" onClick={() => setWeekOffset((current) => current + 1)}>Next →</button>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <h2 className="card-title" style={{ margin: 0 }}>Weekly plan</h2>
          <span className="tag">{weekLabel}</span>
        </div>
        <div className="schedule-week">
          {days.map((day) => {
            const dateKey = getLocalDateKey(day);
            const dayTasks = scheduledTasks.filter((task) => task.due === dateKey);
            const today = dateKey === getLocalDateKey(new Date());
            return (
              <section
                className={`schedule-drop ${dragOverDate === dateKey ? "drag-over" : ""}`}
                key={dateKey}
                aria-label={`Tasks for ${day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverDate(dateKey);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDragOverDate(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const taskId = Number(event.dataTransfer.getData("text/plain")) || draggedTaskId;
                  if (taskId) moveTask(taskId, dateKey);
                }}
              >
                <h3 className="schedule-day-title">
                  {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                  {today && <span className="tag low" style={{ marginLeft: 6 }}>Today</span>}
                </h3>
                {dayTasks.map(renderTask)}
                {!dayTasks.length && <small className="muted">{draggedTaskId ? "Drop task here" : "No tasks"}</small>}
              </section>
            );
          })}
        </div>
      </div>

      {outsideWeekTasks.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2 className="card-title">Other scheduled tasks</h2>
          <div className="grid two">{outsideWeekTasks.map(renderTask)}</div>
        </section>
      )}

      <div className="grid two" style={{ marginTop: 16 }}>
        <section
          className={`panel schedule-drop ${dragOverDate === "" ? "drag-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverDate("");
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setDragOverDate(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const taskId = Number(event.dataTransfer.getData("text/plain")) || draggedTaskId;
            if (taskId) moveTask(taskId, "");
          }}
        >
          <div className="row">
            <h2 className="card-title">Unscheduled tasks</h2>
            <span className="tag">{unscheduledTasks.length}</span>
          </div>
          <div className="list">
            {unscheduledTasks.map(renderTask)}
            {!unscheduledTasks.length && <div className="empty">All tasks are on your schedule. Drag here to unschedule.</div>}
          </div>
        </section>
        <section className="panel">
          <h2 className="card-title">Exam Schedule</h2>
          <div className="list">
            {sortedExams.map((exam) => (
              <div className="item" key={exam.id}>
                <b>{exam.title}</b>
                <div className="muted">{formatDate(exam.date)}</div>
              </div>
            ))}
            {!sortedExams.length && <div className="empty">No exams scheduled.</div>}
          </div>
        </section>
      </div>
    </>
  );
}

/* -----------------------------------------------------------
   PROFILE
----------------------------------------------------------- */

function Profile({ profile, setProfile, subjects, tasks, notify, accountEmail, onGenerateRecoveryCode, recoveryBusy }) {
  const [name, setName] = useState(profile.name);
  const [studentClass, setStudentClass] = useState(profile.studentClass);
  const [course, setCourse] = useState(profile.course);
  const [goal, setGoal] = useState(profile.goal);
  const [dailyGoal, setDailyGoal] = useState(profile.dailyGoal);

  const saveProfile = (e) => {
    e.preventDefault();
    setProfile((current) => ({
      ...current,
      name: name.trim() || "Student",
      studentClass: studentClass.trim(),
      course: course.trim(),
      goal: goal.trim(),
      dailyGoal: Number(dailyGoal) || 60,
    }));
    notify("Profile updated successfully ✦");
  };

  const initials = (profile.name || "Student").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">My study space</div>
          <h1 className="title">Profile & Goals</h1>
          <div className="muted">Customize your StudyFlow experience.</div>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <div className="row" style={{ marginBottom: 20 }}>
            <div className="profile-avatar">{initials}</div>
            <div>
              <h2 className="card-title" style={{ marginBottom: 4 }}>{profile.name || "Student"}</h2>
              <div className="muted">{profile.course || "Add your course"}</div>
            </div>
          </div>

          <form className="list" onSubmit={saveProfile}>
            <label>
              <div className="muted">Student name</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>
            <label>
              <div className="muted">Class / Year</div>
              <input value={studentClass} onChange={(e) => setStudentClass(e.target.value)} placeholder="Example: Class 12 / 2nd Year" />
            </label>
            <label>
              <div className="muted">Course / Program</div>
              <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Example: B.Tech Computer Science" />
            </label>
            <label>
              <div className="muted">Main study goal</div>
              <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Example: Score above 90% this semester" />
            </label>
            <label>
              <div className="muted">Daily study goal (minutes)</div>
              <input type="number" min="10" value={dailyGoal} onChange={(e) => setDailyGoal(e.target.value)} />
            </label>
            <button className="primary-btn">Save Profile</button>
          </form>
        </div>

        <div className="panel">
          <h2 className="card-title">Your Study Identity</h2>
          <div className="grid two">
            <div className="item">
              <div className="muted">Class</div>
              <b>{profile.studentClass || "Not added"}</b>
            </div>
            <div className="item">
              <div className="muted">Course</div>
              <b>{profile.course || "Not added"}</b>
            </div>
            <div className="item">
              <div className="muted">Subjects</div>
              <b>{subjects.length}</b>
            </div>
            <div className="item">
              <div className="muted">Tasks</div>
              <b>{tasks.length}</b>
            </div>
          </div>

          <div className="item" style={{ marginTop: 12, textAlign: "center" }}>
            <div style={{ fontSize: 45 }}>🔥</div>
            <div style={{ font: '700 35px "Manrope"' }}>{profile.streak}</div>
            <div className="muted">day study streak</div>
          </div>

          <div className="item" style={{ marginTop: 12 }}>
            <b>🎯 My Goal</b>
            <p className="muted">{profile.goal || "You haven't added a study goal yet."}</p>
          </div>

        </div>
      </div>
      {accountEmail && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="eyebrow">ACCOUNT SECURITY</div>
          <h2 className="card-title">Password recovery</h2>
          <p className="muted">Generate a one-time recovery code and save it somewhere private. Creating a new code replaces any previous code.</p>
          <button className="primary-btn" type="button" onClick={onGenerateRecoveryCode} disabled={recoveryBusy}>
            {recoveryBusy ? "Creating code…" : "Generate recovery code"}
          </button>
        </section>
      )}
    </>
  );
}

/* -----------------------------------------------------------
   APP ROOT
----------------------------------------------------------- */

function App() {
  const [page, setPage] = useState("dashboard");
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState(initialProfile);
  const [data, setData] = useState(initialData);
  const [dashboardPrefs, setDashboardPrefs] = useState(initialDashboardPrefs);
  const [flashcardReviews, setFlashcardReviews] = useState({});
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [plannerReady, setPlannerReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("synced");
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [dark, setDark] = useState(true);
  const [theme, setTheme] = useState(getSavedTheme);
  const [toast, setToast] = useState("");
  const syncTimerRef = useRef(null);
  const syncControllerRef = useRef(null);
  const plannerBootstrapRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [loginGuard, setLoginGuard] = useState(readLoginGuard);

  const notify = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const handleSessionExpired = useCallback(() => {
    setAccount(null);
    setPlannerReady(false);
    setAuthMode("login");
    setAuthError("Your private session expired. Please sign in again to continue.");
    setPage("auth");
  }, []);

  const handleLockExpired = useCallback(() => {
    const cleared = { failed: 0, lockedUntil: 0 };
    writeLoginGuard(cleared);
    setLoginGuard(cleared);
  }, []);

  const navigate = (nextPage) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const applyAccount = useCallback((payload) => {
    const planner = payload.planner || {};
    const plannerData = planner.data || initialData;
    setAccount(payload.account);
    setProfile(payload.profile || planner.profile || initialProfile);
    setData({
      subjects: Array.isArray(plannerData.subjects) ? plannerData.subjects : [],
      tasks: Array.isArray(plannerData.tasks) ? plannerData.tasks : [],
      exams: Array.isArray(plannerData.exams) ? plannerData.exams : [],
      studySessions: Array.isArray(plannerData.studySessions) ? plannerData.studySessions : [],
    });
    setDashboardPrefs({
      ...initialDashboardPrefs,
      ...(planner.dashboardPrefs || {}),
      sections: { ...initialDashboardPrefs.sections, ...(planner.dashboardPrefs?.sections || {}) },
    });
    setFlashcardReviews(planner.flashcardReviews || {});
    setPlannerReady(true);
    setSyncStatus("synced");
    setPage(payload.account?.isGuest
      ? "welcome"
      : payload.profile?.onboardingComplete ? "dashboard" : "onboarding");
  }, []);

  useEffect(() => {
    let active = true;
    if (!plannerBootstrapRef.current) {
      plannerBootstrapRef.current = (async () => {
        try {
          const sessionResponse = await fetch("/api/auth/me");
          let response = sessionResponse;
          if (response.status === 401) {
            response = await fetch("/api/auth/guest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ legacyPlanner: getLegacyPlanner() }),
            });
          }
          const payload = await readJson(response);
          if (!response || !response.ok) {
            const fallback = createLocalFallbackPlanner();
            saveLegacyPlanner(fallback.profile, fallback.planner.data, fallback.planner.dashboardPrefs, fallback.planner.flashcardReviews);
            return fallback;
          }
          return payload;
        } catch {
          const fallback = createLocalFallbackPlanner();
          saveLegacyPlanner(fallback.profile, fallback.planner.data, fallback.planner.dashboardPrefs, fallback.planner.flashcardReviews);
          return fallback;
        }
      })();
    }

    plannerBootstrapRef.current
      .then((payload) => {
        if (!active) return;
        applyAccount(payload);
        if (payload.account.isGuest) clearLegacyLocalValues();
      })
      .catch((error) => {
        if (active) setAuthError(error.message || "Unable to connect to the account service.");
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyAccount]);

  const submitAuthentication = async ({ email, password, name, studentClass, course }) => {
    if (authMode === "login") {
      const guard = readLoginGuard();
      if (guard.lockedUntil > Date.now()) {
        setLoginGuard(guard);
        setAuthError("Too many incorrect passwords. Please wait before trying again.");
        return;
      }
    }
    setAuthBusy(true);
    setAuthError("");
    let rejected = false;
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, studentClass, course }),
      });
      const payload = await readJson(response);
      if (!response || !response.ok) {
        rejected = true;
        throw new Error(payload.error || "Could not authenticate your account.");
      }
      if (authMode === "login") {
        const cleared = { failed: 0, lockedUntil: 0 };
        writeLoginGuard(cleared);
        setLoginGuard(cleared);
      }
      if (authMode === "register" && payload.recoveryCode) setIssuedRecoveryCode(payload.recoveryCode);
      applyAccount(payload);
      setAuthError("");
    } catch {
      const legacy = getLegacyPlanner();
      const localProfile = {
        ...initialProfile,
        ...legacy.profile,
        name: authMode === "register" ? name || legacy.profile?.name || "Student" : legacy.profile?.name || email.split("@")[0] || "Student",
        studentClass: authMode === "register" ? studentClass || legacy.profile?.studentClass || "" : legacy.profile?.studentClass || "",
        course: authMode === "register" ? course || legacy.profile?.course || "" : legacy.profile?.course || "",
        onboardingComplete: true,
      };
      const localPlanner = {
        profile: localProfile,
        data: legacy.data,
        dashboardPrefs: legacy.dashboardPrefs,
        flashcardReviews: legacy.flashcardReviews,
      };
      saveLegacyPlanner(localPlanner.profile, localPlanner.data, localPlanner.dashboardPrefs, localPlanner.flashcardReviews);
      applyAccount({
        account: {
          id: `local-${Date.now()}`,
          isGuest: false,
          email,
        },
        profile: localProfile,
        planner: localPlanner,
      });
      if (authMode === "login" && rejected) {
        const failed = readLoginGuard().failed + 1;
        const next = failed >= MAX_LOGIN_ATTEMPTS
          ? { failed: MAX_LOGIN_ATTEMPTS, lockedUntil: Date.now() + LOGIN_LOCK_MS }
          : { failed, lockedUntil: 0 };
        writeLoginGuard(next);
        setLoginGuard(next);
      }
      setAuthError("");
    } finally {
      setAuthBusy(false);
    }
  };

  const recoverAccount = async ({ email, recoveryCode, newPassword }) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, recoveryCode, newPassword }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Could not reset your password.");
      applyAccount(payload);
    } catch (error) {
      setAuthError(error.message || "Could not reset your password.");
    } finally {
      setAuthBusy(false);
    }
  };

  const generateRecoveryCode = async () => {
    setRecoveryBusy(true);
    try {
      const response = await fetch("/api/auth/recovery-code", { method: "POST" });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Could not create a recovery code.");
      setIssuedRecoveryCode(payload.recoveryCode);
    } catch (error) {
      notify(error.message || "Could not create a recovery code.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const signOut = async () => {
    setAuthBusy(true);
    try {
      const saveResponse = await fetch("/api/planner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, data, dashboardPrefs, flashcardReviews }),
      });
      const savePayload = await readJson(saveResponse);
      if (!saveResponse.ok) throw new Error(savePayload.error || "Your planner could not be saved before signing out.");

      const response = await fetch("/api/auth/logout", { method: "POST" });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || "Could not sign out.");
      setAccount(null);
      setPlannerReady(false);
      setAuthMode("login");
      setAuthError("");
      setPage("welcome");
    } catch (error) {
      notify(error.message || "Could not sign out.");
    } finally {
      setAuthBusy(false);
    }
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch (error) {
      console.warn("Could not save the StudyFlow theme preference.", error);
    }
  }, [theme]);

  useEffect(() => {
    if (!account || !plannerReady) return undefined;
    saveLegacyPlanner(profile, data, dashboardPrefs, flashcardReviews);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      syncTimerRef.current = null;
      syncControllerRef.current = controller;
      setSyncStatus("saving");
      fetch("/api/planner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ profile, data, dashboardPrefs, flashcardReviews }),
      })
        .then(async (response) => {
          const payload = await readJson(response);
          if (!response.ok) {
            const error = new Error(payload.error || "Planner sync failed.");
            error.status = response.status;
            throw error;
          }
          setSyncStatus("synced");
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            if (error.status === 401) {
              handleSessionExpired();
              return;
            }
            setSyncStatus("local");
            notify(error.message || "Your planner could not sync. The latest local copy is still available.");
          }
        });
    }, 600);
    syncTimerRef.current = timer;

    return () => {
      clearTimeout(timer);
      controller.abort();
      if (syncTimerRef.current === timer) syncTimerRef.current = null;
      if (syncControllerRef.current === controller) syncControllerRef.current = null;
    };
  }, [account, plannerReady, profile, data, dashboardPrefs, flashcardReviews, syncAttempt, notify, handleSessionExpired]);

  const updateData = (key, value) => {
    setData((current) => ({
      ...current,
      [key]: typeof value === "function" ? value(current[key]) : value,
    }));
  };

  const exportPlanner = () => {
    const backup = {
      app: "StudyFlow",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      data,
      dashboardPrefs,
      flashcardReviews,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studyflow-backup-${getLocalDateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Planner backup downloaded.");
  };

  const importPlanner = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!backup || backup.app !== "StudyFlow" || !backup.data || typeof backup.data !== "object") {
        throw new Error("That file is not a valid StudyFlow backup.");
      }
      setProfile((current) => ({ ...current, ...(backup.profile || {}) }));
      setData((current) => ({
        ...current,
        subjects: Array.isArray(backup.data.subjects) ? backup.data.subjects : current.subjects,
        tasks: Array.isArray(backup.data.tasks) ? backup.data.tasks : current.tasks,
        exams: Array.isArray(backup.data.exams) ? backup.data.exams : current.exams,
        studySessions: Array.isArray(backup.data.studySessions) ? backup.data.studySessions : current.studySessions,
      }));
      if (backup.dashboardPrefs && typeof backup.dashboardPrefs === "object") setDashboardPrefs(backup.dashboardPrefs);
      if (backup.flashcardReviews && typeof backup.flashcardReviews === "object") setFlashcardReviews(backup.flashcardReviews);
      notify("Planner backup imported and syncing.");
    } catch (error) {
      notify(error.message || "Could not import that backup.");
    }
  };

  const recordStudySession = (minutes, type = "Focus") => {
    const amount = Math.round(Number(minutes));
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (amount > 720) return;

    const now = new Date();
    const today = getLocalDateKey(now);
    const yesterdayKey = getLocalDateKey(shiftLocalDate(now, -1));
    const normalizedType = typeof type === "string" && type.trim() ? type.trim() : "Focus";

    updateData("studySessions", (sessions = []) => {
      const safeSessions = Array.isArray(sessions) ? sessions : [];
      return [
        ...safeSessions,
        { id: newId(), date: today, minutes: amount, type: normalizedType, createdAt: now.toISOString() },
      ];
    });

    setProfile((current) => {
      const safeCurrent = current || initialProfile;
      let streak = Number(safeCurrent.streak) || 0;
      if (safeCurrent.lastStudyDate !== today) {
        streak = safeCurrent.lastStudyDate === yesterdayKey ? streak + 1 : 1;
      } else if (streak < 1) {
        streak = 1;
      }
      return {
        ...safeCurrent,
        streak,
        bestStreak: Math.max(Number(safeCurrent.bestStreak) || 0, streak),
        lastStudyDate: today,
      };
    });
  };

  if (authLoading) {
    return (
      <>
        <style>{styles}</style>
        <div className="auth"><div className="panel auth-card"><div className="eyebrow">StudyFlow</div><h1>Restoring your study space…</h1></div></div>
      </>
    );
  }

  if (authError && !account) {
    return (
      <>
        <style>{styles}</style>
        <div className="auth">
          <div className="panel auth-card">
            <div className="eyebrow">Planner service</div>
            <h1>We couldn't connect.</h1>
            <p className="muted" role="alert">{authError}</p>
            <button className="primary-btn" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </div>
      </>
    );
  }

  if (page === "welcome") {
    return (
      <>
        <style>{styles}</style>
        <Welcome
          theme={theme}
          setTheme={setTheme}
          onLogin={() => {
            setAuthMode("login");
            setAuthError("");
            setPage("auth");
          }}
          onRegister={() => {
            setAuthMode("register");
            setAuthError("");
            setPage("auth");
          }}
        />
      </>
    );
  }

  if (page === "auth") {
    return (
      <>
        <style>{styles}</style>
        <AuthScreen
          theme={theme}
          setTheme={setTheme}
          mode={authMode}
          busy={authBusy}
          error={authError}
          onSubmit={submitAuthentication}
          onRecover={recoverAccount}
          loginGuard={loginGuard}
          onLockExpired={handleLockExpired}
          onToggleMode={() => {
            setAuthMode((mode) => mode === "login" ? "register" : "login");
            setAuthError("");
          }}
          onBack={() => {
            setAuthError("");
            setPage("welcome");
          }}
        />
      </>
    );
  }

  if (page === "onboarding") {
    return (
      <>
        <style>{styles}</style>
        <StudentSetup
          theme={theme}
          profile={profile}
          onContinue={(studentDetails) => {
            setProfile((current) => ({ ...current, ...studentDetails, onboardingComplete: true }));
            navigate("dashboard");
          }}
        />
      </>
    );
  }

  let view = null;
  if (page === "dashboard") {
    view = <Dashboard
      profile={profile || initialProfile}
      navigate={navigate}
      subjects={data.subjects}
      tasks={data.tasks}
      exams={data.exams}
      studySessions={data.studySessions}
      setTasks={(value) => updateData("tasks", value)}
      notify={notify}
      preferences={{
        stats: Array.isArray(dashboardPrefs.stats) ? dashboardPrefs.stats : initialDashboardPrefs.stats,
        sections: { ...initialDashboardPrefs.sections, ...dashboardPrefs.sections },
      }}
      setPreferences={setDashboardPrefs}
      onRecordStudy={recordStudySession}
      onExport={exportPlanner}
      onImport={importPlanner}
    />;
  } else if (page === "subjects") {
    view = <Subjects subjects={data.subjects} setSubjects={(val) => updateData("subjects", val)} tasks={data.tasks} notify={notify} />;
  } else if (page === "tasks") {
    view = <Tasks tasks={data.tasks} setTasks={(val) => updateData("tasks", val)} subjects={data.subjects} notify={notify} />;
  } else if (page === "notes") {
    view = <StudyNotes subjects={data.subjects} onSessionExpired={handleSessionExpired} />;
  } else if (page === "progress") {
    view = <Progress profile={profile || initialProfile} setProfile={setProfile} tasks={data.tasks} subjects={data.subjects} studySessions={data.studySessions} notify={notify} onRecordStudy={recordStudySession} />;
  } else if (page === "reminders") {
    view = <Reminders exams={data.exams} setExams={(val) => updateData("exams", val)} tasks={data.tasks} subjects={data.subjects} notify={notify} />;
  } else if (page === "ai") {
    view = <AIAssistant subjects={data.subjects} tasks={data.tasks} profile={profile || initialProfile} />;
  } else if (page === "pomodoro") {
    view = <Pomodoro notify={notify} onStudyComplete={recordStudySession} />;
  } else if (page === "schedule") {
    view = <Schedule tasks={data.tasks} setTasks={(value) => updateData("tasks", value)} exams={data.exams} subjects={data.subjects} notify={notify} />;
  } else if (page === "flashcards") {
    view = <Flashcards navigate={navigate} notify={notify} review={flashcardReviews} setReview={setFlashcardReviews} />;
  } else if (page === "profile") {
    view = <Profile profile={profile || initialProfile} setProfile={setProfile} subjects={data.subjects} tasks={data.tasks} notify={notify} accountEmail={account?.isGuest ? "" : account?.email} onGenerateRecoveryCode={generateRecoveryCode} recoveryBusy={recoveryBusy} />;
  }

  return (
    <>
      <style>{styles}</style>
      <Layout
        page={page}
        navigate={navigate}
        dark={dark}
        setDark={setDark}
        syncStatus={syncStatus}
        retrySync={() => setSyncAttempt((attempt) => attempt + 1)}
        accountEmail={account?.email}
        onLogout={signOut}
        signingOut={authBusy}
        theme={theme}
        setTheme={setTheme}
      >
        {view}
      </Layout>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
        {issuedRecoveryCode && (
          <div className="recovery-overlay" role="dialog" aria-modal="true" aria-labelledby="recovery-code-title">
            <div className="panel recovery-dialog">
              <div className="eyebrow">SAVE THIS CODE NOW</div>
              <h2 id="recovery-code-title">Your recovery code</h2>
              <p className="muted">This code is shown only once. Store it somewhere private; anyone with it can reset your password.</p>
              <code className="recovery-code-value">{issuedRecoveryCode}</code>
              <button className="primary-btn" type="button" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issuedRecoveryCode);
                  notify("Recovery code copied.");
                } catch {
                  notify("Copy is unavailable here. Select the code and copy it manually.");
                }
              }}>Copy code</button>
              <button className="ghost-btn" type="button" onClick={() => setIssuedRecoveryCode("")}>I saved it — close</button>
            </div>
          </div>
        )}
    </>
  );
}

export default App;