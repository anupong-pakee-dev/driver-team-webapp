import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { addBlock } from "@/services/drivers";

// FR-DISP-04: คนขับปิดช่วงเวลาที่ไม่รับงาน
const Body = z.strictObject({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  note: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["driver"]);
    const b = Body.parse(await req.json());
    return NextResponse.json({ id: await addBlock(user, b.from, b.to, b.note) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
