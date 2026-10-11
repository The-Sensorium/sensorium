import { useDocumentTitle } from '../lib/use-document-title'
import { LegalBlocks, LegalLayout, Section } from './legal/LegalLayout'
import { SAFETY_DOCUMENT } from './legal/content'

export function ChildSafetyPage() {
  useDocumentTitle('Child Safety Standards')
  return (
    <LegalLayout title={SAFETY_DOCUMENT.title} updated={SAFETY_DOCUMENT.updated}>
      <p>{SAFETY_DOCUMENT.intro}</p>

      {SAFETY_DOCUMENT.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          <LegalBlocks blocks={section.blocks} />
        </Section>
      ))}
    </LegalLayout>
  )
}
