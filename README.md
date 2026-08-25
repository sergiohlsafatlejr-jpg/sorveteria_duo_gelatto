# 🍦 Sorveteria Duo Gelatto — Sistema de Gestão Integrado

Sistema completo de gestão comercial, financeira, fidelidade e automação para a sorveteria **Duo Gelatto**.

---

## 🚀 Tecnologias

### Frontend
- **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Radix UI)
- **Wouter** (Roteamento leve e declarativo)
- **TanStack Query v5** + **tRPC v11 Client** (Data-fetching totalmente tipado)
- **Recharts** (Visualização de dados e gráficos de desempenho)

### Backend
- **Node.js** + **Express** + **tRPC v11**
- **Drizzle ORM** (MySQL)
- **MSSQL** (`mssql` pool para conexão direta ao ERP INOVE PDV)
- **Node-Cron** (Agendamento de tarefas em segundo plano)
- **Z-API** (Integração de notificações via WhatsApp)
- **Meta / Instagram Graph API** (Análise e gestão de campanhas)

---

## 📁 Estrutura do Projeto

```
sorveteria_duo_gelatto/
├── client/                 # Aplicação Frontend React
│   ├── src/
│   │   ├── components/     # Layout, modais, UI (shadcn) e widgets
│   │   ├── contexts/       # Contextos React (Theme, etc.)
│   │   ├── hooks/          # Hooks customizados (usePermission, etc.)
│   │   ├── lib/            # Utilitários (tRPC client, dateUtils, exportExcel)
│   │   └── pages/          # Páginas da aplicação e submódulo financeiro (`/fin`)
│   └── index.html
├── server/                 # Aplicação Backend Node.js / Express / tRPC
│   ├── _core/              # Configurações do servidor, tRPC, contexto, env
│   ├── routers/            # Routers modulares por domínio (customers, points, fin, inove, etc.)
│   ├── db.ts               # Consultas de banco de dados principais
│   ├── db.fin.ts           # Consultas e relatórios do módulo financeiro
│   ├── cron.ts             # Tarefas agendadas automatizadas
│   ├── zapi.ts             # Módulo de envio de mensagens WhatsApp
│   └── routers.ts          # Root Router do tRPC
├── shared/                 # Schemas, constantes e tipos compartilhados
├── drizzle/                # Schemas de banco de dados e migrações SQL
└── docs/                   # Documentação do projeto (Checklist / TODOs)
```

---

## 🛠️ Como Executar o Projeto

### Pré-requisitos
- **Node.js**: `v20+`
- **pnpm**: `v10+`
- **MySQL**: `v8.0+` (Banco de dados primário)
- **MSSQL** (Opcional, para sincronização com ERP INOVE PDV)

### Passo a Passo

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/sergiohlsafatlejr-jpg/sorveteria_duo_gelatto.git
   cd sorveteria_duo_gelatto
   ```

2. **Instalar dependências:**
   ```bash
   pnpm install
   ```

3. **Configurar variáveis de ambiente:**
   Copie o arquivo `.env.example` para `.env` e preencha as credenciais:
   ```bash
   cp .env.example .env
   ```

4. **Executar migrações do banco de dados:**
   ```bash
   pnpm db:push
   ```

5. **Iniciar o servidor de desenvolvimento:**
   ```bash
   pnpm dev
   ```

   A aplicação estará acessível em `http://localhost:3000`.

---

## 🧪 Testes

Para rodar os testes unitários e de integração com Vitest:
```bash
pnpm test
```

---

## Recuperação da prévia Vite/esbuild

O erro `The service is no longer running` indica que o processo auxiliar do **esbuild** encerrou durante o desenvolvimento, geralmente após pressão de memória ou reinício incompleto. Esse erro pertence à prévia de desenvolvimento e não significa, por si só, que a versão publicada esteja indisponível.

Procedimento de recuperação:

1. Reiniciar completamente o servidor de desenvolvimento.
2. Confirmar que `http://127.0.0.1:3000/` responde com HTTP 200.
3. Executar `pnpm run check` para validar o TypeScript.
4. Abrir a prévia e confirmar que a sobreposição do Vite não reaparece.
5. Validar separadamente o domínio publicado antes de uma nova publicação.

Se o erro voltar com frequência, verificar processos Node/TypeScript duplicados e o consumo de memória antes de reinstalar dependências ou alterar a configuração do Vite.

---

## 🔒 Permissões e Segurança

O sistema possui controle de acesso baseado em cargos (**RBAC**) e permissões granulares por módulo:
- **Admin**: Acesso total ao sistema, configurações e gestão de usuários.
- **Gerente**: Gestão de estoque, financeiro, regras de fidelidade e relatórios.
- **Atendente / Vendedor**: Operação de vendas (PDV), cadastro de clientes e pontuação.
