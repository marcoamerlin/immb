# Reuniões IMMB

App web para organizar as reuniões da Igreja Messiânica Mundial do Brasil (cultos mensais, reuniões de ministros, de núcleo, estudos dos Ensinamentos etc.).

## Funcionalidades

- **Reuniões**: agenda das próximas reuniões e histórico das que já aconteceram, com busca e filtro por tipo.
- **Pauta**: itens com duração estimada, reordenação, marcação do que já foi feito e pautas modelo por tipo de reunião.
- **Presença**: lista de chamada dos membros cadastrados e registro de visitantes.
- **Ata**: anotações da reunião (testemunhos, avisos, decisões), com impressão/PDF da ata formatada.
- **Encaminhamentos**: tarefas com responsável e prazo.
- **Membros**: cadastro com função e telefone, e contagem de presenças.
- **Dados**: backup/restauração em JSON e tipos de reunião personalizáveis.

Os dados ficam salvos no próprio aparelho (localStorage). O app funciona offline e pode ser instalado na tela inicial do celular (PWA).

## Como rodar

Não precisa de build nem dependências. Sirva a pasta com qualquer servidor estático:

```sh
cd reunioes
python3 -m http.server 8000
# abra http://localhost:8000
```

Para publicar, basta hospedar a pasta `reunioes/` (por exemplo, no GitHub Pages).
