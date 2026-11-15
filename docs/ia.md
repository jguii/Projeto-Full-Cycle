# Uso de IA

Ferramenta: **Claude Code** (Anthropic), usado como par de programação durante todo o projeto.

## Prompts que importaram

1. *"Nós precisamos criar um projeto que envolve praticamente todas as ações de um DevOps, iremos escolher a opção B desse link: (slides do projeto final)"*
   → A IA leu os slides, listou os entregáveis do Projeto B por módulo (M1–M4) e perguntou domínio, stack e formato. Escolhi: **Pedidos**, **Node + TypeScript**, **individual**.
2. Revisão da escolha de persistência: Prisma × Repository com `pg` puro.
   → A decisão e a alternativa descartada estão em [`adr/0001-repository-com-sql-puro.md`](adr/0001-repository-com-sql-puro.md).
3. Diagnóstico do teste de integração falhando com *"autenticação do tipo senha falhou"*.
   → A mensagem estava em português, logo vinha do Postgres **instalado no Windows** na porta 5432, não do contêiner. Movemos o banco do Compose para a porta **5433**.

## O que a IA sugeriu e eu decidi

| Sugestão | Decisão |
|---|---|
| Valores em centavos (inteiro) | Aceito — evita erro de ponto flutuante no total |
| Máquina de estados dentro da entidade `Order` | Aceito — uma única fonte de verdade para transições |
| Erros em `application/problem+json` (RFC 9457) | Aceito |
| Prisma como ORM | **Recusado** — ver ADR 0001 |
| Rodar k6 via Docker em vez de instalar localmente | Aceito — o mesmo comando roda na CI |
| SLO de 300 ms no p95 | Aceito depois de medir: o p95 real ficou abaixo de 8 ms, então 300 ms dá folga para a nuvem |

## Verificação

Todo código gerado foi executado e conferido localmente antes do commit:
lint, typecheck, 40 testes unitários (coverage ≈ 99 %), 4 testes de integração contra Postgres real,
`docker compose up` e o smoke k6 com os números em [`desempenho.md`](desempenho.md).
Consigo explicar cada arquivo; os pontos que defendo na apresentação estão no README.
