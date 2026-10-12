export function articleIsFresh(published:string,url:string,now=Date.now()):boolean {
 // A published date on the article always takes precedence over a URL or discovery date.
 let value=published;
 if(!value){
   const dated=new URL(url).pathname.match(/\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/);
   if(dated)value=dated[1]+'-'+dated[2]+'-'+dated[3]+'T12:00:00Z';
 }
 const time=Date.parse(value);
 return Number.isFinite(time)&&time>=now-24*3600000&&time<=now+300000;
}
