# DerivAnalyzer

Deriv Up/Down trading dashboard with paper trading, EMA/RSI signals, risk controls, and optional server-side Deriv OAuth/WebSocket integration.

## Render deployment

1. Create a Render Web Service from this repository.
2. Use the included `render.yaml`, or configure:
   - Build: `npm install && npm run build`
   - Start: `npm run server`
   - Health check: `/health`
3. Add the environment variables from `.env.example`.
4. Set `DERIV_REDIRECT_URI` to the exact public HTTPS URL:
   `https://YOUR-DOMAIN/api/auth/callback`
5. Register the same redirect URI in your Deriv OAuth application.
6. Deploy and verify `/health` returns `{"ok":true,...}`.
7. Open the dashboard and test paper trading.
8. Use CONNECT DERIV, load accounts, and connect a demo account.

## Live trading safety

`LIVE_TRADING_ENABLED=false` is the initial deployment setting.

Do not enable live execution until OAuth, account connection, proposal/buy flow, contract monitoring, error recovery, session/token handling, and risk controls have been tested with a demo account.

Strategy signals are heuristics and are not guarantees of profit.

## Local development

```bash
npm install
npm run dev
```

Production server:

```bash
npm run build
npm run server
```

Never commit access tokens, refresh tokens, or other secrets.

## Architecture

- React/Vite frontend
- Express API server
- Deriv OAuth 2.0 + PKCE authentication
- Server-side authenticated Deriv WebSocket
- Paper trading by default
- Trading engine with daily-loss, profit-target, maximum-trade, consecutive-loss, and duplicate-order protections
