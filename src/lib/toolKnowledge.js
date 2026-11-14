import { HELP_SECTIONS } from '@/lib/helpContent';

// The Guides sheet and its question bar describe the tools with the same
// entries as Help → Tools, so the two can never disagree.
export const TOOL_GUIDE_SECTIONS = HELP_SECTIONS.map((section) => ({
  title: section.title,
  items: section.entries.map((entry) => ({ name: entry.label, description: entry.desc })),
}));
