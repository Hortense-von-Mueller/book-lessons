import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";
import {
  STORAGE_KEY,
  addDays,
  createBook,
  LESSON_COUNT,
  isDateKey,
  readDatabase,
  setLessonCompleted,
  toLocalDateKey,
  updateLessonDate,
} from "./app.mjs";

function createStorage(initialValue = null) {
  const values = new Map(initialValue === null ? [] : [[STORAGE_KEY, initialValue]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function generatedLessons() {
  return Array.from({ length: LESSON_COUNT }, (_, index) => ({
    title: `Lesson ${index + 1}`,
    action: `Apply idea ${index + 1}`,
    reflection: `Reflect on idea ${index + 1}`,
  }));
}

test("stores generated lessons on consecutive local dates", () => {
  const storage = createStorage();
  const lessons = generatedLessons();
  const book = createBook("A Book", "2026-12-29", lessons, storage);

  assert.equal(book.lessons.length, LESSON_COUNT);
  assert.deepEqual(book.lessons.map(({ title, action, reflection }) => ({ title, action, reflection })), lessons);
  assert.deepEqual(book.lessons.map((lesson) => lesson.date), [
    "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04",
  ]);
  assert.equal(readDatabase(storage).books[0].title, "A Book");
});

test("rejects blank titles and invalid local dates", () => {
  assert.throws(() => createBook("  ", "2026-01-01", generatedLessons(), createStorage()), /book title/i);
  assert.equal(isDateKey("2026-02-30"), false);
  assert.throws(() => createBook("A Book", "2026-02-30", generatedLessons(), createStorage()), /valid start date/i);
  assert.throws(() => createBook("A Book", "2026-01-01", [], createStorage()), /7 complete lessons/i);
});

test("prevents duplicate lesson dates and persists rescheduling and completion", () => {
  const storage = createStorage();
  const book = createBook("A Book", "2026-11-17", generatedLessons(), storage);
  assert.throws(
    () => updateLessonDate(book.id, book.lessons[1].id, book.lessons[0].date, storage),
    /one lesson.*per day/i,
  );

  updateLessonDate(book.id, book.lessons[0].id, "2026-11-25", storage);
  setLessonCompleted(book.id, book.lessons[0].id, true, storage);
  const saved = readDatabase(storage).books[0].lessons[0];
  assert.equal(saved.date, "2026-11-25");
  assert.equal(saved.completed, true);
});

test("treats malformed stored data as an empty database", () => {
  assert.deepEqual(readDatabase(createStorage("not-json")), { version: 1, books: [] });
  assert.deepEqual(readDatabase(createStorage(JSON.stringify({ version: 1, books: [{ id: "bad" }] }))), {
    version: 1,
    books: [],
  });
});

test("date helpers use local calendar arithmetic", () => {
  assert.equal(addDays("2026-03-07", 1), "2026-03-08");
  assert.equal(toLocalDateKey(new Date(2026, 10, 17)), "2026-11-17");
});

test("serves the app locally without exposing the secret file", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const server = createServer();
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    assert.equal((await fetch(baseUrl)).status, 200);
    assert.match(await (await fetch(`${baseUrl}/designs/data-dense/`)).text(), /Generate seven lessons/);
    assert.equal((await fetch(`${baseUrl}/.env`)).status, 404);
    const response = await fetch(`${baseUrl}/api/generate-lessons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "A Book" }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /OPENAI_API_KEY/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});