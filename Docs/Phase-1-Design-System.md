# Phase 1 — Design System & UX (Executing)

Status: IN PROGRESS. Depends on: Phase 0 stories (unapproved draft OK to start).
Locks carried in: bright flat palette, no gradients, 2px ink borders, hard shadows.
Preview: `Docs/design-system-preview.html`

## 1.1 Tokens (frozen — mirrors preview)

```css
--bg:#FFFFFF; --surface:#FFFFFF; --ink:#0A0A0F; --muted:#3F3F46;
--line:#0A0A0F; --primary:#6D28D9; --pink:#EC4899; --cyan:#06B6D4;
--lime:#A3E635; --sun:#FFC800; --red:#FF3B30; --radius:10px;
--shadow:4px 4px 0 #0A0A0F; --font:Inter,system-ui,...;
```

Rules: flat solids only; red = overdue only; sun yellow = attention/Remy bubbles; black text on lime/cyan/yellow, white on violet/pink/red. Type scale 12/14/16/20/32. 4pt grid, 2px borders, AA contrast.

Code: `packages/ui/tokens.css` (this phase's build artifact).

## 1.2 IA (frozen)

Left nav: Today, Chat, Tasks, Calendar, Inbox, Docs, Follow-ups + workspace switcher. Top: workspace switcher (My Work / executive / client / team) + permission badge. Right rail: detail + Remy suggestion + Approve/Deny.

## 1.3 Screens to design (Figma scope — build in this order)

1. Today Dashboard (priority/overdue, meetings, emails, follow-ups, docs, progress)
2. Chat (stream + chips + inline ApprovalCard)
3. Tasks list, Calendar week (conflict state), Email triage, Doc viewer + summary
4. Permissions center + Memory editor

Each screen needs: default, loading/skeleton, empty, error, and mobile (PWA) variant.

## 1.4 Component build list (→ `packages/ui`, Tailwind + shadcn base)

Button (primary/pink/cyan/lime/quiet/danger), Badge (vip/attn/over/ok/info), Input, Chip, Card, ApprovalCard (payload + Approve/Edit/Deny), TaskRow, EmptyState, Skeleton, Toast, Topbar, ChatBubble.

Props contract: every interactive component takes `workspaceId` context where relevant; every AI side-effect component requires `approval` prop (no silent execute).

## 1.5 Accessibility checklist

Keyboard nav + visible focus, ARIA live region for chat stream, AA contrast (verify lime/cyan on white with black text only), reduced-motion respect, 44px touch targets on mobile.

## Exit (→ Phase 2)

- [ ] Tokens file merged (`packages/ui/tokens.css`)
- [ ] Figma covers Today + Chat + ApprovalCard (min), rest queued
- [ ] Component props signed off
- [ ] You reply "Phase 1 approved"
