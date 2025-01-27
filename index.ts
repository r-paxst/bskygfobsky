import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Change these as needed or load from env vars in Deno Deploy
const FEED_DID = Deno.env.get("FEED_DID") ?? "did:plc:5x7g63oe642b5apm7nbi6e26";
const FEED_ID = Deno.env.get("FEED_ID") ?? "gayfriendsof";
const FEED_NAME = Deno.env.get("FEED_NAME") ?? "Gay Friends Of";

function describeFeedGenerator() {
  return {
    did: FEED_DID,
    feeds: [
      {
        uri: `at://${FEED_DID}/app.bsky.feed.generator/${FEED_ID}`,
        name: FEED_NAME,
        avatar:
          Deno.env.get("FEED_AVATAR") ??
          "https://example.com/path/to/feed-avatar.png",
      },
    ],
  };
}

async function getFeedSkeleton(cursor: string | null, limit: number) {
  // Connect to Supabase using environment variables
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase credentials not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Query your table
  let query = supabase
    .from("gayfriendsof_bluesky_posts")
    .select("uri, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase Query Error:", error);
    throw new Error(`Database query failed: ${error.message}`);
  }

  // Build and return feed skeleton
  const feed = (data ?? []).map((row) => ({
    post: row.uri,
  }));

  let newCursor: string | null = null;
  if (data && data.length > 0) {
    newCursor = data[data.length - 1].created_at;
  }

  return {
    feed,
    cursor: newCursor,
  };
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);

    // Handle /xrpc/app.bsky.feed.describeFeedGenerator
    if (url.pathname === "/xrpc/app.bsky.feed.describeFeedGenerator") {
      return new Response(JSON.stringify(describeFeedGenerator()), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Handle /xrpc/app.bsky.feed.getFeedSkeleton
    if (url.pathname === "/xrpc/app.bsky.feed.getFeedSkeleton") {
      const limitParam = url.searchParams.get("limit") || "30";
      const limit = parseInt(limitParam, 10);

      const cursor = url.searchParams.get("cursor") || null;
      const skeleton = await getFeedSkeleton(cursor, limit);

      return new Response(JSON.stringify(skeleton), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Handle 404 Not Found
    return new Response("Not found", { status: 404 });
  } catch (error) {
    console.error("Error in feed generator:", error);
    return new Response(
      `Internal Server Error: ${(error as Error).message}`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});

console.log("Bluesky Feed Generator is running...");
