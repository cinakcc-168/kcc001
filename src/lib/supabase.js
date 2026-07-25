import {createClient} from '@supabase/supabase-js';
let promise;
export function getSupabase(){if(!promise)promise=(async()=>{const r=await fetch('/api/public-config');const c=await r.json();if(!r.ok||!c.ok)throw new Error(c.error||'Could not load configuration');return createClient(c.supabaseUrl,c.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})})();return promise}
