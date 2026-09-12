# Asesor Financiero Generativo — Banorte × Tec de Monterrey

UI que el agente construye en tiempo real: LLM al centro, MCP para datos y
acciones, A2UI para la interfaz.

## Arranque

```bash
cp .env.example .env      # pon tu GEMINI_API_KEY
docker compose up --build
```

- Frontend: http://localhost:3000
- Galeria de widgets: http://localhost:3000/dev/gallery
- MCP (HTTP/SSE): http://localhost:8787

## Estructura

```
packages/catalog   catalogo de componentes (fuente de verdad del protocolo)
packages/a2ui      tipos + validador de A2UI v0.9.1 y extensiones
apps/web           Next.js: canvas modular, renderer, widgets, chat
apps/mcp           servidor MCP: datos bancarios sinteticos y acciones
```

Lee `docs/` antes de tocar codigo.

```
docker compose up -d          # levantar en segundo plano
docker compose logs -f web    # ver logs del frontend
docker compose down           # apagar
docker compose down -v        # apagar y borrar el volumen de Postgres
```