export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Missing Supabase environment variables (SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY)."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response(
    JSON.stringify({ ok: true, supabaseUrl, supabaseKey }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
};
