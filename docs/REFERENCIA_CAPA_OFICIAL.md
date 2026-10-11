# Referência visual aprovada pelo responsável — GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1

**Aprovada em 10/10/2026.** Base: imagem compartilhada na conversa, uma capa quadrada sobre abastecimento (logo circular do Giro Madeira, foto de bomba amarela, tag ECONOMIA, manchete em branco/amarelo e Rio Madeira na base). A manchete e o valor do exemplo NÃO são fatos verificados e NÃO devem ser reutilizados.

## Leitura fiel da composição
- **Topo (0–36% do quadro):** fotografia realista relacionada ao fato domina toda a tela. Logo circular oficial, grande, assentado no canto superior esquerdo e com alto contraste. Sem tarja de fundo maciça, sem cabeçalho duplicado.
- **Transição (≈40–48%):** etiqueta amarelo-vivo de categoria, recorte angular/geometria horizontal, ícone simples pertinente e filete amarelo estreito atravessando parte da largura.
- **Área principal (≈49–78%):** manchete de impacto, em caixa alta e peso extra-bold condensado; 1ª e 3ª linhas em **branco**, linha-chave em **amarelo**. Texto grande o suficiente para celular. O fundo fotográfico é escurecido em gradiente, sem cobri-lo com retângulo sólido. Se a manchete não couber, reduzir tipografia ou ajustar quebra em vez de cortar.
- **Apoio (≈79–84%):** separador amarelo e texto de apoio factual em branco, menor e legível.
- **Assinatura (≈85–100%):** paisagem do Rio Madeira/Ponte em faixa panorâmica de ponta a ponta, iluminação editorial e crédito discreto da fonte à direita. Rio Madeira é assinatura gráfica regional, NÃO local automático da ocorrência.

A referência autoriza o **estilo**, e NÃO autoriza: inventar preço, manchete, seta estatística, acontecimentos ou fotografia documental. A seta vermelha na capa original era contextual a uma pauta de alta; somente usar setas quando a informação verificada justificar.

## Prompt mestre (arte/fotografia + texto)
> Produza uma capa jornalística Giro Madeira com identidade visual `GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1`, preservando exatamente a hierarquia da referência aprovada: foto forte como plano de fundo; logo circular original grande no topo esquerdo; categoria em tarja amarela angular; manchete enorme em branco/amarelo no centro-baixo; apoio factual discreto com divisor amarelo; Rio Madeira panorâmico permanente no rodapé; crédito factual pequeno. Paleta #041128, #020B15, #FFD400, #FAFAFE e vermelho só para alerta/comparação factual. Sem play, sem watermark, sem logotipo inventado, sem thumbnail genérica, sem texto cortado. A imagem do assunto deve ser licenciada e pertinente, marcando como ILUSTRATIVA quando necessário. Adaptar a posição dos elementos à proporção do destino mantendo margens seguras. Fonte, números, localização, categoria e urgência devem vir dos dados apurados, nunca da referência visual.

## Validação automática/editorial — bloquear em caso de falha
| Checagem | Condição obrigatória |
| --- | --- |
| Identidade | Logo original do repositório, sem texto redundante e sem marca de terceiros |
| Composição | Foto real ou arte editorial original pertinente; categoria amarela; manchete branca/amarela; faixa permanente do Rio Madeira |
| Texto | Manchete por inteiro, com ortografia, sem truncamento; subtítulo só com fatos apurados |
| Foto e local | Licença/autoria checadas; rótulo IMAGEM ILUSTRATIVA se não é a cena real; não atribuir Porto Velho indevidamente |
| Vídeo vertical | 1080x1920, elementos respeitam margens superior/inferior/lateral de plataformas |
| Feed | 1080x1080, **recomposição** própria do template |
| Falsos elementos | Nenhum play, botão de vídeo falso, logo inventado ou créditos poluentes |
| Publicação | Aprovação editorial/visual válida e bloqueio de duplicidade; confirmar postagem pelo ID/link do provedor |

## Integrações
- **YouTube Shorts** é o gerador principal de vídeo aprovado.
- **TikTok** usa o mesmo vídeo visualmente aprovado, com transcodificação para 30 fps SEM trocar a capa/layout.
- **Reels e Stories** usam a mesma identidade, mas são saídas distintas; Feed é quadrado.
- Alterar prompt no GitHub **não é suficiente** para alterar renderizadores externos hospedados no Supabase. Atualizar os renderizadores de cada plataforma separadamente, com testes e sem mudar filas que já funcionam.
