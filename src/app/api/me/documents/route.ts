import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { submitDocument } from "@/services/documents";

// FR-DRV-02, FR-VEH-01..03 · multipart: owner_type, owner_id, doc_type, fields (JSON), file
const Meta = z.strictObject({
  owner_type: z.enum(["driver", "vehicle"]),
  owner_id: z.uuid(),
  doc_type: z.string().min(2).max(40),
  fields: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["driver"]);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new BizError("VALIDATION", { file: "required" });
    let fields: unknown;
    try {
      fields = JSON.parse(String(form.get("fields") ?? "{}"));
    } catch {
      throw new BizError("VALIDATION", { fields: "json" });
    }
    const meta = Meta.parse({
      owner_type: form.get("owner_type"),
      owner_id: form.get("owner_id"),
      doc_type: form.get("doc_type"),
      fields,
    });
    const doc = await submitDocument(user, {
      ownerType: meta.owner_type, ownerId: meta.owner_id, docType: meta.doc_type, file, fields: meta.fields,
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
