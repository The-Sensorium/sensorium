import { useDocumentTitle } from '../lib/use-document-title'
import { LegalLayout, Section } from './legal/LegalLayout'

export function TermsPage() {
  useDocumentTitle('Terms of Service')
  return (
    <LegalLayout title="Terms of Service" updated="August 2, 2026">
      <p>
        These Terms govern your use of Sensorium, a social platform that places you into a permanent
        group of eight people (“clusters”). By signing up you agree to these Terms. You must be at
        least 18 years old to use the service.
      </p>

      <Section title="1. The service">
        <p>
          Sensorium matches you into a cluster by birth date or location and provides tools for that
          group to interact: chat, signals for help, and votes. We may change, suspend, or
          discontinue any feature at any time.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You are responsible for keeping your account credentials safe and for everything done on
          your account. You must not share accounts or provide false information, including an
          incorrect date of birth.
        </p>
      </Section>

      <Section title="3. Acceptable use">
        <p>You agree not to use Sensorium to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>harass, threaten, or impersonate others;</li>
          <li>share illegal, hateful, or sexually explicit content;</li>
          <li>spam or abuse the reporting, voting, or messaging systems;</li>
          <li>attempt to breach our security or collect data about other members.</li>
        </ul>
      </Section>

      <Section title="4. Your content">
        <p>
          You keep whatever rights you have in your own posts. You grant Sensorium a limited license
          to store, display, and distribute your content solely for providing the service. We may
          remove content or suspend accounts that our moderation team determines violate these
          Terms.
        </p>
      </Section>

      <Section title="5. Termination">
        <p>
          You can leave a cluster or delete your account at any time from Settings. We may also
          suspend or terminate accounts for a breach of these Terms or to protect the community.
        </p>
      </Section>

      <Section title="6. Disclaimers">
        <p>
          The service is provided “as is” and “as available.” To the extent permitted by law, we
          disclaim warranties about reliability, fitness, or uninterrupted availability, and our
          liability is limited to the amount you paid us (Sensorium is free today).
        </p>
      </Section>

      <Section title="7. Changes & contact">
        <p>
          We may update these Terms, and the current version always applies; continued use after a
          change means you accept them. Questions?{' '}
          <a className="text-primary underline" href="mailto:legal@sensorium.app">
            legal@sensorium.app
          </a>
        </p>
      </Section>
    </LegalLayout>
  )
}