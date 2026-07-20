Turn Signal Mission Control redesign

Changed file:
  src/components/AnalyticsPage.tsx

How to apply:
1. In GitHub, open turnsignal/src/components/AnalyticsPage.tsx.
2. Replace that file with the included AnalyticsPage.tsx.
3. Commit the change to your deployment branch.
4. Vercel should build and deploy automatically.

What changed:
- Renamed the screen presentation to Mission Control.
- Added a blue KPI hierarchy across the top.
- Kept the existing slidable Turn Rate gauge and what-if savings calculation.
- Limited the Action Center to the existing top three highest-impact issues.
- Moved How to Save More into a prominent Biggest Opportunity panel.
- Reorganized Stage Health, trends, and detailed reporting below the decision-focused sections.
- Kept the existing analytics data and calculation logic.

No database migration is included or required for this UI-only update.
