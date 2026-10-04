const cargos = {
  'presidente': {eleicao:'6257', uf:'br', codigo:'0001'},
  'governador': {eleicao:'6259', uf:'ro', codigo:'0003'},
  'senador': {eleicao:'6259', uf:'ro', codigo:'0005'},
  'deputado-federal': {eleicao:'6259', uf:'ro', codigo:'0006'},
  'deputado-estadual': {eleicao:'6259', uf:'ro', codigo:'0007'}
};

exports.handler = async function(event){
  const cargo = event.queryStringParameters?.cargo || 'governador';
  const cfg = cargos[cargo];
  const headers = {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'public, max-age=15',
    'Netlify-CDN-Cache-Control':'public, durable, s-maxage=30, stale-while-revalidate=120',
    'Access-Control-Allow-Origin':'*'
  };

  if(!cfg){
    return {statusCode:400,headers,body:JSON.stringify({ok:false,message:'Cargo inválido'})};
  }

  const eleicaoArquivo = cfg.eleicao.padStart(6,'0');
  const arquivo = `${cfg.uf}-c${cfg.codigo}-e${eleicaoArquivo}-u.json`;
  const url = `https://resultados.tse.jus.br/oficial/ele2026/${cfg.eleicao}/dados/${cfg.uf}/${arquivo}`;

  try{
    const resposta = await fetch(url,{headers:{'Accept':'application/json'}});
    if(!resposta.ok){
      const status = resposta.status === 404 ? 202 : 502;
      return {statusCode:status,headers:{...headers,'Cache-Control':'public, max-age=30','Netlify-CDN-Cache-Control':'public, durable, s-maxage=120, stale-while-revalidate=300'},body:JSON.stringify({ok:false,message:resposta.status===404?'Aguardando a disponibilização do arquivo oficial pelo TSE':'O TSE não respondeu normalmente neste momento',source:'TSE'})};
    }
    const data = await resposta.json();
    return {statusCode:200,headers,body:JSON.stringify({ok:true,source:'TSE',cargo,data})};
  }catch(error){
    return {statusCode:502,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:false,message:'Não foi possível consultar o TSE neste momento',source:'TSE'})};
  }
};