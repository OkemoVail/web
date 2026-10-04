# Apple references for homepage Selected work

Researched 2026-10-04. Scope: three existing linked editorial rows (index, title, description, action), plus a separate Liquid Design showcase link. Primary Apple sources only. Recommendations below are a web adaptation, not an Apple-prescribed homepage template.

## Recommendation

Incorporate **Liquid Design as the fourth peer row**, linking to `/design.html`, under the same **Selected work** heading. Suggested description: “The framework behind this site’s glass controls.” Suggested action: “Explore the framework.” Keep the same anatomy and visual weight as the other projects; no separate promotional panel is needed. This applies Apple’s emphasis on scan-friendly text rows and hierarchy through layout and grouping. [1][3]

## Guidance and its application

| Topic | Apple evidence | Application to Selected work |
| --- | --- | --- |
| Content versus controls | Materials explicitly says “Don’t use Liquid Glass in the content layer” and recommends sparing use on important functional controls/navigation. Standard materials serve differentiation within content. [2] | Keep titles, descriptions, row backgrounds, and the overall list in the content layer. Being linked does not make an editorial row a floating glass control. Reserve the shipped glass treatment for genuine navigation/search controls; the Liquid Design project does not need a glass row to describe glass. |
| Grouping | Lists and tables favors text rows for scanning, concise item text, contextual labels/headers, and styles appropriate to the data. Grouped lists can use headers, footers, and space to separate groups. WWDC25 says hierarchy should come from layout and grouping rather than decoration. [1][3] | One heading and four consistently aligned rows make these items peers. Keep each title, description, and action together. Do not invent subgroups for only four entries. |
| Dividers | HIG illustrates grouped rows with disclosure indicators. WWDC25 replaces hard boundaries with scroll-edge effects specifically where floating UI overlaps scrolling content, and says not to use those effects without floating UI. [1][3] | Retain restrained, theme-aware hairlines between editorial rows if needed for scanning. This is a design recommendation, not a prescribed Apple border thickness. No decorative blurred scroll edge or glass enclosure around the list. |
| Typography | HIG asks for short text and preserved readability at narrow widths. WWDC25 describes bolder, left-aligned typography in key contexts such as onboarding and alerts. [1][3] | Left-align the section and row copy; give the project title the strongest weight, its short description secondary emphasis, and the numeric index tertiary emphasis. Use existing site type/palette rather than copying native platform metrics. Do not truncate essential project names. |
| Mobile adaptation | WWDC25 recommends a shared component anatomy and core interactions across devices, keeping intentionally grouped content together as layout changes; iPhone is narrow and vertical, Mac wide. [3] | Desktop can align index, copy, and trailing action horizontally. On narrow screens, stack description and action beneath the title while preserving order and grouping. Let rows grow with wrapped text; keep the action discoverable without hover. Exact breakpoints are a site implementation decision. |
| Navigation | HIG distinguishes a disclosure indicator for navigation from an info button for details. [1] | Use a clear destination label or consistent trailing navigation cue. Prefer one semantic row link with visible focus/press feedback; its trailing label can be part of that link, avoiding nested interactive controls. This is a web recommendation, not a UIKit requirement. |

## Real Apple web references

- **Design Pathway — “Get inspiration from the developer community”** presents a small editorial collection of linked titles and explanatory text. Its “Discover more” items combine a title, short description, and “Learn more” action. This is the closest content-anatomy reference; it is not an exact numbered-row layout. [4]
- **Apple Developer Design overview** groups HIG, Apple Design Resources, Icon Composer, and SF Symbols as peer linked resources with titles, short descriptions, and destination actions. It demonstrates that a design framework/resource can sit alongside tools in a collection. Its image-led presentation is a reference for grouping, not a reason to replace these text rows with cards. [5]

These are live first-party website examples, not published reusable web components. HIG and WWDC guidance primarily describes Apple-platform UI. The inspected sources provide guidance, native API references, and design resources; they do not provide a reusable Apple homepage CSS implementation or Liquid Glass renderer source.

## Sources

1. [HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) — Best practices, Content, Style, and Platform considerations. Read through Apple’s [documentation JSON](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/lists-and-tables.json), because the HTML requires JavaScript.
2. [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) — Liquid Glass and Standard materials. Read through Apple’s [documentation Markdown](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/materials.md).
3. [WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/) — Design Language (2:06), Structure (6:16), and Continuity (13:34); official transcript.
4. [Apple Developer: Design Pathway](https://developer.apple.com/design/get-started/) — “Get inspiration from the developer community” and “Discover more.”
5. [Apple Developer: Design](https://developer.apple.com/design/) — linked design resources collection.
