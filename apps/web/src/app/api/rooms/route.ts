import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rooms, beds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { RoomWithBeds } from "@/types";

export async function GET() {
  try {
    const allRooms = await db.select().from(rooms).orderBy(rooms.id);
    const allBeds = await db.select().from(beds).orderBy(beds.bedNumber);

    const result: RoomWithBeds[] = allRooms.map((room) => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      roomType: room.roomType as "mixed" | "female",
      floor: room.floor,
      beds: allBeds
        .filter((b) => b.roomId === room.id)
        .map((b) => ({
          id: b.id,
          bedNumber: b.bedNumber,
          label: b.label,
        })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
