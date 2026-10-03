const test = require("node:test");
const assert = require("node:assert/strict");

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:5003";
let cookie = "";

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const body = await response.json();
  return { response, body };
}

test("planner and notes API persists a private study workflow", async () => {
  const guest = await request("/api/auth/guest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(guest.response.status, 200);
  assert.equal(guest.body.account.isGuest, true);

  const savedPlanner = await request("/api/planner", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profile: { name: "API Test Student", dailyGoal: 60 },
      data: {
        subjects: [],
        tasks: [],
        exams: [],
        studySessions: [],
        activityLog: [{ id: "history-test", kind: "task_completed", title: "Completed task: Test", details: "Testing", entityId: "task-1", createdAt: new Date().toISOString() }],
      },
      dashboardPrefs: { stats: ["today"], sections: { tasks: true, exams: true, subjects: true } },
      flashcardReviews: {},
    }),
  });
  assert.equal(savedPlanner.response.status, 200);
  const restoredPlanner = await request("/api/planner");
  assert.equal(restoredPlanner.response.status, 200);
  assert.equal(restoredPlanner.body.planner.data.activityLog[0].id, "history-test");

  const created = await request("/api/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "API test note",
      subject: "Testing",
      category: "Revision",
      tags: ["api", "test"],
      content: "Created by the API test.",
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.note.category, "Revision");
  assert.deepEqual(created.body.note.tags, ["api", "test"]);

  const noteId = created.body.note._id;
  const guestId = guest.body.account.id;
  const email = `notes-${Date.now()}@example.test`;
  const password = "PersistentNotes!123";
  const registered = await request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name: "API Test Student",
      studentClass: "Year 1",
      course: "Test Course",
    }),
  });
  assert.equal(registered.response.status, 200);
  assert.equal(registered.body.account.id, guestId);

  const notesAfterRegistration = await request("/api/notes");
  assert.ok(notesAfterRegistration.body.notes.some((note) => note._id === noteId));

  const signedOut = await request("/api/auth/logout", { method: "POST" });
  assert.equal(signedOut.response.status, 200);

  const signedIn = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signedIn.response.status, 200);
  assert.equal(signedIn.body.account.id, guestId);

  const notesAfterLogin = await request("/api/notes");
  assert.equal(notesAfterLogin.response.status, 200);
  assert.ok(notesAfterLogin.body.notes.some((note) => note._id === noteId));

  const updated = await request(`/api/notes/${noteId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "Updated API test note",
      subject: "Testing",
      category: "Exam prep",
      tags: ["updated"],
      content: "Updated by the API test.",
    }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.note.category, "Exam prep");

  const listed = await request("/api/notes");
  assert.equal(listed.response.status, 200);
  assert.ok(listed.body.notes.some((note) => note._id === noteId));

  const deleted = await request(`/api/notes/${noteId}`, { method: "DELETE" });
  assert.equal(deleted.response.status, 200);

  const notesAfterDelete = await request("/api/notes");
  assert.equal(notesAfterDelete.response.status, 200);
  assert.ok(!notesAfterDelete.body.notes.some((note) => note._id === noteId));
});
