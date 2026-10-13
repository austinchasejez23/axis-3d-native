import { GUIDE_SECTIONS } from '@/lib/gestureGuide';
import { TOOL_GUIDE_SECTIONS } from '@/lib/toolKnowledge';

export default function GuideCategoryContent({ uiColor, highlightColor }) {
  const sections = [...GUIDE_SECTIONS, ...TOOL_GUIDE_SECTIONS];
  return sections.map(({ title, items }) => (
    <section key={title} className="mb-5">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: highlightColor }}>{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.name || index} className="text-[13px] leading-snug flex gap-2" style={{ color: uiColor }}>
            <span style={{ color: highlightColor }}>&bull;</span>
            <span>{item.name && <strong style={{ color: highlightColor }}>{item.name}: </strong>}{item.description || item}</span>
          </li>
        ))}
      </ul>
    </section>
  ));
}