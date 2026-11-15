---
status: aceito
data: 2026-11-15
decisores: João Guilherme Pimentel
---

# ADR 0001 — Persistência com Repository pattern sobre `pg` (SQL explícito), sem ORM

## Contexto e problema

A API de Pedidos precisa gravar um pedido e seus itens de forma **atômica** e ler pedido + itens
numa única consulta. O domínio (`Order`) concentra as regras de negócio (máquina de estados,
total em centavos, invariantes) e não deve depender de detalhes do banco, para ser testável
sem Postgres e para cumprir DIP/SRP (critério M1).

Pergunta: **como acessar o PostgreSQL?**

## Fatores de decisão

- Domínio testável sem banco (testes unitários rápidos, coverage mínimo na CI).
- Transação explícita em pedido + itens.
- Projeto B tem 8 dias e um único agregado: pouca superfície, pouca necessidade de abstração extra.
- Imagem Docker simples (sem passo de geração de cliente).
- Saber exatamente que SQL roda (para explicar o p95 medido e os índices).

## Opções consideradas

1. **Repository pattern + driver `pg` com SQL escrito à mão** ← escolhida
2. Prisma ORM
3. Active Record (entidade sabe se salvar, ex.: TypeORM com `BaseEntity`)

## Decisão

Opção 1. A interface `OrderRepository` (`src/domain/order-repository.ts`) é a porta;
`PostgresOrderRepository` e `InMemoryOrderRepository` são os adaptadores. O `OrderService`
recebe o repositório por construtor e o `server.ts` (composition root) liga a implementação real.
O schema é versionado em `migrations/*.sql`, aplicado por um runner mínimo que registra o que já rodou.

## Consequências

**Boas**
- Testes unitários do serviço e da camada HTTP rodam com o repositório em memória (≈1 s, sem Docker).
- A transação pedido+itens está explícita em `inTransaction`; o teste de integração prova o rollback.
- Uma única query (`LEFT JOIN` + `json_agg`) devolve pedido com itens — sem N+1.
- Sem etapa de `generate` no build; a imagem final tem só `dist/`, `node_modules` de produção e as migrações.

**Ruins (aceitas)**
- Mapeamento linha → entidade é manual (`toDomain`); um campo novo exige mudar SQL e mapeamento.
- Sem verificação de tipos entre SQL e TypeScript: mitigado pelo teste de integração contra Postgres real.
- Runner de migração próprio não tem *down*; aceitável no escopo (rollback = nova migração).

## Alternativa descartada: Prisma

Prisma daria tipos gerados e migrações prontas, e seria a escolha natural com vários agregados.
Foi descartado porque: (a) o modelo gerado tende a vazar para o domínio, ou exige o mesmo
mapeamento manual para não vazar; (b) adiciona `prisma generate` ao build e ao Dockerfile, mais um
ponto de falha na CI dentro de um prazo curto; (c) com um único agregado, o ganho de produtividade
não compensa. **Reavaliar** se surgirem 3+ agregados ou consultas dinâmicas complexas.

## Alternativa descartada: Active Record

Mistura regra de negócio e persistência na mesma classe, o que impede testar a máquina de estados
sem banco e viola SRP — exatamente o que este ADR quer evitar.
