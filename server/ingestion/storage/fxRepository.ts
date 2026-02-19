import { desc, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { appSettings } from "@shared/schema";
import type { FxSnapshot } from "../normalization/price";

export async function ensureFxTable(): Promise<void> {
  await db.execute(sql`
    create table if not exists fx_rates (
      id uuid primary key default gen_random_uuid(),
      as_of date not null,
      currency text not null,
      usd_per_unit numeric(20,10) not null,
      source text not null,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    )
  `);
  await db.execute(sql`create unique index if not exists fx_rates_uni_idx on fx_rates(as_of, currency, source)`);
}

export async function upsertFxRate(args: {
  asOf: string;
  currency: string;
  usdPerUnit: number;
  source: string;
}): Promise<void> {
  await ensureFxTable();
  const existing = await db.execute(sql`
    select id from fx_rates
    where as_of = ${args.asOf}::date
      and currency = ${args.currency}
      and source = ${args.source}
    limit 1
  `);
  const id = Array.isArray((existing as any).rows) && (existing as any).rows[0]?.id;
  if (id) {
    await db.execute(sql`
      update fx_rates
      set usd_per_unit = ${args.usdPerUnit}, updated_at = now()
      where id = ${id}
    `);
  } else {
    await db.execute(sql`
      insert into fx_rates(as_of, currency, usd_per_unit, source)
      values (${args.asOf}::date, ${args.currency}, ${args.usdPerUnit}, ${args.source})
    `);
  }
}

export async function latestFxSnapshot(): Promise<FxSnapshot> {
  await ensureFxTable();
  const rows = await db.execute(sql`
    select currency, usd_per_unit, as_of
    from fx_rates
    where as_of = (select max(as_of) from fx_rates)
  `);

  const map: Record<string, number> = { USD: 1 };
  let asOf: string | null = null;
  for (const row of ((rows as any).rows || []) as Array<{ currency: string; usd_per_unit: string; as_of: string }>) {
    map[String(row.currency).toUpperCase()] = Number.parseFloat(String(row.usd_per_unit));
    asOf = String(row.as_of);
  }

  // manual override from app settings (optional)
  try {
    const overrides = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, ["fx_override_ars_usd", "fx_override_brl_usd"]))
      .orderBy(desc(appSettings.updatedAt));
    for (const ov of overrides) {
      if (ov.key === "fx_override_ars_usd") map.ARS = Number.parseFloat(ov.value);
      if (ov.key === "fx_override_brl_usd") map.BRL = Number.parseFloat(ov.value);
    }
  } catch {
    // app_settings may be unavailable in isolated/demo DBs.
  }

  return { asOf, usdPerUnit: map };
}
