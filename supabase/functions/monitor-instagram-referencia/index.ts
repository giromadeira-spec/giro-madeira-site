import { createClient } from "npm:@supabase/supabase-js@2";

const H = {"Content-Type":"application/json"};

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const role = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !role) {
    return new Response(JSON.stringify({success:false,error:"Configuração interna ausente."}), {status:500,headers:H});
  }

  const sb = createClient(supabaseUrl, role);
  try {
    const provided = req.headers.get("x-giro-db-key") || "";
    const {data:valid,error:authError} = await sb.rpc("validar_giro_dispatch_key",{p_key:provided});
    if (authError) throw authError;
    if (valid !== true) return new Response(JSON.stringify({success:false,error:"Unauthorized"}),{status:401,headers:H});

    // Use the same securely stored OAuth token as the production publisher.
    // The legacy environment token can be stale or malformed. Never return tokens.
    const {data:storedTokenRows,error:storedTokenError}=await sb.rpc("giro_instagram_token_get");
    const token=String(storedTokenRows?.[0]?.token||"");
    if(storedTokenError||!token)return new Response(JSON.stringify({success:false,error:"instagram_stored_token_unavailable"}),{status:503,headers:H});

    const body = await req.json().catch(()=>({}));
    if (body.action === "quota") {
      // Read-only check of the publisher quota. Never create a container or publish.
      const accountId = "17841426644705819";
      const endpoint = new URL("https://graph.instagram.com/v26.0/" + accountId + "/content_publishing_limit");
      endpoint.searchParams.set("fields", "quota_usage,config");
      endpoint.searchParams.set("access_token", token);
      const result = await fetch(endpoint.toString(), {method:"GET",signal:AbortSignal.timeout(12000)});
      const payload = await result.json().catch(()=>({}));
      if (!result.ok) {
        return new Response(JSON.stringify({
          success:false,read_only:true,provider_http_status:result.status,
          code:payload?.error?.code??null,
          error_subcode:payload?.error?.error_subcode??null,
          message:String(payload?.error?.message||"provider_error").slice(0,200)
        }), {status:200,headers:H});
      }
      const quota = Array.isArray(payload?.data)?payload.data[0]:null;
      return new Response(JSON.stringify({
        success:true,read_only:true,provider_http_status:result.status,
        quota_usage:Number(quota?.quota_usage??0),
        quota_total:Number(quota?.config?.quota_total??0),
        quota_duration_seconds:Number(quota?.config?.quota_duration??0),
        publishing_endpoint_tested:false,
        note:"Read-only quota endpoint cannot prove that media_publish is currently allowed."
      }), {status:200,headers:H});
    }

    const username = String(body.username || "jornaleiro_rondonia").replace(/^@/,"").trim();
    if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) {
      return new Response(JSON.stringify({success:false,error:"Username inválido"}),{status:400,headers:H});
    }

    // The Giro OAuth token is an Instagram Login token, not a Facebook Page token.
    // Read ONLY the connected Instagram account's own media, never business_discovery.
    const endpoint = new URL("https://graph.instagram.com/v26.0/me/media");
    endpoint.searchParams.set("fields", "id,caption,media_type,permalink,timestamp,username");
    endpoint.searchParams.set("limit", "12");
    endpoint.searchParams.set("access_token", token);

    const r = await fetch(endpoint.toString());
    const data = await r.json().catch(()=>({}));

    if (!r.ok) {
      return new Response(JSON.stringify({
        success:false,
        provider:"instagram-own-media",
        status:r.status,
        error:data?.error?.message || JSON.stringify(data)
      }),{status:200,headers:H});
    }

    const media = (data?.data || []).map((m:any)=>({
      id:m.id,
      caption:m.caption || "",
      media_type:m.media_type,
      media_url:m.media_url || null,
      thumbnail_url:m.thumbnail_url || null,
      permalink:m.permalink || null,
      timestamp:m.timestamp || null,
      like_count:m.like_count ?? null,
      comments_count:m.comments_count ?? null
    }));

    return new Response(JSON.stringify({
      success:true,
      provider:"instagram-own-media",
      profile:{username:media[0]?.username||null},
      requested_username:username,
      media
    }),{status:200,headers:H});
  } catch (e) {
    return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:String(e)}),{status:500,headers:H});
  }
});