import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { calls, houses, reports, candies, reportCandies } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      callerNumber,
      transcript,
      recordingUrl,
      address,
      latitude,
      longitude,
      candies: candyNames,
    } = body;

    if (
      !callerNumber ||
      !transcript ||
      !recordingUrl ||
      !latitude ||
      !longitude ||
      !candyNames?.length
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // --- 1. Upsert House ---
    let [house] = await db
      .select()
      .from(houses)
      .where(
        and(eq(houses.latitude, latitude), eq(houses.longitude, longitude))
      );

    if (!house) {
      [house] = await db
        .insert(houses)
        .values({ latitude, longitude, address })
        .returning();
    }

    // --- 2. Create Call ---
    const [call] = await db
      .insert(calls)
      .values({ callerNumber, transcript, recordingUrl })
      .returning();

    // --- 3. Create Report ---
    const [report] = await db
      .insert(reports)
      .values({ callId: call.id, houseId: house.id })
      .returning();

    // --- 4. Upsert Candies + Link ---
    for (const name of candyNames) {
      // Upsert candy
      let [candy] = await db
        .select()
        .from(candies)
        .where(eq(candies.name, name));

      if (!candy) {
        [candy] = await db.insert(candies).values({ name }).returning();
      }

      // Link to report
      await db.insert(reportCandies).values({
        reportId: report.id,
        candyId: candy.id,
      });
    }

    return NextResponse.json({
      success: true,
      reportId: report.id,
    });
  } catch (error) {
    console.error("Error creating report:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const results = await db
    .select({
      reportId: reports.id,
      latitude: houses.latitude,
      longitude: houses.longitude,
      address: houses.address,
      reportedAt: reports.createdAt,
      reporter: calls.callerNumber,
      candyNames: sql`ARRAY_AGG(candies.name)`,
    })
    .from(reports)
    .leftJoin(houses, eq(reports.houseId, houses.id))
    .leftJoin(calls, eq(reports.callId, calls.id))
    .leftJoin(reportCandies, eq(reportCandies.reportId, reports.id))
    .leftJoin(candies, eq(reportCandies.candyId, candies.id))
    .groupBy(reports.id, houses.id, calls.callerNumber, reports.createdAt);

  return NextResponse.json(results);
}
