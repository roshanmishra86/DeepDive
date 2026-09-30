## What’s new in v0.2.10

- Fixed an issue on the Today page where clicking the 3-dots action menu on a task caused the dropdown menu to be clipped and hidden behind the task list container.
- Resolved container overflow clipping (`overflow: visible`) and elevated active row stacking contexts (`z-index: 50`) so dropdown menus render clearly above neighboring and completed tasks.
- Added smart upward-opening menu placement (`openUpward`) when task rows are positioned near the bottom of the screen.
- Enhanced dropdown menu styling with nowrap item formatting and accessibility attributes (`aria-expanded`, `role="menu"`, and `role="menuitem"`).

## Notes

Existing planner data, tasks, templates, rituals, notes, timer state, archive,
and sound-library behavior remain fully compatible with this release.


