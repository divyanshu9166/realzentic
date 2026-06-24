import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/cron/stock-alerts
 * Stock alerts are not applicable in Real Estate CRM — no inventory/product model.
 * This endpoint is kept as a no-op stub to avoid 404 errors from any existing cron config.
 */
export async function GET(req: NextRequest) {
  const apiSecret = req.headers.get('x-api-secret')
  if (apiSecret !== process.env.CRM_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    alertsSent: 0,
    message: 'Stock alerts disabled — inventory module removed in Real Estate CRM',
  })
}
