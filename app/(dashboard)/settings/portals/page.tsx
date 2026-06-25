import PortalIntegrationsClient from './PortalIntegrationsClient'

export const metadata = {
    title: 'Portal Integrations | Realzentic',
    description: 'Auto-capture leads from 99acres, MagicBricks, Housing.com and NoBroker.',
}

export default function PortalIntegrationsPage() {
    return (
        <div className="max-w-4xl">
            <PortalIntegrationsClient />
        </div>
    )
}
