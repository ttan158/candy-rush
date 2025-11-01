import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { candies } from "@/db/schema";

export async function GET() {
  try {
    const rows = await db.select({ name: candies.name }).from(candies);
    const names = rows.map((r) => r.name);
    return NextResponse.json(names);
  } catch (error) {
    console.error("Error fetching candies:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
