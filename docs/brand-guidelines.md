# Brand Guidelines — football-manager (placeholder)

> Nome do produto é **placeholder** ("football-manager"). A marca final é decisão de
> produto e não está fixada aqui (ver spec §D8 / §9 out-of-scope).

## Logo
- Sempre sobre fundo escuro profundo (`#0f0f1a`–`#1a1a2e`). Não usar sobre fundos claros sem variante invertida.
- Área de proteção mínima ao redor do logo = altura do "escudo" do próprio logo.
- Tamanho mínimo: 24dp de altura (favicon 48×48px).

## Cor
- **Chrome estrutural** (fundo, surfaces, bordas): neutros profundos da rampa de tokens (D1) — estáticos entre clubes.
- **Accent do clube**: camada de identidade+ação (CTAs, abas, progresso, foco). Derivado por `deriveAccentRamp` (D4). A marca do app usa neutro + 1 accent de produto; escudos de clube usam o accent do clube.
- Escudos fictícios: paleta determinística própria (ver `src/engine/identity/crest-generator.ts`), independente do chrome.

## Tipografia
- **UI:** Manrope (D2).
- **Números/stats:** Saira Condensed, tabular (D2).
- Wordmark da marca usa Manrope SemiBold; não usar fontes de sistema no wordmark.

## Escudos de clube (identidade fase 1)
- Gerados por `generateCrest(rng)` — determinístico por seed do save.
- Linguagem visual: contorno "heater" + divisões heráldicas (per-pale / chief) + charge (estrela).
- Mesma seed ⇒ mesmo escudo (reprodutível em qualquer dispositivo).
