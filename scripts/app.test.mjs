import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  addDays,
  createBook,
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

test("creates seven simulated lessons scheduled on consecutive local dates", () => {
  const storage = createStorage();
  const book = createBook("A Book", "2026-12-29", storage);

  assert.equal(book.lessons.length, 7);
  assert.deepEqual(book.lessons.map((lesson) => lesson.date), [
    "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04",
  ]);
  assert.equal(readDatabase(storage).books[0].title, "A Book");
});

test("rejects blank titles and invalid local dates", () => {
  assert.throws(() => createBook("  ", "2026-01-01", createStorage()), /book title/i);
  assert.equal(isDateKey("2026-02-30"), false);
  assert.throws(() => createBook("A Book", "2026-02-30", createStorage()), /valid start date/i);
});

test("prevents duplicate lesson dates and persists rescheduling and completion", () => {
  const storage = createStorage();
  const book = createBook("A Book", "2026-11-17", storage);
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