# Giro Madeira — Agenda oficial dos cinco canais
Decisão do usuário: **18/10/2026**. Todos os horários são **America/Porto_Velho (UTC−4)**; esta decisão substitui janelas anteriores de Instagram Stories à noite, bem como 08h/22h de Shorts/TikTok.

| Canal | Meta | Janela automática | Observação |
| --- | --- | --- | --- |
| Instagram Feed | até **1 por dia** | 12h00–12h44 | Primeira saída Instagram; 1080×1080 |
| Instagram Reels | até **1 por dia** | 13h30–14h44 | Depois do Feed: 1080×1920 MP4, música licenciada |
| Instagram Stories | até **1 por dia** | 15h30–16h59 | Depois do Reel: 1080×1920 foto vertical própria |
| YouTube Shorts | até **1 por dia** | **17h00–17h44** | Slot 17h, radar Brasil/Mundo, vídeo MP4 vertical independente |
| TikTok | até **1 por dia** | **17h00–17h44** | Slot 17h, radar Brasil/Mundo, Buffer 30fps e confirmação pública independente |

**Por que nem todos do Instagram exatamente às 12h?** O usuário pediu *Instagram às 12h*, mas o semáforo Meta amarelo atual obriga intervalo de **75 a 105 minutos entre quaisquer publicações** (regra operacional, além de no máximo um de cada formato por dia). Fazer os três uploads às 12h criaria nova exposição ao 403/2207051 e contraria a proteção. Por isso **o bloco Instagram começa às 12h**, com o Feed primeiro e Reels/Stories em sequência escalonada. Os trabalhos de radar e render são independentes e podem ocorrer mais cedo.

Todos os canais exigem notícias verificadas, data real da fonte, revisão de mídia/direitos e não duplicação. **Story permanece bloqueado automaticamente enquanto os dados da quota Meta estiverem desatualizados, Feed/Reels não tiverem IDs públicos recentes, ou não houver Story aprovado.** Publicação apenas quando confirmado por identificador real do provedor.

Crons: Feed #28 UTC16h (0,15,30,45); Reel #34 UTC17h (30,45) + redundância UTC18h; Story #31 UTC19h (30,45) + redundância UTC20h. Shorts uploader #11 UTC21h (0,15,30), TikTok Buffer 15min com posting_slots_local=[17h]. Monitor Shorts/TikTok 17h50 PV. Nenhum reenvio retrospectivo fora do slot.

Observação: **meta e agendamento não significam publicação efetiva**. Sem arte aprovada, quota Meta válida e ID do provedor, o sistema permanece bloqueado; não contornar a proteção para preencher cota.
