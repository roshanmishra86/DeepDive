## 2024-05-19 - React Hook Rule Caveats with Early Returns
**Learning:** `useMemo` hooks cannot be placed after early returns like `if (loading) return <Loading />`. They must be at the top level of the component before any conditional returns, to maintain the strict order of Hooks on every render.
**Action:** When adding `useMemo` for performance optimizations, ensure it is placed above any conditional rendering blocks (loading states, error states) to prevent `react-hooks/rules-of-hooks` errors during linting.
