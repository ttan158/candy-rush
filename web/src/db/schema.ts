import {
  doublePrecision,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const calls = pgTable("calls", {
  id: uuid().primaryKey().defaultRandom(),
  callerNumber: text().notNull(),
  transcript: text().notNull(),
  recordingUrl: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const candies = pgTable("candies", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const houses = pgTable("houses", {
  id: uuid().primaryKey().defaultRandom(),
  latitude: doublePrecision().notNull(),
  longitude: doublePrecision().notNull(),
  address: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid().primaryKey().defaultRandom(),
  callId: uuid()
    .notNull()
    .references(() => calls.id, { onDelete: "cascade" }),
  houseId: uuid()
    .notNull()
    .references(() => houses.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const reportCandies = pgTable("report_candies", {
  id: uuid().primaryKey().defaultRandom(),
  reportId: uuid()
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  candyId: uuid()
    .notNull()
    .references(() => candies.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
