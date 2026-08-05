# Sensorium Documentation

This index maps the Sensorium documentation and gives a recommended reading order. The docs are the single source of truth for the project: product, design, and technical decisions all live here and are kept current alongside the code.

## Documentation map

| Document | What it is | Read it when |
|---|---|---|
| [`README.md`](../README.md) | Front door: what Sensorium is, quick start, scripts, testing, environments | First. Start here for the project at a glance. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | High-level mental model of how the system fits together | Second. New contributors should read this before the code. |
| [`PRD.md`](PRD.md) | Product requirements, screens, and user flows | When you want to understand or change product behavior. |
| [`DESIGN.md`](DESIGN.md) | Visual design system and design tokens | When you build UI. No new colors, typefaces, or radii outside these tokens. |
| [`TECHNICAL.md`](TECHNICAL.md) | Deep technical reference: stack, schema, migrations, storage, realtime, deployment | When you start working in the code or need implementation detail. |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | How to contribute: Git workflow, conventions, testing, pull requests | Before opening an issue or a pull request. |

## Recommended reading order

1. [`README.md`](../README.md) - what the project is and how to run it.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) - a 10-15 minute mental map of the system.
3. [`PRD.md`](PRD.md) - what the product does and why.
4. [`DESIGN.md`](DESIGN.md) - how the product looks and the design tokens.
5. [`TECHNICAL.md`](TECHNICAL.md) - how the product is built.
6. [`CONTRIBUTING.md`](../CONTRIBUTING.md) - how to contribute.

## How the documents relate

```
README.md          front door, links to everything
  └── ARCHITECTURE.md    the mental model (read next)
  └── PRD.md             what and why
  └── DESIGN.md          visual system and tokens
  └── TECHNICAL.md       deep technical reference
  └── CONTRIBUTING.md    contributor workflow and rules
```

Each document states its own audience and points to the next one to read. If you find information duplicated across documents, it should be consolidated; the technical facts (stack, schema, deployment, secrets) live canonically in `TECHNICAL.md`, and `README.md` links to it rather than repeating it.
