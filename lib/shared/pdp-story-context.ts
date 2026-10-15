import type { PdpCopyPlanRequest } from './pdp-copy-quality';
import type { SectionBlueprint } from './pdp';

// Text-only context: existing generated images and provider settings never travel here.
export function buildPdpStoryContext(sections: SectionBlueprint[], mode: 'insert' | 'replace', position: number): NonNullable<PdpCopyPlanRequest['storyContext']> {
  const index = Math.max(0, Math.min(sections.length, position));
  return {
    mode, position: index,
    previousSectionId: sections[index - 1]?.section_id,
    nextSectionId: sections[mode === 'insert' ? index : index + 1]?.section_id,
    sections: sections.map(section => ({
      section_id: section.section_id, section_name: section.section_name,
      headline: section.headline, subheadline: section.subheadline,
      bullets: section.bullets.slice(0, 6), goal: section.goal,
    })),
  };
}

export function formatPdpStoryContext(value: PdpCopyPlanRequest['storyContext']): string {
  if (!value || !Array.isArray(value.sections) || !['insert', 'replace'].includes(value.mode) || !Number.isInteger(value.position) || value.position < 0 || value.position > value.sections.length || value.sections.length > 100) return '';
  const clean = (v: unknown, size: number) => typeof v === 'string' ? v.slice(0, size) : '';
  const sections = value.sections.map(s => ({
    section_id: clean(s.section_id, 200), section_name: clean(s.section_name, 200),
    headline: clean(s.headline, 200), subheadline: clean(s.subheadline, 500),
    bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 6).map(b => clean(b, 200)) : [], goal: clean(s.goal, 500),
  }));
  return JSON.stringify({ mode: value.mode, position: value.position,
    previous: sections[value.position - 1] ?? null,
    next: sections[value.mode === 'insert' ? value.position : value.position + 1] ?? null,
    orderedStory: sections });
}
