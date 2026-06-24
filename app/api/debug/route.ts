import { NextResponse } from 'next/server'

// Debug route — inventory/production models removed in Real Estate CRM migration
export async function GET() {
  return NextResponse.json({ message: 'Debug endpoint — inventory models removed in Real Estate CRM' })
}
