import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Search, 
  RefreshCw, 
  Download, 
  Eye, 
  Webhook,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2, 
  Users,
  Mail
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface WebhookLog {
  id: string;
  executed_at: string;
  event_type?: string | null;
  lead_id?: string | null;
  payload?: any;
  results?: any;
}

// Helper function to safely format event type
const safeFormatEventType = (eventType?: string | null): string => {
  if (!eventType || typeof eventType !== 'string') {
    return 'Unknown Event';
  }
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Helper function to safely get event type for filtering
const safeGetEventType = (eventType?: string | null): string => {
  return eventType || '';
};

// Helper function to safely get lead id slice
const safeGetLeadIdSlice = (leadId?: string | null): string => {
  if (!leadId || typeof leadId !== 'string') {
    return 'N/A';
  }
  return leadId.length > 8 ? `${leadId.slice(0, 8)}...` : leadId;
};
 
const WebhookLogs = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [dateRange, setDateRange] = useState('7d');

  useEffect(() => {
    fetchLogs(true);
  }, [dateRange]);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, eventTypeFilter]);

  const fetchLogs = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
        setLogs([]);
      } else {
        setLoadingMore(true);
      }
      
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch (dateRange) {
        case '24h':
          startDate.setDate(now.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        default:
          startDate.setDate(now.getDate() - 7);
      }

      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .gte('executed_at', startDate.toISOString())
        .order('executed_at', { ascending: false })
        .limit(limit)
        .range(reset ? 0 : offset, (reset ? 0 : offset) + limit - 1);

      if (error) {
        console.error('Error fetching webhook logs:', error);
        throw error;
      }
      
      const logData = data || [];
      
      if (reset) {
        setLogs(logData);
      } else {
        setLogs(prev => [...prev, ...logData]);
      }
      
      // Check if there are more logs to load
      setHasMore(logData.length === limit);
      
      if (!reset) {
        setOffset(prev => prev + limit);
      }
      
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch webhook logs",
        variant: "destructive",
      });
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  const loadMoreLogs = () => {
    if (!loadingMore && hasMore) {
      fetchLogs(false);
    }
  };

  const filterLogs = () => {
    let filtered = logs;

    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(log => {
        const eventType = safeGetEventType(log.event_type);
        const leadId = log.lead_id || '';
        
        return eventType.toLowerCase().includes(searchLower) ||
               leadId.toLowerCase().includes(searchLower);
      });
    }

    if (eventTypeFilter !== 'all') {
      filtered = filtered.filter(log => safeGetEventType(log.event_type) === eventTypeFilter);
    }

    setFilteredLogs(filtered);
  };

  const getEventTypeIcon = (eventType?: string | null) => {
    const type = safeGetEventType(eventType);
    switch (type) {
      case 'new_lead':
        return <Users className="h-4 w-4 text-blue-500" />;
      case 'lead_updated':
        return <RefreshCw className="h-4 w-4 text-orange-500" />;
      case 'email_sent':
        return <Mail className="h-4 w-4 text-green-500" />;
      case 'status_changed':
        return <CheckCircle className="h-4 w-4 text-purple-500" />;
      case 'quickbooks_webhook':
        return <ExternalLink className="h-4 w-4 text-indigo-500" />;
      default:
        return <Webhook className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventTypeBadgeVariant = (eventType?: string | null): "default" | "secondary" | "outline" => {
    const type = safeGetEventType(eventType);
    switch (type) {
      case 'new_lead':
      case 'quickbooks_webhook':
        return 'default';
      case 'lead_updated':
      case 'status_changed':
        return 'secondary';
      case 'email_sent':
      default:
        return 'outline';
    }
  };

  const getResultsStatus = (results: any) => {
    if (!results) return { status: 'unknown', count: 0, successCount: 0 };
    
    if (Array.isArray(results)) {
      const successCount = results.filter(r => r && r.success !== false).length;
      const totalCount = results.length;
      return {
        status: successCount === totalCount ? 'success' : successCount > 0 ? 'partial' : 'failed',
        count: totalCount,
        successCount
      };
    }
    
    return { status: 'success', count: 1, successCount: 1 };
  };

  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'Event Type', 'Lead ID', 'Results Status'].join(','),
      ...filteredLogs.map(log => {
        const resultsStatus = getResultsStatus(log.results);
        return [
          `"${log.executed_at}"`,
          `"${safeGetEventType(log.event_type)}"`,
          `"${log.lead_id || ''}"`,
          `"${resultsStatus.status}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webhook-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Webhook logs have been exported to CSV",
    });
  };

  // Safely get unique event types
  const uniqueEventTypes = [...new Set(
    logs
      .map(log => safeGetEventType(log.event_type))
      .filter(eventType => eventType && eventType.trim() !== '')
  )];

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Webhook Logs</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Monitor webhook executions and external integrations
          </p>
        </div>

        {/* Controls */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg">Webhook Filters</span>
              <div className="flex gap-2">
                <Button onClick={exportLogs} variant="outline" size="sm" className="premium-button">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button onClick={() => fetchLogs(true)} variant="outline" size="sm" className="premium-button">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search webhooks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 premium-input"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Event Type</label>
                <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                  <SelectTrigger className="h-11 premium-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    {uniqueEventTypes.map((eventType) => (
                      <SelectItem key={eventType} value={eventType}>
                        {safeFormatEventType(eventType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Time Range</label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="h-11 premium-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <div className="text-sm">
                  <div className="font-medium text-muted-foreground mb-1">Total Webhooks</div>
                  <div className="text-2xl font-bold text-foreground">{filteredLogs.length}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Logs Table */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="text-lg">Webhook Execution History</CardTitle>
            <CardDescription>
              Real-time logs from webhook executions and external integrations
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-sm text-muted-foreground">Loading webhook logs...</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold text-foreground">Time</TableHead>
                      <TableHead className="font-semibold text-foreground">Event Type</TableHead>
                      <TableHead className="font-semibold text-foreground">Lead ID</TableHead>
                      <TableHead className="font-semibold text-foreground">Results</TableHead>
                      <TableHead className="font-semibold text-foreground">Status</TableHead>
                      <TableHead className="font-semibold text-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => {
                      const resultsStatus = getResultsStatus(log.results);
                      return (
                        <TableRow key={log.id} className="hover:bg-muted/30 transition-colors duration-200">
                          <TableCell className="font-mono text-xs">
                            {format(new Date(log.executed_at), 'MMM dd HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getEventTypeIcon(log.event_type)}
                              <Badge variant={getEventTypeBadgeVariant(log.event_type)} className="text-xs font-medium">
                                {safeFormatEventType(log.event_type)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.lead_id ? (
                              <a 
                                href={`/lead/${log.lead_id}`}
                                className="text-primary hover:underline font-medium"
                              >
                                {safeGetLeadIdSlice(log.lead_id)}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {resultsStatus.count > 0 ? (
                              <span className="text-sm text-muted-foreground">
                                {resultsStatus.successCount || resultsStatus.count}/{resultsStatus.count} processed
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No results</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {resultsStatus.status === 'success' && (
                              <Badge variant="default" className="flex items-center gap-1 text-xs font-medium">
                                <CheckCircle className="h-3 w-3" />
                                Success
                              </Badge>
                            )}
                            {resultsStatus.status === 'partial' && (
                              <Badge variant="secondary" className="flex items-center gap-1 text-xs font-medium">
                                <AlertCircle className="h-3 w-3" />
                                Partial
                              </Badge>
                            )}
                            {resultsStatus.status === 'failed' && (
                              <Badge variant="destructive" className="flex items-center gap-1 text-xs font-medium">
                                <AlertCircle className="h-3 w-3" />
                                Failed
                              </Badge>
                            )}
                            {resultsStatus.status === 'unknown' && (
                              <Badge variant="outline" className="flex items-center gap-1 text-xs font-medium">
                                <Clock className="h-3 w-3" />
                                Unknown
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedLog(log)}
                                  className="h-8 w-8 p-0 rounded-lg hover:bg-accent/80"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[80vh] premium-card">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    {getEventTypeIcon(log.event_type)}
                                    Webhook Details - {safeFormatEventType(log.event_type)}
                                  </DialogTitle>
                                  <DialogDescription>
                                    Executed at {format(new Date(log.executed_at), 'PPpp')}
                                  </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="max-h-[60vh]">
                                  <div className="space-y-6">
                                    <div>
                                      <h4 className="font-semibold mb-3 text-foreground">Event Type</h4>
                                      <p className="text-sm bg-muted/50 p-4 rounded-lg border border-border/30">{safeFormatEventType(log.event_type)}</p>
                                    </div>
                                    
                                    {log.lead_id && (
                                      <div>
                                        <h4 className="font-semibold mb-3 text-foreground">Lead ID</h4>
                                        <p className="text-sm font-mono bg-muted/50 p-3 rounded-lg">{log.lead_id}</p>
                                      </div>
                                    )}
                                    
                                    {log.payload && (
                                      <div>
                                        <h4 className="font-semibold mb-3 text-foreground">Payload</h4>
                                        <pre className="text-xs bg-muted/50 p-4 rounded-lg border border-border/30 overflow-auto">
                                          {JSON.stringify(log.payload, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                    
                                    {log.results && (
                                      <div>
                                        <h4 className="font-semibold mb-3 text-foreground">Results</h4>
                                        <pre className="text-xs bg-muted/50 p-4 rounded-lg border border-border/30 overflow-auto">
                                          {JSON.stringify(log.results, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                </ScrollArea>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {filteredLogs.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No webhook logs found matching your criteria.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Load More Button */}
        {hasMore && filteredLogs.length > 0 && !loading && (
          <div className="flex justify-center">
            <Button
              onClick={loadMoreLogs}
              disabled={loadingMore}
              variant="outline"
              className="premium-button"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading More...
                </>
              ) : (
                'Load More Logs'
              )}
            </Button>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Successful</p>
                  <p className="text-2xl font-bold text-foreground">
                    {logs.filter(log => {
                      const status = getResultsStatus(log.results);
                      return status.status === 'success';
                    }).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Partial</p>
                  <p className="text-2xl font-bold text-foreground">
                    {logs.filter(log => {
                      const status = getResultsStatus(log.results);
                      return status.status === 'partial';
                    }).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-foreground">
                    {logs.filter(log => {
                      const status = getResultsStatus(log.results);
                      return status.status === 'failed';
                    }).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Webhook className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-foreground">{logs.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WebhookLogs;