---
name: Sensorium
colors:
  surface: '#fff8f6'
  surface-dim: '#e5d7d2'
  surface-bright: '#fff8f6'
  surface-lowest: '#ffffff'
  surface-low: '#fff1ec'
  surface-container: '#faebe6'
  surface-high: '#f4e5e0'
  surface-highest: '#eedfda'
  on-surface: '#211a17'
  on-surface-variant: '#56423c'
  inverse-surface: '#372f2b'
  inverse-on-surface: '#fdeee8'
  outline: '#8a726b'
  outline-variant: '#ddc0b8'
  primary: '#9d3d1c'
  on-primary: '#ffffff'
  primary-container: '#bd5532'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb59e'
  secondary: '#615e58'
  on-secondary: '#ffffff'
  secondary-container: '#e7e2da'
  on-secondary-container: '#67645e'
  tertiary: '#695851'
  on-tertiary: '#ffffff'
  tertiary-container: '#837069'
  on-tertiary-container: '#fffaff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd0'
  primary-fixed-dim: '#ffb59e'
  on-primary-fixed: '#3a0b00'
  on-primary-fixed-variant: '#802908'
  secondary-fixed: '#e7e2da'
  secondary-fixed-dim: '#cbc6be'
  on-secondary-fixed: '#1d1b17'
  on-secondary-fixed-variant: '#494641'
  tertiary-fixed: '#f6ddd5'
  tertiary-fixed-dim: '#d9c2b9'
  on-tertiary-fixed: '#251913'
  on-tertiary-fixed-variant: '#53433d'
  background: '#fff8f6'
  on-background: '#211a17'
  surface-variant: '#eedfda'
colors-dark:
  background: '#1a1a1a'
  on-background: '#fcf9f2'
  surface: '#1a1a1a'
  surface-dim: '#1a1a1a'
  surface-bright: '#2a2a2a'
  surface-lowest: '#111111'
  surface-low: '#1f1f1f'
  surface-container: '#222222'
  surface-high: '#2a2a2a'
  surface-highest: '#333333'
  on-surface: '#fcf9f2'
  on-surface-variant: '#8a847e'
  inverse-surface: '#fcf9f2'
  inverse-on-surface: '#1a1a1a'
  inverse-primary: '#9d3d1c'
  outline: '#6f6a64'
  outline-variant: '#2a2a2a'
  primary: '#ff8a5c'
  on-primary: '#3a0b00'
  primary-container: '#8f2f0d'
  on-primary-container: '#ffdbcf'
  primary-fixed: '#ffdbcf'
  primary-fixed-dim: '#ffb59e'
  on-primary-fixed: '#3a0b00'
  on-primary-fixed-variant: '#8f2f0d'
  secondary: '#cbc6be'
  on-secondary: '#33312c'
  secondary-container: '#4a4842'
  on-secondary-container: '#e7e2da'
  secondary-fixed: '#e7e2da'
  secondary-fixed-dim: '#cbc6be'
  on-secondary-fixed: '#1d1b17'
  on-secondary-fixed-variant: '#494641'
  tertiary: '#d9c2b9'
  on-tertiary: '#3b2d27'
  tertiary-container: '#53433d'
  on-tertiary-container: '#f6ddd5'
  tertiary-fixed: '#f6ddd5'
  tertiary-fixed-dim: '#d9c2b9'
  on-tertiary-fixed: '#251913'
  on-tertiary-fixed-variant: '#53433d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    className: font-display
  sans:
    fontFamily: Plus Jakarta Sans
    className: font-sans
  brand:
    fontFamily: Special Elite
    className: font-brand
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  2xl: 2rem
  pill: 9999px
spacing:
  unit: 8px
  container-margin: 24px
  gutter: 16px
  section-gap: 40px
---

## Brand & Style

This design system is built for a brand centered on intimacy, slow-living, and meaningful human connection. The visual narrative balances **Tactile Modernism** with **Minimalism**, creating an environment that feels like a digital sanctuary. 

The emotional response is one of calm, safety, and groundedness. This is achieved through a "warm-light" interface that avoids the sterile coldness of typical tech platforms. The aesthetic prioritizes human faces, natural elements, and soft transitions to encourage vulnerability and reflection.

Key pillars:
- **Serenity:** Generous whitespace and a muted, earthy palette.
- **Humanity:** High-contrast, editorial typography that feels "written" rather than "programmed."
- **Depth:** Subtle layers and soft-edged containers that mimic physical paper or smooth stones.

## Colors

The palette is inspired by the "Golden Hour" (the transition between day and night). 

- **Primary (Terracotta):** A warm, clay-inspired earth tone used for primary actions, progress indicators, and key brand moments. It evokes the warmth of a campfire.
- **Secondary (Cream/Parchment):** The foundational surface color. It is softer on the eyes than pure white, providing a tactile, organic feel.
- **Tertiary (Deep Cocoa):** A muted warm brown used for tertiary containers and supporting text, keeping the warm tonal profile.
- **Neutral (Warm Slate):** Used for secondary text (`on-surface-variant`), borders, and inactive states (`outline`/`outline-variant`).
- **Status (semantic):** Mood and availability use Tailwind status colors rather than custom tokens — `emerald` for available, `amber` for busy, `red` for do-not-disturb. Error states use the Material `error` roles (`#ba1a1a` light, `#ffb4ab` dark).

## Dark Mode

