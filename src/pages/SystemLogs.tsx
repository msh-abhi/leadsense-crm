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
  AlertTriangle,
  Info,
  AlertCircle,
  Bug,
  Filter,
  Calendar,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface LogEntry {
  id: string;
  created_at: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  function_name?: string;
  lead_id?: string;
  error_details?: any;
  context?: any;
}

const SystemLogs = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [functionFilter, setFunctionFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [dateRange, setDateRange] = useState('24h');

  useEffect(() => {
    fetchLogs(true);
  }, [dateRange]);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, levelFilter, functionFilter]);

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
        case '1h':
          startDate.setHours(now.getHours() - 1);
          break;
        case '24h':
          startDate.setDate(now.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
      }

      console.log('Fetching system logs', {
        function_name: 'SystemLogs',
        date_range: dateRange,
        start_date: startDate.toISOString(),
        limit: limit,
        offset: reset ? 0 : offset
      });

      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit)
        .range(reset ? 0 : offset, (reset ? 0 : offset) + limit - 1);

      if (error) {
        console.error('Error fetching logs from database:', error);
        throw error;
      }

      const logData = data || [];
      console.log(`Fetched ${logData.length} log entries from database (offset: ${reset ? 0 : offset})`);

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
      console.error('Error fetching logs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch system logs",
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

    if (searchTerm) {
      filtered = filtered.filter(log =>
        (log.message || '').toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.function_name || '').toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.lead_id || '').toString().includes(searchTerm)
      );
    }

    if (levelFilter !== 'all') {
      filtered = filtered.filter(log => log.level === levelFilter);
    }

    if (functionFilter !== 'all') {
      filtered = filtered.filter(log => log.function_name === functionFilter);
    }

    setFilteredLogs(filtered);
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'ERROR':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'WARN':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'INFO':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'DEBUG':
        return <Bug className="h-4 w-4 text-gray-500" />;
      default:
        return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const getLevelBadgeVariant = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'destructive';
      case 'WARN':
        return 'secondary';
      case 'INFO':
        return 'default';
      case 'DEBUG':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'Level', 'Function', 'Message', 'Lead ID', 'Error Details'].join(','),
      ...filteredLogs.map(log => [
        log.created_at,
        log.level,
        log.function_name || '',
        `"${log.message.replace(/"/g, '""')}"`,
        log.lead_id || '',
        log.error_details ? `"${JSON.stringify(log.error_details).replace(/"/g, '""')}"` : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "System logs have been exported to CSV",
    });
  };

  const uniqueFunctions = [...new Set(logs.map(log => log.function_name).filter(Boolean))];

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">System Logs</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Centralized logging for all CRM operations and integrations
          </p>
        </div>

        {/* Controls */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg">Log Filters</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 premium-input"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Level</label>
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="h-11 premium-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="ERROR">Error</SelectItem>
                    <SelectItem value="WARN">Warning</SelectItem>
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="DEBUG">Debug</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Function</label>
                <Select value={functionFilter} onValueChange={setFunctionFilter}>
                  <SelectTrigger className="h-11 premium-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Functions</SelectItem>
                    {uniqueFunctions.map((func) => (
                      <SelectItem key={func} value={func}>
                        {func}
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
                    <SelectItem value="1h">Last Hour</SelectItem>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <div className="text-sm">
                  <div className="font-medium text-muted-foreground mb-1">Total Logs</div>
                  <div className="text-2xl font-bold text-foreground">{filteredLogs.length}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="text-lg">System Logs</CardTitle>
            <CardDescription>
              Real-time logs from all CRM functions and integrations
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-sm text-muted-foreground">Loading logs...</p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold text-foreground">Time</TableHead>
                        <TableHead className="font-semibold text-foreground">Level</TableHead>
                        <TableHead className="font-semibold text-foreground">Function</TableHead>
                        <TableHead className="font-semibold text-foreground">Message</TableHead>
                        <TableHead className="font-semibold text-foreground">Lead ID</TableHead>
                        <TableHead className="font-semibold text-foreground">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/30 transition-colors duration-200">
                          <TableCell className="font-mono text-xs">
                            {format(new Date(log.created_at), 'MMM dd HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getLevelBadgeVariant(log.level)} className="flex items-center gap-1 text-xs font-medium">
                              {getLevelIcon(log.level)}
                              {log.level}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.function_name || 'N/A'}
                          </TableCell>
                          <TableCell className="max-w-md truncate text-muted-foreground">
                            {log.message || ''}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.lead_id ? (
                              <a
                                href={`/lead/${log.lead_id}`}
                                className="text-primary hover:underline font-medium"
                              >
                                {log.lead_id.slice(0, 8)}...
                              </a>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
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
                                    {getLevelIcon(log.level)}
                                    Log Details - {log.level}
                                  </DialogTitle>
                                  <DialogDescription>
                                    {format(new Date(log.created_at), 'PPpp')}
                                  </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="max-h-[60vh]">
                                  <div className="space-y-6">
                                    <div>
                                      <h4 className="font-semibold mb-3 text-foreground">Message</h4>
                                      <p className="text-sm bg-muted/50 p-4 rounded-lg border border-border/30">{log.message || 'No message'}</p>
                                    </div>

                                    {log.function_name && (
                                      <div>
                                        <h4 className="font-semibold mb-3 text-foreground">Function</h4>
                                        <p className="text-sm font-mono bg-muted/50 p-3 rounded-lg">{log.function_name}</p>
                                      </div>
                                    )}

                                    {log.lead_id && (
                                      <div>
                                        <h4 className="font-semibold mb-3 text-foreground">Lead ID</h4>
                                        <p className="text-sm font-mono bg-muted/50 p-3 rounded-lg">{log.lead_id}</p>
                                      </div>
                                    )}

                                    {log.error_details && (
                                      <div>
                                        <h4 className="font-semibold mb-3 text-foreground">Error Details</h4>
                                        <pre className="text-xs bg-muted/50 p-4 rounded-lg border border-border/30 overflow-auto">
                                          {JSON.stringify(log.error_details, null, 2)}
                                        </pre>
                                      </div>
                                    )}

                                    {log.context && (
                                      <div>
                                        <h4 className="font-semibold mb-3 text-foreground">Context</h4>
                                        <pre className="text-xs bg-muted/50 p-4 rounded-lg border border-border/30 overflow-auto">
                                          {JSON.stringify(log.context, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                </ScrollArea>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {filteredLogs.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      No logs found matching your criteria.
                    </div>
                  )}
                </div>

                {/* Load More Button */}
                {hasMore && filteredLogs.length > 0 && (
                  <div className="flex justify-center mt-6">
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Errors</p>
                  <p className="text-2xl font-bold text-foreground">
                    {logs.filter(log => log.level === 'ERROR').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Warnings</p>
                  <p className="text-2xl font-bold text-foreground">
                    {logs.filter(log => log.level === 'WARN').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Info</p>
                  <p className="text-2xl font-bold text-foreground">
                    {logs.filter(log => log.level === 'INFO').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="premium-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-600">
                  <Bug className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Debug</p>
                  <p className="text-2xl font-bold text-foreground">
                    {logs.filter(log => log.level === 'DEBUG').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SystemLogs;