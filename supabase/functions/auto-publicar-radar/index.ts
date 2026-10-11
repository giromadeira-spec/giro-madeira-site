import {createClient} from "npm:@supabase/supabase-js@2.57.0";
Deno.serve(async req=>{
 const url=Deno.env.get('SUPABASE_URL')||'',role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const db=createClient(url,role,{auth:{persistSession:false}});
 const key=req.headers.get('x-giro-db-key')||'';
 const auth=await db.rpc('validar_giro_dispatch_key',{p_key:key});
 if(auth.error||auth.data!==true)return new Response(JSON.stringify({success:false,error:'unauthorized'}),{status:401});
 // Compatibility calls route only to Feed. They cannot consume Reels/Stories/Shorts/TikTok.
 const body=await req.json().catch(()=>({}));
 return fetch(url+'/functions/v1/giro-instagram-preparar-independente',{method:'POST',headers:{'Content-Type':'application/json','x-giro-db-key':key},body:JSON.stringify({channel:'feed',dry_run:body.dry_run===true})});
});
