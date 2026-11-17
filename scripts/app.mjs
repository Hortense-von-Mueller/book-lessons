export const STORAGE_KEY = "fieldnotes.books.v1";
export const LESSON_COUNT = 7;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function addDays(dateKey, days) {
  if (!isDateKey(dateKey)) throw new TypeError("A valid local date is required.");
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function isValidDatabase(value) {
  return value?.version === 1 && Array.isArray(value.books) && value.books.every((book) =>
    typeof book.id === "string" &&
    typeof book.title === "string" &&
    isDateKey(book.startDate) &&
    Array.isArray(book.lessons) &&
    book.lessons.length === LESSON_COUNT &&
    book.lessons.every((lesson) =>
      typeof lesson.id === "string" &&
      typeof lesson.title === "string" &&
      typeof lesson.action === "string" &&
      typeof lesson.reflection === "string" &&
      (lesson.date === null || isDateKey(lesson.date)) &&
      typeof lesson.completed === "boolean"
    )
  );
}

export function readDatabase(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, books: [] };
    const parsed = JSON.parse(raw);
    return isValidDatabase(parsed) ? parsed : { version: 1, books: [] };
  } catch {
    return { version: 1, books: [] };
  }
}

function writeDatabase(database, storage = globalThis.localStorage) {
  if (!storage) throw new Error("Browser storage is unavailable.");
  storage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export function createBook(title, startDate, lessons, storage = globalThis.localStorage) {
  const cleanTitle = String(title ?? "").trim();
  if (!cleanTitle) throw new TypeError("Enter a book title.");
  if (!isDateKey(startDate)) throw new TypeError("Choose a valid start date.");
  if (!Array.isArray(lessons) || lessons.length !== LESSON_COUNT || lessons.some((lesson) =>
    ![lesson?.title, lesson?.action, lesson?.reflection].every((value) => typeof value === "string" && value.trim())
  )) {
    throw new TypeError(`The book service must return ${LESSON_COUNT} complete lessons.`);
  }

  const database = readDatabase(storage);
  const book = {
    id: makeId(),
    title: cleanTitle,
    createdAt: new Date().toISOString(),
    startDate,
    lessons: lessons.map((lesson, index) => ({
      id: makeId(),
      title: lesson.title.trim(),
      action: lesson.action.trim(),
      reflection: lesson.reflection.trim(),
      date: addDays(startDate, index),
      completed: false,
    })),
  };
  database.books.unshift(book);
  writeDatabase(database, storage);
  return book;
}

export function updateLessonDate(bookId, lessonId, date, storage = globalThis.localStorage) {
  if (!isDateKey(date)) throw new TypeError("Choose a valid date.");
  const database = readDatabase(storage);
  const book = database.books.find((item) => item.id === bookId);
  const lesson = book?.lessons.find((item) => item.id === lessonId);
  if (!lesson) throw new Error("Lesson not found.");
  if (book.lessons.some((item) => item.id !== lessonId && item.date === date)) {
    throw new Error("Only one lesson can be scheduled per day.");
  }
  lesson.date = date;
  writeDatabase(database, storage);
  return lesson;
}

export function setLessonCompleted(bookId, lessonId, completed, storage = globalThis.localStorage) {
  const database = readDatabase(storage);
  const lesson = database.books.find((item) => item.id === bookId)?.lessons.find((item) => item.id === lessonId);
  if (!lesson) throw new Error("Lesson not found.");
  lesson.completed = Boolean(completed);
  writeDatabase(database, storage);
  return lesson;
}

export function deleteBook(bookId, storage = globalThis.localStorage) {
  const database = readDatabase(storage);
  database.books = database.books.filter((book) => book.id !== bookId);
  writeDatabase(database, storage);
}