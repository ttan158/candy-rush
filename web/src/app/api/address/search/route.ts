import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam || 5), 1), 10);

    if (!query) {
      return NextResponse.json(
        { error: "Missing 'q' query param" },
        { status: 400 }
      );
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Mapbox access token not configured" },
        { status: 500 }
      );
    }

    // Bounding box for the Auckland region (approx)
    const bbox = "174.189788,-37.531833,175.337859,-36.618059";

    const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query
    )}.json?access_token=${encodeURIComponent(
      token
    )}&autocomplete=true&limit=${limit}&country=nz&bbox=${bbox}`;

    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Address lookup failed" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      features?: Array<{ place_name: string; center: [number, number] }>;
    };

    const features = data.features || [];
    if (features.length === 0) {
      return NextResponse.json(
        { error: "Invalid address not found. Please recheck with user." },
        { status: 404 }
      );
    }

    const matches = features.map((f) => ({
      address: f.place_name,
      longitude: f.center?.[0],
      latitude: f.center?.[1],
    }));

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Error searching address:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
