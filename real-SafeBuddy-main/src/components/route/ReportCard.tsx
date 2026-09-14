import { AlertTriangle, Clock, ThumbsUp, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeTime, type SafetyReport } from "@/lib/reports/types";
import { canDelete, canLike } from "@/lib/reports/mutations";

/**
 * The panel shown when a report on the map is tapped.
 *
 * Liking and deleting are only offered when they can actually succeed, which
 * is what `canLike` and `canDelete` decide. Imported historic reports live in
 * a read-only table, so they show neither button.
 */
export interface ReportCardProps {
  report: SafetyReport;
  currentUserId: string | null;
  onClose: () => void;
  onLike: (report: SafetyReport) => void;
  onDelete: (report: SafetyReport) => void;
  /** Drop the card chrome when shown inside another panel. */
  embedded?: boolean;
}

const ReportCard = ({
  report,
  currentUserId,
  onClose,
  onLike,
  onDelete,
  embedded = false,
}: ReportCardProps) => {
  const iconTone =
    report.severity === "high"
      ? "bg-destructive/20 text-destructive"
      : report.severity === "medium"
        ? "bg-warning/20 text-warning"
        : "bg-success/20 text-success";

  return (
    <Card
      className={
        embedded ? "border-0 bg-transparent shadow-none" : "border-primary/20 shadow-lg"
      }
    >
      <CardContent className={embedded ? "p-0" : "p-3"}>
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${iconTone}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{report.reportType}</h3>
              <p className="truncate text-xs text-muted-foreground">{report.locationAddress}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-6 w-6 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>

        {report.description && (
          <p className="mb-2 text-xs text-muted-foreground">{report.description}</p>
        )}

        <div className="flex items-center justify-between">
          <Badge variant="outline" className="h-5 text-xs">
            <Clock className="mr-1 h-3 w-3" />
            {formatRelativeTime(report.createdAt)}
          </Badge>

          <div className="flex items-center gap-2">
            {canLike(report) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onLike(report)}
                className="h-6 px-2 text-xs"
              >
                <ThumbsUp className="mr-1 h-3 w-3" />
                {report.upvotes}
              </Button>
            )}
            {canDelete(report, currentUserId) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(report)}
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportCard;
