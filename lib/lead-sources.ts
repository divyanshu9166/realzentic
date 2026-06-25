export const WHATSAPP_INQUIRY_SOURCE = 'WhatsApp Inquiry'

export const LEAD_SOURCE_OPTIONS = [
  'WhatsApp',
  WHATSAPP_INQUIRY_SOURCE,
  'Instagram',
  'Facebook',
  'Website',
  'Walk-in',
  'Site Visit',
  'Showroom Visit',
  'Referral',
  'Channel Partner',
  'IndiaMART',
  '99acres',
  'MagicBricks',
  'Housing',
  'NoBroker',
] as const

export type LeadSource = (typeof LEAD_SOURCE_OPTIONS)[number]
