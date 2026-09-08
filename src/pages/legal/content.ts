export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'email'; before: string; address: string; after: string }

export interface LegalSection {
  title: string
  blocks: LegalBlock[]
}

export interface LegalDocument {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
}

export const TERMS_DOCUMENT: LegalDocument = {
  title: 'Terms of Service',
  updated: 'August 20, 2026',
  intro:
    'These Terms govern your use of Sensorium, a social platform that places you into a permanent group of eight people (“clusters”). By signing up you agree to these Terms. You must be at least 18 years old to use the service.',
  sections: [
    {
      title: '1. The service',
      blocks: [
        {
          kind: 'p',
          text: 'Sensorium matches you into a cluster by birth date or location and provides tools for that group to interact: chat, signals for help, and votes. We may change, suspend, or discontinue any feature at any time.',
        },
      ],
    },
    {
      title: '2. Your account',
      blocks: [
        {
          kind: 'p',
          text: 'You are responsible for keeping your account credentials safe and for everything done on your account. You must not share accounts or provide false information, including an incorrect date of birth.',
        },
      ],
    },
    {
      title: '3. Acceptable use',
      blocks: [
        { kind: 'p', text: 'You agree not to use Sensorium to:' },
        {
          kind: 'bullets',
          items: [
            'harass, threaten, or impersonate others;',
            'share illegal, hateful, or sexually explicit content;',
            'spam or abuse the reporting, voting, or messaging systems;',
            'attempt to breach our security or collect data about other members.',
          ],
        },
      ],
    },
    {
      title: '4. Your content',
      blocks: [
        {
          kind: 'p',
          text: 'You keep whatever rights you have in your own posts. You grant Sensorium a limited license to store, display, and distribute your content solely for providing the service. We may remove content or suspend accounts that our moderation team determines violate these Terms.',
        },
      ],
    },
    {
      title: '5. Moderation and enforcement',
      blocks: [
        {
          kind: 'p',
          text: 'Members can report other members or specific messages. A report is reviewed by our moderation team, who may dismiss it or take action. Actions we may take include hiding or restoring a reported message, issuing a warning, suspending an account for up to 7 days, or permanently banning an account. Permanent bans are applied by administrators.',
        },
        {
          kind: 'p',
          text: 'If your account is suspended or banned, you can sign in to a restricted-account screen that shows your status and any suspension expiry. If you believe a decision is wrong, you can appeal from inside the app. If your message is hidden or your account is warned or suspended, we notify you in the app.',
        },
      ],
    },
    {
      title: '6. Termination',
      blocks: [
        {
          kind: 'p',
          text: 'You can leave a cluster or delete your account at any time from Settings. We may also suspend or terminate accounts for a breach of these Terms or to protect the community.',
        },
      ],
    },
    {
      title: '7. Disclaimers',
      blocks: [
        {
          kind: 'p',
          text: 'The service is provided “as is” and “as available.” To the extent permitted by law, we disclaim warranties about reliability, fitness, or uninterrupted availability, and our liability is limited to the amount you paid us (Sensorium is free today).',
        },
      ],
    },
    {
      title: '8. Changes & contact',
      blocks: [
        {
          kind: 'email',
          before:
            'We may update these Terms, and the current version always applies; continued use after a change means you accept them. Questions? ',
          address: 'legal@sensorium.app',
          after: '',
        },
      ],
    },
  ],
}

export const PRIVACY_DOCUMENT: LegalDocument = {
  title: 'Privacy Policy',
  updated: 'August 20, 2026',
  intro:
    'Sensorium connects you with a small, permanent group of people (a “cluster”). This policy explains what personal data we collect, why, and the choices you have. You must be at least 18 years old to use Sensorium.',
  sections: [
    {
      title: '1. What we collect',
      blocks: [
        {
          kind: 'p',
          text: 'When you create an account we collect your email, display name, date of birth, country, and any details you add to your profile. If you enable Local matching, we store a coarse location (city area) and the matching radius you choose, never your precise coordinates. We also record your activity on the service, such as messages, reactions, signals, votes, and notifications.',
        },
        {
          kind: 'p',
          text: 'Only your birth year is shown to other members. Month and day are used internally for matching and are never displayed.',
        },
      ],
    },
    {
      title: '2. How we use your data',
      blocks: [
        {
          kind: 'p',
          text: 'We use the data we collect to provide, personalize, and protect our service, including:',
        },
        {
          kind: 'bullets',
          items: [
            'creating and matching clusters based on birth date or location;',
            'operating cluster chat, signals, votes, and notifications;',
            'moderating content and responding to reports of misconduct;',
            'improving the product and keeping it secure.',
          ],
        },
      ],
    },
    {
      title: '3. Data sharing',
      blocks: [
        {
          kind: 'p',
          text: 'We do not sell your personal data. Within a cluster, your profile and answers to the introduction phase are visible only to that cluster. Reports you submit are shared only with our moderation team.',
        },
      ],
    },
    {
      title: '4. Storage and deletion',
      blocks: [
        {
          kind: 'p',
          text: 'Data is stored by our hosted infrastructure provider and kept while you have an active account. You can delete your account at any time from Settings, which removes your profile, memberships, and the content you own. Some records may be retained where required by law or to investigate reported abuse.',
        },
        {
          kind: 'p',
          text: "Moderation records, including reports and the actions taken on them, are retained for up to 24 months so we can keep our community safe. If you delete your account, we remove the personal identifiers from those records rather than destroy the audit trail. When a message is hidden or your account is warned or suspended, we notify you in the app; a permanent ban ends your access, so it is communicated through the affected account's restricted screen instead.",
        },
      ],
    },
    {
      title: '5. Age restriction',
      blocks: [
        {
          kind: 'p',
          text: 'Sensorium is not intended for anyone under 18. We require your date of birth and restrict accounts that do not meet the minimum age.',
        },
      ],
    },
    {
      title: '6. Security & changes',
      blocks: [
        {
          kind: 'p',
          text: 'We use industry-standard safeguards and store data through a managed, verified platform. We may update this policy and will refresh the date at the top whenever we do.',
        },
      ],
    },
    {
      title: '7. Contact',
      blocks: [
        {
          kind: 'email',
          before: 'Questions about this policy? Reach out at ',
          address: 'privacy@sensorium.app',
          after: '.',
        },
      ],
    },
  ],
}
