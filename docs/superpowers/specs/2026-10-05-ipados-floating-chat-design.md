# iPadOS floating chat correction

User approved this correction after supplying the Apple Music iPad screenshot.
It supersedes `2026-10-05-attached-chat-workspace-design.md`.

- Inset the rounded glass library 12px from the desktop/tablet edges.
- Keep a plain editorial chat heading, with independent glass action controls.
- Float the existing roomy two-row composer 16px above the bottom, centered in
  the conversation pane; retain native textarea editing and existing functions.
- Let the continuous conversation canvas scroll beneath chrome. Reserve actual
  composer height in trailing content padding so final messages stay reachable.
- Use a soft top scroll-edge fade for the heading and an 88% composer veil for
  readable text. Keep real engine-owned blur/rims and reduced-transparency,
  increased-contrast, reduced-motion behavior.
- Retain mobile drawer and visualViewport keyboard adaptation.
- Verify native/shell Chromium and WebKit at 1280, 960, and 390px, including
  short windows, composer growth, simulated keyboard viewport, editing, menus,
  glass rims, scroll stability, stretch/rebound, and accessibility preferences.

Reference: https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
