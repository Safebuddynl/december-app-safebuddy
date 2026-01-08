import { useState, useEffect } from "react";
import { Plus, AlertTriangle, ThumbsUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BottomNav from "@/components/BottomNav";
import ReportLocationDialog from "@/components/ReportLocationDialog";
import { supabase } from "@/integrations/supabase/client";

const Community = () => {
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    // Haal beide safety_reports en map_points op
    const [safetyReportsResponse, mapPointsResponse] = await Promise.all([
      supabase
        .from("safety_reports")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("map_points")
        .select("*")
        .order("created_at", { ascending: false })
    ]);

    const allReports = [];

    // Voeg safety_reports toe
    if (!safetyReportsResponse.error && safetyReportsResponse.data) {
      allReports.push(...safetyReportsResponse.data.map(r => ({
        ...r,
        location_address: r.location_address || 'Onbekende locatie',
        source: 'user_report'
      })));
    }

    // Voeg map_points toe (converteer naar safety_reports format)
    if (!mapPointsResponse.error && mapPointsResponse.data) {
      allReports.push(...mapPointsResponse.data.map(mp => ({
        id: mp.id,
        report_type: mp.title,
        location_address: mp.description?.substring(0, 50) || 'Geverifieerde melding',
        severity: mp.severity === 'critical' ? 'high' : mp.severity,
        time_of_day: 'Onbekend',
        description: mp.description || '',
        upvotes: mp.upvotes,
        created_at: mp.created_at,
        is_verified: mp.is_verified,
        source: 'imported'
      })));
    }

    // Sorteer op datum (nieuwste eerst)
    allReports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setReports(allReports);
    console.log(`📊 Loaded ${allReports.length} total reports`);
  };

  const getSeverityColor = (severity: string) => {
    if (severity === "high") return "bg-destructive text-destructive-foreground";
    if (severity === "medium") return "bg-warning text-warning-foreground";
    return "bg-muted text-muted-foreground";
  };

  const getIconColor = (severity: string) => {
    if (severity === "high") return "bg-destructive/20 text-destructive";
    if (severity === "medium") return "bg-warning/20 text-warning";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background pb-20 overflow-y-auto">
      {/* Header with gradient */}
      <div className="gradient-header pt-12 pb-8 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-primary-foreground mb-1">Community Reports</h1>
          <p className="text-primary-foreground/80 text-sm">Share and view safety reports</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-4">
        <Button 
          onClick={() => setReportDialogOpen(true)}
          className="w-full mb-6 shadow-lg gradient-primary hover:opacity-90"
        >
          <Plus className="h-5 w-5 mr-2" />
          New Report
        </Button>

        {/* Filter Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="high">High</TabsTrigger>
            <TabsTrigger value="medium">Medium</TabsTrigger>
            <TabsTrigger value="low">Low</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {reports.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No reports yet</p>
                </CardContent>
              </Card>
            ) : (
              reports.map((report, index) => (
                <Card key={index} className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${getIconColor(report.severity)}`}>
                        <AlertTriangle className="h-6 w-6" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground">{report.report_type}</h3>
                              {report.is_verified && (
                                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                                  Geverifieerd
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="truncate">{report.location_address}</span>
                            </div>
                          </div>
                          <Badge className={getSeverityColor(report.severity)}>
                            {report.severity === "high" ? "High" : report.severity === "medium" ? "Medium" : "Low"}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground mb-3">
                          {report.description}
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground capitalize">{report.time_of_day}</span>
                          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
                            <ThumbsUp className="h-4 w-4" />
                            <span>{report.upvotes}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="high" className="space-y-4">
            {reports.filter(r => r.severity === "high").length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No high risk reports</p>
                </CardContent>
              </Card>
            ) : (
              reports.filter(r => r.severity === "high").map((report, index) => (
                <Card key={index} className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${getIconColor(report.severity)}`}>
                        <AlertTriangle className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1">{report.report_type}</h3>
                        <p className="text-sm text-muted-foreground">{report.location_address}</p>
                      </div>
                      <Badge className={getSeverityColor(report.severity)}>High</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="medium" className="space-y-4">
            {reports.filter(r => r.severity === "medium").length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No medium risk reports</p>
                </CardContent>
              </Card>
            ) : (
              reports.filter(r => r.severity === "medium").map((report, index) => (
                <Card key={index} className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${getIconColor(report.severity)}`}>
                        <AlertTriangle className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1">{report.report_type}</h3>
                        <p className="text-sm text-muted-foreground">{report.location_address}</p>
                      </div>
                      <Badge className={getSeverityColor(report.severity)}>Medium</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="low" className="space-y-4">
            {reports.filter(r => r.severity === "low").length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No low risk reports</p>
                </CardContent>
              </Card>
            ) : (
              reports.filter(r => r.severity === "low").map((report, index) => (
                <Card key={index} className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${getIconColor(report.severity)}`}>
                        <AlertTriangle className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1">{report.report_type}</h3>
                        <p className="text-sm text-muted-foreground">{report.location_address}</p>
                      </div>
                      <Badge className={getSeverityColor(report.severity)}>Low</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Small Ad Space */}
        <div className="mt-6 mb-4">
          <div className="bg-muted/50 border border-border rounded-lg p-3 text-center">
            <span className="text-xs text-muted-foreground">Advertisement</span>
          </div>
        </div>
      </div>

      <ReportLocationDialog 
        open={reportDialogOpen} 
        onOpenChange={setReportDialogOpen}
        onReportSubmitted={fetchReports}
      />

      <BottomNav />
    </div>
  );
};

export default Community;
