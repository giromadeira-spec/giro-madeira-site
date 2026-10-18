-- A cleared photograph resumes media preparation, never editorial approval or publication.
create or replace function public.giro_resume_photo_preparation()
returns trigger language plpgsql set search_path=public,pg_catalog as $$
begin
 if new.approval_status<>'approved' then return new; end if;
 update public.giro_social_video_queue
 set shorts_render_error=null,updated_at=now()
 where source_url=new.article_url and title=new.headline
   and platform in ('youtube_shorts','tiktok') and status='pronto_para_revisao'
   and shorts_render_version=0 and provider_post_id is null
   and shorts_render_error='event_photo_rights_review_required';
 update public.giro_publicacoes_feed set preparation_attempts=0,preparation_retry_at=now()
 where fonte_url=new.article_url and titulo=new.headline and status='pendente'
   and visual_approved is distinct from true and media_status='aguardando_foto_licenciada'
   and editorial_expires_at>now();
 update public.giro_publicacoes_stories set preparation_attempts=0,preparation_retry_at=now()
 where fonte_url=new.article_url and titulo=new.headline and status='pendente'
   and visual_approved is distinct from true and media_status='aguardando_foto_licenciada'
   and editorial_expires_at>now();
 update public.giro_publicacoes_reels set preparation_attempts=0,preparation_retry_at=now()
 where fonte_url=new.article_url and titulo=new.headline and status='pendente'
   and visual_approved is distinct from true and media_status='aguardando_foto_licenciada'
   and editorial_expires_at>now();
 return new;
end $$;
revoke all on function public.giro_resume_photo_preparation() from public,anon,authenticated;
grant execute on function public.giro_resume_photo_preparation() to service_role;
create trigger giro_resume_photo_preparation after insert or update of approval_status,storage_path
on public.giro_imagens_autorizadas for each row execute function public.giro_resume_photo_preparation();
