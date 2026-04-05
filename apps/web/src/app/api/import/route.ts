import { NextRequest, NextResponse } from "next/server";
import { importReservations } from "@/lib/services/reservation";
import { autoAssign } from "@/lib/services/assignment";
import { importRequestSchema } from "@/lib/utils/validation";
import { db } from "@/lib/db";
import { importLog } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  try {
    const expectedKey = process.env.IMPORT_API_KEY;
    const providedKey = request.headers.get("x-api-key");
    if (!expectedKey || providedKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = importRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Import reservations
    const { newIds, duplicateCount, errors } = await importReservations(
      parsed.data.reservations
    );

    // Auto-assign newly imported reservations
    let assignmentResult = { assigned: 0, unassigned: 0, errors: [] as string[] };
    if (newIds.length > 0) {
      assignmentResult = await autoAssign(newIds);
    }

    // Log the import
    const source = parsed.data.reservations[0]?.source || "unknown";
    await db.insert(importLog).values({
      source,
      reservationsCount: parsed.data.reservations.length,
      newCount: newIds.length,
      duplicateCount,
      errorCount: errors.length,
    });

    return NextResponse.json({
      imported: newIds.length,
      duplicates: duplicateCount,
      assigned: assignmentResult.assigned,
      unassigned: assignmentResult.unassigned,
      errors: [...errors, ...assignmentResult.errors],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