Dark mode is **"Ink & Parchment"**, a warm inversion inspired by the Brutal Luxury treatment of emmanuelmathew.dev. The warm cream surfaces of the light theme become a neutral warm charcoal (`#1a1a1a`), text becomes warm cream (`#fcf9f2`), and the terracotta primary brightens to a vivid tone (`#ff8a5c`) that holds contrast on dark. Surfaces stay **neutral** (not brown-tinted) so the dark theme reads clean, editorial, and calm, never cold, never muddy.

Behavior:

- **Three modes:** `light` (default), `system`, and `dark`. `system` follows the OS `prefers-color-scheme` and reacts to live changes.
- **Mechanism:** a `dark` class on `<html>` swaps the design tokens; components never branch on theme. A `sensorium:theme` value in `localStorage` persists the choice. A tiny inline script in `index.html` applies the saved/system theme before first paint to prevent flash of the wrong theme.
- **Tokens:** the dark values live in the `colors-dark` front-matter above and mirror the light set 1:1 (every light token has a dark counterpart, including `fixed`/`inverse` roles). No new hue families are introduced.
- **Accent:** `--color-primary: #ff8a5c` is the single vivid moment on dark, used for actions, active states, and brand highlights. It is the brightened sibling of the light theme's `#9d3d1c` terracotta and matches how the reference site uses `#d95d39`.
- **Elevation:** shadows go deeper and more neutral in dark mode; prefer the same token classes over `dark:shadow-*` variants.
- **Identity preserved:** typography (Plus Jakarta Sans / Special Elite), radii, and the soft, tactile tone of the light theme are unchanged in dark mode; only the color treatment inverts.
- **Toggle placement:** a theme toggle is available on the app shell header (top nav desktop, slim bar mobile) and on public pages (landing, auth) via a compact icon menu (Light / System / Dark).

## Typography

The typographic system pairs a humanist sans-serif with a single typewriter accent used sparingly for brand moments.

- **Headlines:** all headings (`h1`–`h6`) render in Plus Jakarta Sans via the `font-display` token, weighted Semibold (`600`) in the app shell. Headlines stay tight and contemporary rather than decorative.
- **Body & Labels:** Plus Jakarta Sans (`font-sans`) with open counters and friendly, rounded terminals. It keeps the UI feeling modern and accessible.
- **Brand:** the "Sensorium" wordmark — on the landing page, auth layouts, and the app shell header — uses **Special Elite** (`font-brand`), a typewriter-style face with monospace fallback, with wide letter-spacing (`0.15em`–`0.2em`). It is reserved for the wordmark only; it is never used for body copy or interface text.
- **Styling:** generous line heights (1.5x body) keep the UI from feeling cluttered. The two fonts are loaded from `@fontsource` (Plus Jakarta Sans 400–700, Special Elite 400) in `src/main.tsx`.

## Layout & Spacing

The layout philosophy follows a **Fluid Content Model** with strict safe-area margins. 

- **Grid:** On mobile, use a 4-column layout. On desktop, a 12-column centered layout with a max-width of 1200px.
- **Rhythm:** An 8px base unit drives all spacing. For vertical rhythm between components, favor "breathable" gaps (e.g., 24px or 32px) over dense packing.
- **Safe Areas:** Screens should feature a 24px horizontal margin to ensure content doesn't feel cramped against device edges.
- **Image Integration:** Photography often breaks the container or uses organic, curved masks (e.g., the campfire arc) to blend the UI with the natural world.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Soft Shadows** rather than stark borders.

- **Surfaces:** The base layer is the primary cream surface color. Cards and floating elements use `surface-container`/`surface-low` tones to appear "raised."
- **Shadows:** Two tokens — `soft` (`0 4px 20px`, tinted terracotta) for resting elevation and `lift` (`0 8px 32px`, deeper brown) for floating/popover elements. In light mode shadows are tinted with the primary terracotta or deep brown rather than pure black to maintain color harmony.
- **Depth Masks:** Use soft gradients or "mist" effects at the edges of photos to create a seamless transition between imagery and the interface.

## Shapes

The shape language is characterized by **Generous Radii**, mimicking organic forms like river stones.

- **Standard Elements:** Buttons and small cards use a 16px (1rem) radius.
- **Large Containers:** Section containers and top-level cards use 24px (1.5rem) or 32px (2rem) radii to emphasize softness and safety.
- **Interactive Elements:** Action-oriented items (chips, small buttons) may use pill-shaped (full-round) styling to distinguish them from structural layout components.

## Components

### Buttons
- **Primary:** Solid terracotta background with white text. High roundedness (pill-shaped). 
- **Secondary/Ghost:** Outlined with 1px terracotta or neutral borders. Use the `font-brand` (Special Elite) treatment sparingly for wordmark moments; interface buttons stay in Plus Jakarta Sans.

### Cards
- Surfaces should be white or a very light cream.
- Padding should be generous (20px or 24px) to ensure internal elements breathe.
- Content within cards is organized by soft dividers (1px, low-opacity neutral).

### Input Fields
- Subtle, light-colored backgrounds with no heavy borders.
- Labels are small, uppercase or bolded `label-md` for clarity.

### Chips & Tags
- Used for status (e.g., "8/8 members") or categories. 
- Use semi-transparent versions of the primary color or soft neutral backgrounds.

### Navigation
- Bottom navigation uses a clean, line-icon style.
- The active state is indicated by a primary color shift and a subtle label change.

### Icons
- Use thin to medium stroke weights with rounded caps.
- Icons should feel illustrative and light, never heavy or blocky.