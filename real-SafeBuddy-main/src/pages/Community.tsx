import { useState, useEffect } from "react";
import { Plus, AlertTriangle, ThumbsUp, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BottomNav from "@/components/BottomNav";
import ReportLocationDialog from "@/components/ReportLocationDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Community = () => {
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    fetchReports();
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getCurrentUser();
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
        report_type: mp.title || 'Melding',
        location_address: mp.report_type || mp.title || 'Geverifieerde melding',
        severity: mp.severity === 'critical' ? 'high' : mp.severity,
        time_of_day: 'Onbekend',
        description: '', // Laat leeg om duplicatie te voorkomen
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

  const handleDeleteReport = async (reportId: string, source: string) => {
    try {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Log in om te verwijderen');
        return;
      }

      // Only allow deleting from safety_reports (user's own reports)
      if (source !== 'user_report') {
        toast.error('Je kunt alleen je eigen reports verwijderen');
        return;
      }

      // Check if user owns the report
      const { data: reportData } = await supabase
        .from('safety_reports')
        .select('user_id')
        .eq('id', reportId)
        .single();

      if (!reportData || reportData.user_id !== user.id) {
        toast.error('Je kunt alleen je eigen reports verwijderen');
        return;
      }

      // Delete report_likes first (cascade)
      await supabase
        .from('report_likes')
        .delete()
        .eq('report_id', reportId)
        .eq('report_source', 'safety_reports');

      // Delete the report
      const { error } = await supabase
        .from('safety_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      toast.success('Report verwijderd');
      
      // Update local state
      setReports(reports.filter(r => r.id !== reportId));
      
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Kon report niet verwijderen');
    }
  };

  const getIconColor = (severity: string) => {
    if (severity === "high") return "bg-destructive/20 text-destructive";
    if (severity === "medium") return "bg-warning/20 text-warning";
    return "bg-muted text-muted-foreground";
  };

  const handleUpvote = async (reportId: string, source: string) => {
    // Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Log in om te liken");
      return;
    }
    
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    
    // Bepaal juiste tabel naam
    const tableName = source === 'user_report' ? 'safety_reports' : 'map_points';
    
    // Check of user al heeft geliked
    const { data: existingLike } = await supabase
      .from('report_likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('report_id', reportId)
      .eq('report_source', tableName)
      .single();
    
    if (existingLike) {
      // Unlike: verwijder de like
      const { error: deleteError } = await supabase
        .from('report_likes')
        .delete()
        .eq('id', existingLike.id);
      
      if (deleteError) {
        toast.error("Kon niet unliken");
        return;
      }
      
      const newUpvotes = Math.max((report.upvotes || 0) - 1, 0);
      
      // Update in juiste tabel
      const { error } = await supabase
        .from(tableName)
        .update({ upvotes: newUpvotes })
        .eq("id", reportId);
      
      if (!error) {
        toast.success("Like verwijderd");
        // Update lokaal
        setReports(reports.map(r => 
          r.id === reportId ? { ...r, upvotes: newUpvotes } : r
        ));
      } else {
        toast.error("Kon niet unliken");
      }
      return;
    }
    
    // Like: voeg like toe
    const newUpvotes = (report.upvotes || 0) + 1;
    
    // Voeg like toe aan report_likes tabel
    const { error: likeError } = await supabase
      .from('report_likes')
      .insert({
        user_id: user.id,
        report_id: reportId,
        report_source: tableName
      });
    
    if (likeError) {
      toast.error("Kon niet liken");
      return;
    }
    
    // Update in juiste tabel
    const { error } = await supabase
      .from(tableName)
      .update({ upvotes: newUpvotes })
      .eq("id", reportId);
    
    if (!error) {
      toast.success("Report geliked!");
      // Update lokaal
      setReports(reports.map(r => 
        r.id === reportId ? { ...r, upvotes: newUpvotes } : r
      ));
    } else {
      toast.error("Kon niet liken");
    }
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
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleUpvote(report.id, report.source)}
                              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                            >
                              <ThumbsUp className="h-4 w-4" />
                              <span>{report.upvotes || 0}</span>
                            </button>
                            {currentUser && report.user_id === currentUser.id && (
                              <button 
                                onClick={() => handleDeleteReport(report.id, report.source)}
                                className="text-destructive hover:text-destructive/80 transition-colors p-1"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
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
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(report.severity)}>High</Badge>
                        {currentUser && report.user_id === currentUser.id && (
                          <button 
                            onClick={() => handleDeleteReport(report.id, report.source)}
                            className="text-destructive hover:text-destructive/80 transition-colors p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(report.severity)}>Medium</Badge>
                        {currentUser && report.user_id === currentUser.id && (
                          <button 
                            onClick={() => handleDeleteReport(report.id, report.source)}
                            className="text-destructive hover:text-destructive/80 transition-colors p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
                      <div className="flex items-center gap-2">
                        <Badge className={getSeverityColor(report.severity)}>Low</Badge>
                        {currentUser && report.user_id === currentUser.id && (
                          <button 
                            onClick={() => handleDeleteReport(report.id, report.source)}
                            className="text-destructive hover:text-destructive/80 transition-colors p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
