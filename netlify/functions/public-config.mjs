const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0'
};

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabasePublishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY
  )?.trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in Netlify environment variables.'
    }), {
      status: 500,
      headers: JSON_HEADERS
    });
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('SUPABASE_URL must use HTTPS.');
    }
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message || 'SUPABASE_URL is invalid.'
    }), {
      status: 500,
      headers: JSON_HEADERS
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    supabaseUrl,
    supabasePublishableKey
  }), {
    status: 200,
    headers: JSON_HEADERS
  });
};
