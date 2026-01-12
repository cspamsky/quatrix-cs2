## 2024-05-22 - FileManager Accessibility
**Learning:** Icon-only buttons in the file manager were completely inaccessible to screen reader users due to missing `aria-label`s. Also, breadcrumb navigation used non-semantic `span` elements with `onClick` handlers, making them inaccessible via keyboard.
**Action:** Always verify icon-only buttons have descriptive labels and use semantic HTML elements (like `button` or `a`) for interactive elements.
