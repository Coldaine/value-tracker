# CodingPlans

**Which AI coding subscription actually gives you the most for your money?**

Claude, ChatGPT/Codex, Cursor, GitHub Copilot, Devin/Windsurf, Kiro, Zed and Google Antigravity all sell flat-rate plans,
and most of them don't tell you what a dollar of subscription buys. CodingPlans converts every plan into numbers you can
compare:

- **API-equivalent value**: what the included usage would cost at list API prices, and the resulting **Value ×** (API value ÷ monthly price).
- **Output tokens per month**: that dollar value converted into tokens using a fixed agentic-coding workload (heavy on cache reads).
- **Intelligence**: the [Artificial Analysis](https://artificialanalysis.ai) Intelligence Index of the best model you can reach on the plan.
- **Composite score (0 to 100)**: a weighted blend of the three, with weights you can change.

Where a vendor publishes the dollar value of a plan, the number is marked **published**. Where it doesn't, the number is a
clearly labelled **estimate**. The [methodology page](src/app/methodology/page.tsx) spells out exactly which is which.

## Pages

| Route | What it shows |
| --- | --- |
| `/` | Leaderboard, composite-score and value-multiple charts, price vs API-value scatter, vendor cards |
| `/vendors/[slug]` | One product's plan ladder, limits, strengths and caveats, value over time |
| `/models` | Intelligence vs cost per task, plus a sortable model table |
| `/value-over-time` | Dated before/after changes, the snapshot ledger, API price by model generation, plan-change timeline |
| `/methodology` | How every number is produced and how reliable it is |

## Getting started

Requires Node.js 20 or newer.

```bash
git clone https://github.com/OwenKruse/value-tracker.git
cd value-tracker
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # eslint
npm run snapshot   # append today's prices and value ranges to src/data/snapshots.json
```

With Bun installed, `bun test` runs the settings and scoring boundary tests without extra dependencies.
The default-metrics fixture records the results before settings validation; zero API value intentionally
produces zero output capacity and an infinite cost per output, which the existing formatter displays as `n/a`.

Built with [Next.js](https://nextjs.org) 16, React 19, Tailwind CSS 4 and TypeScript. There is no backend or database: all
data is static JSON in `src/data/`.

## Data

| File | Contents |
| --- | --- |
| `plans.json` | Price, API-value range (low / mid / high), `basis` (`published` or `estimated`), confidence, best model |
| `models.json` | API prices per 1M tokens and Artificial Analysis intelligence index |
| `vendors.json` | Descriptions, strengths, caveats, source links |
| `history.json` | Dated events, before/after reference points, API prices by model generation |
| `aa-leaderboard.json` | Artificial Analysis leaderboard rows |
| `snapshots.json` | Ledger written by `npm run snapshot` |

The scoring logic lives in [`src/lib/metrics.ts`](src/lib/metrics.ts) and the types in [`src/lib/types.ts`](src/lib/types.ts).

## Contributing

**Pull requests are very welcome.** Plans and prices change constantly, so this project is only useful if it keeps up, and
one person can't watch every vendor. You don't need to be a Next.js expert to help: much of the most valuable work is
editing JSON.

Good ways to contribute:

- **Fix or update a price or limit.** A vendor changed a plan? Update `plans.json` and link the page that shows it in `sourceUrl`.
- **Improve an estimate.** If you have measured usage (for example from `ccusage` or the Codex usage dashboard), a PR that
  tightens an `estimated` range, with your method explained, is exactly what this project needs.
- **Add a plan, vendor or model.** Add it to `plans.json` / `vendors.json` / `models.json`. Use an existing entry as a template.
- **Refresh Artificial Analysis data** in `models.json` and `aa-leaderboard.json`.
- **Report an error.** Spotted a wrong number or a broken source link? [Open an issue](https://github.com/OwenKruse/value-tracker/issues) with a link to evidence.
- **Improve the app.** Accessibility fixes, charts, mobile layout, performance and new views are all fair game.

### Ground rules for data changes

- **Cite a source.** Every price, limit or claim should be traceable to a public page. Put the URL in the entry.
- **Be honest about certainty.** Use `basis: "published"` only when the vendor states the value in dollars or in credits
  with a dollar price. Otherwise use `"estimated"` and set `confidence` accordingly.
- **Run `npm run snapshot`** after changing prices or values so the history chart gets a new data point.

### Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your change. Keep PRs focused: one concern per PR is easiest to review.
3. Run `npm run lint` and `npm run build` and make sure both pass.
4. If you changed anything visible, include a screenshot in the PR description.
5. Open the PR and explain what changed and why. For data changes, link your sources.

Not sure whether an idea fits? Open an issue first and ask. Small, rough PRs are welcome too; we can polish them together.

## Notes on third-party content

- Intelligence Index scores and cost-per-task figures come from [Artificial Analysis](https://artificialanalysis.ai).
- Product logos in `public/logos/` are trademarks of their owners and are used only to identify the products being compared.
  Sources and licences are listed in [`public/logos/README.md`](public/logos/README.md).
- CodingPlans is an independent project and is not affiliated with any of the vendors it compares.

## License

[MIT](LICENSE)
