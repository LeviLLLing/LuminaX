import type { NextRequest } from "next/server";
import { DataAccessDeniedError } from "@/modules/admin/permissions/access-control";
import { accessControl } from "@/modules/admin/permissions/permission-composition";
import {
  authenticateRequest,
  unauthenticatedResponse,
} from "@/modules/auth/auth-http";
import { salesDataRepository } from "@/modules/data-source/sales-data-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const user = await authenticateRequest(request);
  if (!user) return unauthenticatedResponse();
  try {
    const salesData = await salesDataRepository.loadSalesData();
    const filteredData = await accessControl.filterSalesData(
      user.id,
      salesData
    );
    return Response.json(filteredData, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DataAccessDeniedError) {
      return Response.json(
        { error: error.message },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error("Failed to load sales data:", error);
    return Response.json(
      { error: "Data not loaded" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
