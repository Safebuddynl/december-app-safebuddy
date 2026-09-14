import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isValidLatLng } from "@/lib/geo";
import { fetchAllReports } from "@/lib/reports/fetchReports";
import {
  countBySeverity,
  type MappedReport,
  type SafetyReport,
  type SeverityCounts,
} from "@/lib/reports/types";

/**
 * Loads every safety report and exposes it in the two shapes the app needs:
 * the full list for the Community feed, and the subset that has coordinates
 * for the map.
 *
 * Reading the full dataset takes fifteen requests, so the result is cached by
 * React Query and shared between the map and the feed. Without that, every
 * switch between the two tabs would download all ~15.000 rows again.
 */

const REPORTS_QUERY_KEY = ["reports"] as const;

/** How long a loaded set of reports is considered current. */
const STALE_TIME_MS = 5 * 60 * 1000;

export interface UseReportsResult {
  reports: SafetyReport[];
  /** Only reports with usable coordinates, ready to plot. */
  mapped: MappedReport[];
  counts: SeverityCounts;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Apply a local change without refetching, e.g. after a like. */
  patchReport: (id: string, changes: Partial<SafetyReport>) => void;
  removeReport: (id: string) => void;
  /** Show a report the user just created, without refetching everything. */
  addReport: (report: SafetyReport) => void;
}

const EMPTY: SafetyReport[] = [];

export function useReports(): UseReportsResult {
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: REPORTS_QUERY_KEY,
    queryFn: fetchAllReports,
    staleTime: STALE_TIME_MS,
    // The dataset is large and changes slowly; refetching on every window
    // focus would be a lot of traffic for very little freshness.
    refetchOnWindowFocus: false,
  });

  const reports = data ?? EMPTY;

  const mapped = useMemo<MappedReport[]>(
    () =>
      reports
        .filter(
          (report) =>
            report.coordinates !== null &&
            isValidLatLng(report.coordinates.lat, report.coordinates.lng)
        )
        .map((report) => ({
          lat: report.coordinates!.lat,
          lng: report.coordinates!.lng,
          report,
        })),
    [reports]
  );

  const counts = useMemo(() => countBySeverity(mapped), [mapped]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: REPORTS_QUERY_KEY });
  }, [queryClient]);

  const patchReport = useCallback(
    (id: string, changes: Partial<SafetyReport>) => {
      queryClient.setQueryData<SafetyReport[]>(REPORTS_QUERY_KEY, (current) =>
        current?.map((report) => (report.id === id ? { ...report, ...changes } : report))
      );
    },
    [queryClient]
  );

  const removeReport = useCallback(
    (id: string) => {
      queryClient.setQueryData<SafetyReport[]>(REPORTS_QUERY_KEY, (current) =>
        current?.filter((report) => report.id !== id)
      );
    },
    [queryClient]
  );

  const addReport = useCallback(
    (report: SafetyReport) => {
      queryClient.setQueryData<SafetyReport[]>(REPORTS_QUERY_KEY, (current) => [
        report,
        ...(current ?? []),
      ]);
    },
    [queryClient]
  );

  return {
    reports,
    mapped,
    counts,
    isLoading: isPending,
    error: error ? "Meldingen konden niet worden geladen" : null,
    refresh,
    patchReport,
    removeReport,
    addReport,
  };
}
