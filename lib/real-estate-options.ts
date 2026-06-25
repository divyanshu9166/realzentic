/**
 * Shared real-estate option sets for lead / walk-in capture forms.
 *
 * Centralized here so the dashboard Leads page, the reception Walk-in form, and
 * the public QR walk-in form all present the same property-domain choices
 * (configuration, budget band, purpose, possession timeline, funding) instead
 * of the legacy furniture-store options.
 */

/** Property configuration / what the buyer is looking for. */
export const PROPERTY_CONFIG_OPTIONS = [
    '1 BHK Apartment',
    '2 BHK Apartment',
    '3 BHK Apartment',
    '4 BHK Apartment',
    '5+ BHK / Penthouse',
    'Studio Apartment',
    'Villa / Bungalow',
    'Row House',
    'Residential Plot',
    'Commercial Shop',
    'Office Space',
    'Commercial Plot / Land',
    'Other',
] as const

/** Real-estate budget bands (Indian market). */
export const RE_BUDGET_RANGES = [
    'Under ₹25 Lakh',
    '₹25 – 50 Lakh',
    '₹50 – 75 Lakh',
    '₹75 Lakh – 1 Cr',
    '₹1 – 1.5 Cr',
    '₹1.5 – 2 Cr',
    '₹2 – 3 Cr',
    '₹3 – 5 Cr',
    '₹5 Cr +',
] as const

/** Why the buyer is purchasing — drives nurture/financing messaging. */
export const PURPOSE_OPTIONS = ['End Use', 'Investment', 'Both'] as const

/** How soon the buyer wants possession. */
export const POSSESSION_OPTIONS = [
    'Ready to Move',
    'Within 6 months',
    '6 – 12 months',
    '1 – 2 years',
    '2 + years',
] as const

/** How the purchase will be funded. */
export const FUNDING_OPTIONS = ['Home Loan', 'Self-funded', 'Loan + Self'] as const

export type PropertyConfig = (typeof PROPERTY_CONFIG_OPTIONS)[number]
export type ReBudgetRange = (typeof RE_BUDGET_RANGES)[number]
export type Purpose = (typeof PURPOSE_OPTIONS)[number]
export type Possession = (typeof POSSESSION_OPTIONS)[number]
export type Funding = (typeof FUNDING_OPTIONS)[number]

/**
 * Fold the optional structured preference fields into a human-readable block
 * appended to the free-text notes, so the data is captured without a schema
 * migration and renders cleanly in the lead/walk-in detail view.
 */
export function composePreferenceNotes(input: {
    notes?: string
    purpose?: string
    possession?: string
    location?: string
    funding?: string
}): string {
    const lines: string[] = []
    if (input.location?.trim()) lines.push(`Preferred Location: ${input.location.trim()}`)
    if (input.purpose) lines.push(`Purpose: ${input.purpose}`)
    if (input.possession) lines.push(`Possession: ${input.possession}`)
    if (input.funding) lines.push(`Funding: ${input.funding}`)
    const base = input.notes?.trim() ? input.notes.trim() : ''
    return [base, ...lines].filter(Boolean).join('\n')
}
