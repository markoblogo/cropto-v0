import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const options = pgTable("options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  type: text("type", { enum: ["CALL", "PUT"] }).notNull(),
  strike: decimal("strike", { precision: 18, scale: 8 }).notNull(),
  qty: decimal("qty", { precision: 18, scale: 8 }).notNull(),
  premium: decimal("premium", { precision: 18, scale: 8 }).notNull(),
  buyer: text("buyer").notNull(),
  status: text("status", { enum: ["OPEN", "FILLED", "EXPIRED", "CANCELLED"] }).notNull().default("OPEN"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOptionSchema = createInsertSchema(options).omit({
  id: true,
  createdAt: true,
}).extend({
  strike: z.coerce.number()
    .positive("Strike price must be positive")
    .min(0.00000001, "Strike price must be greater than 0")
    .transform(val => val.toString()),
  qty: z.coerce.number()
    .positive("Quantity must be positive")
    .min(0.00000001, "Quantity must be greater than 0")
    .transform(val => val.toString()),
  premium: z.coerce.number()
    .positive("Premium must be positive")
    .min(0.00000001, "Premium must be greater than 0")
    .transform(val => val.toString()),
});

export type InsertOption = z.infer<typeof insertOptionSchema>;
export type Option = typeof options.$inferSelect;
