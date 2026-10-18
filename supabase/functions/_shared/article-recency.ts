// The article publication date is evidence; collection and render dates are not.
export function articleTimestamp(published:string,url:string):number {
 let value=published;
 if(!value){
  try {
   const dated=new URL(url).pathname.match(/\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/);
   if(dated)value=dated[1]+'-'+dated[2]+'-'+dated[3]+'T12:00:00Z';
  } catch {return NaN;}
 }
 return Date.parse(value);
}
export function articleIsFresh(published:string,url:string,reference=Date.now(),observed=Date.now()):boolean {
 const time=articleTimestamp(published,url);
 return Number.isFinite(time)&&time>=reference-24*3600000&&time<=Math.min(reference,observed)+300000;
}
export function storyboardIsCurrent(row:any,now=Date.now()):boolean {
 const time=Date.parse(String(row?.storyboard_source_published_at||''));
 const slot=Date.parse(String(row?.scheduled_for||''));
 return row?.storyboard_status==='preparado'&&Number.isFinite(time)&&Number.isFinite(slot)&&
   time<=now+300000&&time>=Math.max(now,slot)-24*3600000;
}
