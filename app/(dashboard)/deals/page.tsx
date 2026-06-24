/**
 * Deal pipeline page (Req 4.5, 4.6, 17.9, 17.10).
 *
 * Server component: loads the pipeline columns and their deals via
 * `listDealsForBoard`, then hands them to the client-side `DealsBoard`
 * which owns the drag-and-drop interaction and optimistic stage moves.
 *
 * Also renders:
 *  - An "At Risk" panel listing all deals currently marked `isAtRisk`
 *    (Req 17.10).
 *  - Probability badge, sort and filter controls are rendered inside
 *    `DealsBoard` (Req 17.9, 17.10).
 */

import { LayoutGrid } from 'lucide-react';
import { listDealsForBoard } from '@/app/actions/deals';
import DealsBoard, { type BoardColumn, type BoardDealCard } from './DealsBoard';
import AtRiskPanel from './AtRiskPanel';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
    const res = await listDealsForBoard();
    const columns: BoardColumn[] = res.success ? res.data.columns : [];
    const totalDeals = columns.reduce((sum, c) => sum + c.deals.length, 0);

    // Collect all at-risk deals across columns for the At Risk panel (Req 17.10).
    const atRiskDeals: BoardDealCard[] = columns
        .flatMap((c) => c.deals)
        .filter((d) => d.isAtRisk);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="h-5 w-5 text-accent" />
                        <h1 className="text-xl md:text-2xl font-bold text-foreground">Deal Pipeline</h1>
                    </div>
                    <p className="mt-1 text-xs md:text-sm text-muted">
                        Drag deals between stages to update their progress. {totalDeals} active deal
                        {totalDeals === 1 ? '' : 's'}.
                    </p>
                </div>
            </div>

            {!res.success ? (
                <div className="glass-card py-16 text-center text-muted">
                    <p className="font-medium">Could not load the pipeline</p>
                    <p className="mt-1 text-sm">
                        {(res as { success: false; error?: string }).error ?? 'Please refresh the page to try again.'}
                    </p>
                </div>
            ) : (
                <>
                    {/* At Risk panel — shows above the Kanban when there are at-risk deals (Req 17.10) */}
                    {atRiskDeals.length > 0 && (
                        <AtRiskPanel deals={atRiskDeals} />
                    )}

                    {/* Kanban board with probability badge, score sort/filter (Req 17.9, 17.10) */}
                    <DealsBoard initialColumns={columns} />
                </>
            )}
        </div>
    );
}
