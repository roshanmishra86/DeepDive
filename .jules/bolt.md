## 2024-05-14 - Zustand Global Store Re-Renders
**Learning:** Selecting the entire collection (e.g. `const blocks = useStore(s => s.blocks)`) inside list items (like `TimelineBlock`) causes O(N) re-renders for every single item on any collection update.
**Action:** Pass derived boolean state like `isFirst`/`isLast` down as props from the parent instead of deriving them by selecting the whole list inside the child component. Pair with `React.memo` to avoid re-renders on every clock tick for non-active blocks.
