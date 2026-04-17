# Algorand Supply Inertia Analyzer

Um sistema robusto para análise comportamental de oferta (supply) da Algorand em tempo real.

## O que este sistema faz?
- **Censo de Carteiras:** Identifica todas as contas com saldo superior a um limite (Threshold).
- **Análise de Inércia:** Classifica as contas por tempo de última atividade (Hot, Active, Frozen, Inert, etc).
- **Sincronização em Tempo Real:** Monitora os blocos da rede para capturar mudanças de saldo e novas carteiras instantaneamente.
- **Background Sync:** Faz uma faxina completa a cada 12 horas para garantir que todas as carteiras vizinhas sejam detectadas.

## Requisitos de Deploy

**IMPORTANTE: O analisador utiliza SQLite local e um processo de background contínuo.**

- **Vercel:** Não é recomendado para o sistema completo (Analisador + DB), pois a Vercel é "Stateless" (ela apaga o banco de dados toda vez que o servidor reinicia) e não permite loops de 30 segundos em background.
- **DigitalOcean / AWS / Home Server:** Recomendado. Qualquer VPS onde o Node.js possa rodar continuamente.
- **Railway.app / Fly.io:** Excelentes alternativas, desde que configuradas com um "Persistent Volume" para o banco `.db`.

## Como Rodar Localmente

1. Instale as dependências:
   ```bash
   npm install
   cd dashboard && npm install && cd ..
   ```

2. Builde o Dashboard:
   ```bash
   npm run build-all
   ```

3. Inicie o analisador e o painel:
   ```bash
   npm start
   ```

Acesse em: `http://localhost:3000`

---
Desenvolvido por Antigravity.
