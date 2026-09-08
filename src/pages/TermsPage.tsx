import { useDocumentTitle } from '../lib/use-document-title'
import { LegalBlocks, LegalLayout, Section } from './legal/LegalLayout'
import { TERMS_DOCUMENT } from './legal/content'

export function TermsPage() {
  useDocumentTitle('Terms of Service')
  return (
    <LegalLayout title={TERMS_DOCUMENT.title} updated={TERMS_DOCUMENT.updated}>
      <p>{TERMS_DOCUMENT.intro}</p>

      {TERMS_DOCUMENT.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          <LegalBlocks blocks={section.blocks} />
        </Section>
      ))}
    </LegalLayout>
  )
}
