# assets/brand

Assets de marca do "football-manager" (placeholder — nome final é decisão de produto).

| Arquivo | Uso | Dimensão |
|---|---|---|
| `icon.png` | `expo.icon` (app icon iOS/Android) | 1024×1024 |
| `adaptive-foreground.png` | `android.adaptiveIcon.foregroundImage` | 1024×1024, área segura central |
| `splash.png` | `expo.splash.image` | 1242×2436, fundo transparente sobre `backgroundColor` |
| `favicon.png` | `web.favicon` | 48×48 |

Direção visual: fundo escuro profundo (alinhado ao token de fundo do Premium Imersivo,
`#0f0f1a`/`#1a1a2e`), monograma/escudo centralizado. A forma do escudo segue o contorno
"heater" do gerador determinístico (`src/engine/identity/crest-generator.ts`), para que
marca e escudos de clube compartilhem a mesma linguagem.

> Os PNGs finais entram via design (fora do escopo de código). Até lá, `app.json` referencia
> estes paths; se um asset faltar, o Expo cai no default — não quebra o boot.
