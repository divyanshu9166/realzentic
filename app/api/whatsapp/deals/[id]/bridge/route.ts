/**
 * app/api/whatsapp/deals/[id]/bridge/route.ts
 *
 * POST /api/whatsapp/deals/[id]/bridge
 *
 * Bridges the given WhatsApp CRM deal to the main CRM deal pipeline by
 * calling the bridgeWaDealToCrm server action.
 *
 * Authentication: requires an active session (getSession from auth-helpers).
 * Authorisation: enforced inside bridgeWaDealToCrm (ADMIN or MANAGER role).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-helpers'
import { bridgeWaDealToCrm } from '@/app/actions/wa-deal-bridge'

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await getSession()
    if (!session?.user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const result = await bridgeWaDealToCrm(id)

    if (!result.success) {
        const status =
            result.error?.startsWith('Forbidden') ? 403
                : result.error?.includes('not found') ? 404
                    : 400
        return NextResponse.json(result, { status })
    }

    return NextResponse.json(result)
}
