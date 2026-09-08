import { useDocumentTitle } from '../lib/use-document-title'
import { LegalBlocks, LegalLayout, Section } from './legal/LegalLayout'
import { PRIVACY_DOCUMENT } from './legal/content'

export function PrivacyPolicyPage() {
  useDocumentTitle('Privacy Policy')
  return (
    <LegalLayout title={PRIVACY_DOCUMENT.title} updated={PRIVACY_DOCUMENT.updated}>
      <p>{PRIVACY_DOCUMENT.intro}</p>

      {PRIVACY_DOCUMENT.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          <LegalBlocks blocks={section.blocks} />
        </Section>
      ))}
    </LegalLayout>
  )
}
