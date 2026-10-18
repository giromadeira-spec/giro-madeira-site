export function sourceRecovery(error:string|null,retries:number):'retry'|'hold'|null {
 if(!error||!/source_http_(429|5\d\d)|source_fetch_or_parse_failed/.test(error))return null;
 return retries<2?'retry':'hold';
}
